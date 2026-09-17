import { PGlite } from '../.qa-tools/node_modules/@electric-sql/pglite/dist/index.js'

import fs from 'node:fs'

import assert from 'node:assert/strict'
import { REGISTRATION_COLUMNS } from '../src/lib/registrationCsv.ts'

const db = new PGlite()

await db.exec(`

create role anon; create role authenticated; create role service_role bypassrls;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth; create schema storage; create schema net;

create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');

create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;

create function auth.role() returns text language sql stable as $$ select current_setting('test.role',true) $$;

create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);

create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);

alter table storage.objects enable row level security;

create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;

create function storage.extension(text) returns text language sql as $$ select reverse(split_part(reverse($1),'.',1)) $$;

create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer default 1000) returns bigint language sql as $$ select 1::bigint $$;

grant usage on schema public,auth,storage to authenticated,service_role;

alter default privileges in schema public grant all on tables to authenticated,service_role;

grant all on all tables in schema storage to authenticated,service_role;

`)

for (const file of fs.readdirSync('supabase/migrations').sort()) {

  await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8').replace(/create extension if not exists \w+;/g,''))

  console.log(`OK migration ${file}`)

}

const readiness = await db.query(fs.readFileSync('supabase/check_mvp3.sql','utf8'))
assert.ok(readiness.rows.length > 0)
for (const row of readiness.rows) assert.equal(row.correcto,true,row.comprobacion)
console.log('OK comprobaciones de preparación MVP3')
await db.exec(fs.readFileSync('supabase/seed.sql','utf8'))

const unit='20270000-0000-4000-8000-000000000201', leader='00000000-0000-4000-8000-000000000001',admin='00000000-0000-4000-8000-000000000002'

await db.query(`insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values ($1,'leader@test', '{"role":"SUPER_ADMIN"}', $3),($2,'admin@test','{}','{"role":"SESSION_ADMIN"}')`,[leader,admin,JSON.stringify({unit_id:unit})])

assert.equal((await db.query('select role from profiles where id=$1',[leader])).rows[0].role,'UNIT_LEADER')

const actor=async(id,role='authenticated')=>{ await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false),set_config('test.role',$2,false)",[id,role]);await db.exec(`set role ${role}`) }

await actor(admin)

await db.query(`select create_participant_with_slot($1,'Test',null,'Person',null,null,'2010-01-01','Hombre','12345678')`,[unit])

const person=(await db.query('select id from participants')).rows[0].id

await actor(leader)

assert.equal((await db.query('select document_number_masked from participants')).rows[0].document_number_masked,'DNI ••••••78')

await assert.rejects(db.query('select document_number from participants'),/permission denied/)

await assert.rejects(db.query('select confirm_participant($1)',[person]),/NOT_ALLOWED/)

const doc=(await db.query("insert into documents(participant_id,document_type) values($1,'REGISTRATION_FORM') returning id",[person])).rows[0].id

const storagePath=`${unit}/${person}/${doc}/test.pdf`

await db.query("insert into storage.objects(bucket_id,name) values ('participant-documents',$1)",[storagePath])

const v=(await db.query("insert into document_versions(document_id,version_number,storage_path,mime_type,file_size,file_name,uploaded_by,status) values($1,1,$2,'application/pdf',10,'test.pdf',$3,'UNDER_REVIEW') returning id",[doc,storagePath,leader])).rows[0].id

await assert.rejects(db.query("insert into document_versions(document_id,version_number,storage_path,mime_type,file_size,file_name,uploaded_by,status,ai_status) values($1,2,$2,'application/pdf',10,'test.pdf',$3,'UNDER_REVIEW','COMPLETE')",[doc,storagePath,leader]),/permission denied/)

await db.query('select attach_document_version($1,$2)',[doc,v])

assert.equal((await db.query('select ai_status from document_versions where id=$1',[v])).rows[0].ai_status,'UNAVAILABLE')

await assert.rejects(db.query("select review_document($1,'APPROVED','')",[v]),/NOT_ALLOWED/)

await db.exec('reset role')

await db.exec("update private.app_config set value=case when key='edge_function_url' then 'https://example.test/worker' else 'test-secret' end")

await actor(leader)

await assert.rejects(db.query('select retry_document_analysis($1)',[v]),/RETRY_NOT_ALLOWED/)

await db.exec('reset role')

await db.query("update document_versions set ai_updated_at=now()-interval '3 minutes' where id=$1",[v])

await actor(leader)

await db.query('select retry_document_analysis($1)',[v])

await actor(admin,'service_role')

assert.equal((await db.query('select claim_document_analysis($1) as n',[v])).rows[0].n,1)

assert.equal((await db.query('select claim_document_analysis($1) as n',[v])).rows[0].n,null)

await db.query('select finish_document_analysis($1,1,null,null)',[v])

assert.equal((await db.query('select ai_status from document_versions where id=$1',[v])).rows[0].ai_status,'FAILED')

