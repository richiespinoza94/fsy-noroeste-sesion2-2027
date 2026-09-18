import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
let handler, actorRole='SUPER_ADMIN', targetRole='UNIT_LEADER', occupied=false, existingUsername=false, creates=[], resets=[]
globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'server-secret'}[key])},serve:fn=>handler=fn}
globalThis.testUserDb={
  auth:{getUser:async token=>({data:{user:token==='valid'?{id:'admin-id'}:null},error:null}),admin:{createUser:async input=>{creates.push(input);return {data:{user:{id:'created-id'}},error:null}},updateUserById:async(id,input)=>{resets.push([id,input]);return {error:null}}}},
  from(table){
    const filters={}
    const query={select:()=>query,eq:(k,v)=>{filters[k]=v;return query},single:async()=>({data:{role:filters.id==='admin-id'?actorRole:targetRole},error:null}),maybeSingle:async()=>({data:table==='units'?{id:'unit-id'}:filters.unit_id?(occupied?{id:'occupied'}:null):(existingUsername?{id:'existing'}:null),error:null})}
    return query
  },
}
registerHooks({resolve(specifier,context,next){if(specifier==='npm:@supabase/supabase-js@2.116.0')return {url:'data:text/javascript,export const createClient = () => globalThis.testUserDb;',shortCircuit:true};return next(specifier,context)}})
await import('../supabase/functions/create-portal-user/index.ts')
const input={username:'barrio.prueba',password:'Solo-prueba-123!',displayName:'Barrio prueba',role:'UNIT_LEADER',unitId:'00000000-0000-4000-8000-000000000201'}
const request=(body=input,token='valid')=>new Request('https://example.test',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(body)})
assert.equal((await handler(request(input,'invalid'))).status,401)
for(const role of ['UNIT_LEADER','REVIEWER','SESSION_ADMIN']){actorRole=role;assert.equal((await handler(request())).status,403)}
assert.equal(creates.length,0)
actorRole='SUPER_ADMIN'
assert.equal((await handler(request({...input,role:'SUPER_ADMIN'}))).status,400)
assert.equal((await handler(request({...input,password:'short'}))).status,400)
assert.equal((await handler(request({...input,unitId:null}))).status,400)
occupied=true;assert.equal((await handler(request())).status,409);occupied=false
existingUsername=true;assert.equal((await handler(request())).status,409);existingUsername=false
const response=await handler(request())
assert.equal(response.status,201)
assert.ok(!(await response.text()).includes(input.password))
assert.deepEqual(creates[0].app_metadata,{role:'UNIT_LEADER',unit_id:input.unitId,created_by:'admin-id'})
assert.equal(creates[0].email,'barrio.prueba@fsy.local')
assert.equal((await handler(request({...input,username:'supervisor.prueba',role:'REVIEWER',unitId:null}))).status,201)
assert.equal(creates[1].app_metadata.role,'REVIEWER')
assert.equal(creates[1].app_metadata.unit_id,null)
console.log('OK cuentas: autenticación, solo SUPER_ADMIN, roles limitados, barrio único, contraseña y metadata de servidor.')
const reset={action:'reset_password',userId:input.unitId,password:'Otra-clave-123!'}
actorRole='REVIEWER';assert.equal((await handler(request(reset))).status,403)
assert.equal(resets.length,0)
actorRole='SUPER_ADMIN';targetRole='SUPER_ADMIN';assert.equal((await handler(request(reset))).status,403)
targetRole='UNIT_LEADER';const resetResult=await handler(request(reset));assert.equal(resetResult.status,200)
assert.ok(!(await resetResult.text()).includes(reset.password))
assert.equal(resets[0][1].app_metadata.password_reset_by,'admin-id')
assert.equal((await handler(request({...reset,password:'short'}))).status,400)
console.log('OK restablecimiento: solo administrador principal, objetivo autorizado y sin contraseñas en respuesta.')
