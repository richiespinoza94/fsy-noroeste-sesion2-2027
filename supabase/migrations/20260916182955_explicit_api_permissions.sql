-- Only the three server-side AI RPCs; no service_role grants are changed.
-- The current worker calls claim/finish; the browser calls neither.
revoke execute on function public.apply_document_validation(uuid,text,text,jsonb,jsonb,boolean,boolean,text) from public, anon, authenticated;
revoke execute on function public.claim_document_analysis(uuid) from public, anon, authenticated;
revoke execute on function public.finish_document_analysis(uuid,integer,jsonb,text) from public, anon, authenticated;
notify pgrst, 'reload schema';