await db.exec('reset role')

await db.query("update document_versions set ai_updated_at=now()-interval '3 minutes',ai_attempts=3 where id=$1",[v])

await actor(leader)

await assert.rejects(db.query('select retry_document_analysis($1)',[v]),/RETRY_NOT_ALLOWED/)

await actor(admin)

await assert.rejects(db.query('select confirm_participant($1)',[person]),/DOCUMENTS_INCOMPLETE/)

await assert.rejects(db.query("select review_document($1,'OBSERVED','')",[v]),/NOTE_REQUIRED/)

await db.query("select review_document($1,'OBSERVED','Nueva foto completa')",[v])

assert.equal((await db.query('select status from participants where id=$1',[person])).rows[0].status,'OBSERVED')

await db.exec('reset role')

await db.query("update document_versions set ai_status='PENDING' where id=$1",[v])

await actor(admin,'service_role')

assert.equal((await db.query('select claim_document_analysis($1) as attempt',[v])).rows[0].attempt,null) // human already observed it

await actor(admin)

await db.query("select review_document($1,'APPROVED','')",[v])

await db.exec('reset role')

await db.query("update document_versions set ai_status='PROCESSING',ai_attempts=1 where id=$1",[v])

await actor(admin,'service_role')

await db.query("select finish_document_analysis($1,1,$2,'Revisar')",[v,JSON.stringify({confidence:'baja',problemasCalidad:['DESENFOQUE']})])

assert.equal((await db.query('select status from documents where id=$1',[doc])).rows[0].status,'APPROVED')

await actor(admin)

await db.exec("update document_requirements set required=false where document_type<>'REGISTRATION_FORM'")

await db.query('select confirm_participant($1)',[person])

assert.equal((await db.query('select status from participants where id=$1',[person])).rows[0].status,'CONFIRMED')

await assert.rejects(db.query("select review_document($1,'OBSERVED','Test')",[v]),/PARTICIPANT_LOCKED/)

await actor(leader)

assert.equal((await db.query('select * from document_validations')).rows.length,0)

await assert.rejects(db.query('select ai_result from document_versions'),/permission denied/)

await db.exec('reset role')

await actor(leader)

const candidate={firstName:'Entrante',lastName:'Prueba',birthDate:'2010-02-02',sex:'Hombre',guardianFirstName:'Tutor',guardianLastName:'Prueba'}

await assert.rejects(db.query('select start_replacement($1,$2,$3)',[person,JSON.stringify({...candidate,sex:'Mujer'}),'Cambio']),/SEX_MISMATCH/)

const start=async()=> (await db.query('select start_replacement($1,$2,$3) as id',[person,JSON.stringify(candidate),'No asistirá'])).rows[0].id

const incoming=await start()

const req=(await db.query('select * from replacement_requests where incoming_participant_id=$1',[incoming])).rows[0]

assert.equal((await db.query('select count(*)::int as n from registration_slots')).rows[0].n,1)

assert.equal((await db.query('select current_participant_id from registration_slots')).rows[0].current_participant_id,person)

await assert.rejects(start(),/REPLACEMENT_EXISTS/)

await assert.rejects(db.query("select transition_replacement($1,'SUBMITTED')",[req.id]),/DOCUMENTS_INCOMPLETE/)

await actor(admin)

await assert.rejects(db.query('select confirm_participant($1)',[incoming]),/PARTICIPANT_LOCKED/)

await assert.rejects(db.query("select review_document($1,'OBSERVED','Cambio')",[v]),/PARTICIPANT_LOCKED/)

await actor(leader)

await db.query("select transition_replacement($1,'CANCELLED')",[req.id])

assert.equal((await db.query('select status from participants where id=$1',[person])).rows[0].status,'CONFIRMED')

const next=await start()

const nextReq=(await db.query('select id from replacement_requests where incoming_participant_id=$1',[next])).rows[0].id

const nd=(await db.query("insert into documents(participant_id,document_type) values($1,'REGISTRATION_FORM') returning id",[next])).rows[0].id

const np=`${unit}/${next}/${nd}/test.pdf`

await db.query("insert into storage.objects(bucket_id,name) values('participant-documents',$1)",[np])

const nv=(await db.query("insert into document_versions(document_id,version_number,storage_path,mime_type,file_size,file_name,uploaded_by,status) values($1,1,$2,'application/pdf',10,'test.pdf',$3,'UNDER_REVIEW') returning id",[nd,np,leader])).rows[0].id

await db.query('select attach_document_version($1,$2)',[nd,nv])

await db.query("select transition_replacement($1,'SUBMITTED')",[nextReq])

await assert.rejects(db.query("select transition_replacement($1,'APPROVED')",[nextReq]),/NOT_ALLOWED/)

await actor(admin)

await assert.rejects(db.query("select transition_replacement($1,'APPROVED')",[nextReq]),/DOCUMENTS_INCOMPLETE/)

