-- Ejecutar en SQL Editor tras 001-005. Solo lectura; no muestra datos personales.
select 'RPC ' || signature as comprobacion,
       to_regprocedure(signature) is not null as correcto
from unnest(array[
 'public.create_enrollment(uuid,jsonb)',
 'public.start_replacement(uuid,jsonb,text)',
 'public.transition_replacement(uuid,text,text)',
 'public.attach_document_version(uuid,uuid)',
 'public.review_document(uuid,text,text)',
 'public.confirm_participant(uuid)',
 'public.retry_document_analysis(uuid)'
]) as signatures(signature)
union all
select 'RLS ' || name,
 coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.'||name)),false)
from unnest(array['participants','registration_slots','documents','document_versions','replacement_requests']) as tables(name)
union all
select 'Bucket documental privado',exists(select 1 from storage.buckets where id='participant-documents' and not public)
union all
select 'Indicador de candidato',exists(select 1 from information_schema.columns where table_schema='public' and table_name='participants' and column_name='is_replacement_candidate')
union all
select 'Una solicitud abierta por cupo',exists(select 1 from pg_index where indexrelid=to_regclass('public.one_open_replacement_per_slot') and indisunique and indisvalid)
union all
select 'Sin escritura directa de solicitudes',
 not has_table_privilege('authenticated','public.replacement_requests','INSERT')
 and not has_table_privilege('authenticated','public.replacement_requests','UPDATE')
 and not has_table_privilege('authenticated','public.replacement_requests','DELETE');
-- Todos deben ser true. Esta comprobación no sustituye las pruebas de permisos
-- con cuentas reales ni la prueba completa de Auth, Storage, PostgREST y OCR.