await db.query("select review_document($1,'APPROVED','')",[nv])

await db.query("select transition_replacement($1,'APPROVED')",[nextReq])

assert.equal((await db.query('select current_participant_id from registration_slots')).rows[0].current_participant_id,next)

assert.equal((await db.query('select count(*)::int as n from registration_slots')).rows[0].n,1)

assert.equal((await db.query('select status from participants where id=$1',[person])).rows[0].status,'REPLACED')

await assert.rejects(db.query("select transition_replacement($1,'APPROVED')",[nextReq]),/INVALID_TRANSITION/)

// A rejected request restores the current holder; a closed session rejects new requests.

await actor(leader)

const rejectedPerson=(await db.query('select start_replacement($1,$2,$3) as id',[next,JSON.stringify(candidate),'Otra propuesta'])).rows[0].id

const rejectedReq=(await db.query('select id from replacement_requests where incoming_participant_id=$1',[rejectedPerson])).rows[0].id

// Fixture only: isolate the rejection transition from the already tested document path.

await db.exec('reset role')

await db.query("update replacement_requests set status='SUBMITTED' where id=$1",[rejectedReq])

await actor(admin)

await assert.rejects(db.query("select transition_replacement($1,'REJECTED','')",[rejectedReq]),/NOTE_REQUIRED/)

await db.query("select transition_replacement($1,'REJECTED','Solicitud retirada')",[rejectedReq])

assert.equal((await db.query('select status from participants where id=$1',[next])).rows[0].status,'CONFIRMED')

assert.equal((await db.query('select status from participants where id=$1',[rejectedPerson])).rows[0].status,'CANCELLED')

await db.exec('reset role')

await db.exec("update sessions set deadline=current_date-1")

await actor(leader)

await assert.rejects(db.query('select start_replacement($1,$2,$3)',[next,JSON.stringify(candidate),'Fuera de plazo']),/DEADLINE_CLOSED/)

console.log('OK MVP3 SQL: mismo cupo, roles, sexo, duplicados, expediente congelado, cancelación y aprobación atómica.')

await db.exec('reset role')

await db.query('update profiles set unit_id=null where id=$1',[leader])

await actor(leader)

assert.equal((await db.query('select id from participants')).rows.length,0)

await assert.rejects(db.query('select retry_document_analysis($1)',[v]),/NOT_ALLOWED/)

console.log('OK: RLS, DNI, permisos de revisión, metadata, estados IA protegidos, fallo seguro y resultado tardío.')

assert.equal((await db.query('select id from replacement_requests')).rows.length,0)

await assert.rejects(db.query('select start_replacement($1,$2,$3)',[next,JSON.stringify(candidate),'Sin acceso']),/NOT_ALLOWED/)

await actor(admin)
const csvSession = (await db.query('select id from sessions limit 1')).rows[0].id
const csvRow = Object.fromEntries(REGISTRATION_COLUMNS.map(k=>[k,'']))
Object.assign(csvRow,{Estaca:'Estaca CSV',Barrio:'Barrio CSV','Nombre de pila':'Persona CSV',Apellido:'Prueba','Fecha de nacimiento':'2010-01-01',Sexo:'Mujer','Tipo de solicitud':'Participante','Información médica':'Original, con coma\ny salto',Extra:'Campo adicional'})
const importCsv = rows=>db.query('select public.import_registration_csv($1,$2) as result',[csvSession,JSON.stringify(rows)])
assert.equal((await importCsv([csvRow])).rows[0].result.imported,1)
assert.deepEqual((await db.query('select source_answers from registration_forms')).rows[0].source_answers,csvRow)
assert.equal((await importCsv([csvRow])).rows[0].result.skipped,1)
await assert.rejects(importCsv([{...csvRow,'Información médica':'Cambio'}]),/POSSIBLE_DUPLICATE/)
await assert.rejects(importCsv([{...csvRow,'Nombre de pila':'No debe persistir'},{...csvRow,'Nombre de pila':'Consejero','Tipo de solicitud':'Consejero'}]),/PARTICIPANTS_ONLY/)
assert.equal((await db.query("select id from participants where first_name='No debe persistir'")).rows.length,0)
const {Extra,...incomplete}=csvRow; delete incomplete.Barrio
await assert.rejects(importCsv([incomplete]),/MISSING_CSV_COLUMNS/)
await actor(leader)
await assert.rejects(importCsv([csvRow]),/NOT_ALLOWED/)
assert.equal((await db.query('select * from registration_forms')).rows.length,0)
await assert.rejects(db.query('delete from registration_forms'),/permission denied/)
await db.exec('reset role')
assert.equal((await db.query("select has_function_privilege('anon','public.import_registration_csv(uuid,jsonb)','execute') as allowed")).rows[0].allowed,false)
console.log('OK CSV SQL: conservación completa, reintentos, duplicados, rollback integral y permisos.')
await db.close()

