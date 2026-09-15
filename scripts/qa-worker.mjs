import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
const calls=[]
let handler, claim=1, fetchCalls=0, responseMode='ok'
const result={formatoCorresponde:true,tipoDetectado:null,documentoLegible:true,problemasCalidad:[],todasLasPaginasPresentes:true,nombreIdentificado:true,nombreExtraido:'Test',consistenciaNombre:'coincide',firmaDetectada:null,datos:{nombre:'Test'},camposFaltantes:[],mensajeSiFalla:null}
globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test-secret',GEMINI_API_KEY:'test-ai-key'}[key])},serve:fn=>handler=fn}
globalThis.testDb={
  rpc:async(name,args)=>{ calls.push([name,args]); return { data:name==='claim_document_analysis'?claim:null,error:null } },
  from:()=>({select:()=>({eq:()=>({single:async()=>({data:{storage_path:'test.png',mime_type:'image/png',documents:{document_type:'REGISTRATION_FORM',participants:{first_name:'Test',last_name:'Person'}}}})})})}),
  storage:{from:()=>({download:async()=>({data:new Blob(['test'],{type:'image/png'})})})}
}
registerHooks({resolve(specifier,context,next){if(specifier==='npm:@supabase/supabase-js@2')return {url:'data:text/javascript,export const createClient = () => globalThis.testDb;',shortCircuit:true};return next(specifier,context)}})
const originalFetch=globalThis.fetch
globalThis.fetch=async(url,options)=>{
  fetchCalls++
  assert.ok(options.signal instanceof AbortSignal)
  assert.equal(options.headers['x-goog-api-key'],'test-ai-key')
  assert.ok(!url.includes('test-ai-key'))
  if(responseMode==='timeout')throw new DOMException('Timeout','TimeoutError')
  if(responseMode==='429' && fetchCalls===1)return new Response('',{status:429})
  if(responseMode==='500')return new Response('sensitive provider body',{status:500})
  return Response.json({candidates:[{content:{parts:[{text:responseMode==='invalid'?'{}':JSON.stringify(result)}]}}]})
}
await import('../supabase/functions/validate-document/index.ts')
const request=(auth='test-secret',body={document_version_id:'00000000-0000-4000-8000-000000000001'})=>new Request('https://example.test',{method:'POST',headers:{Authorization:`Bearer ${auth}`},body:JSON.stringify(body)})
assert.equal((await handler(request('ordinary-user-token'))).status,401)
assert.equal(calls.length,0)
assert.equal((await handler(request('test-secret',{}))).status,400)
assert.equal((await handler(new Request('https://example.test'))).status,405)
assert.equal((await handler(request())).status,200)
assert.equal(calls.at(-1)[0],'finish_document_analysis')
assert.equal(calls.at(-1)[1].p_result.documentoLegible,true)
claim=null;fetchCalls=0
assert.equal((await handler(request())).status,200);assert.equal(fetchCalls,0)
claim=2
for(const mode of ['invalid','timeout','500']){
  responseMode=mode;fetchCalls=0
  assert.equal((await handler(request())).status,503)
  assert.equal(calls.at(-1)[1].p_result,null)
}
responseMode='429';fetchCalls=0
assert.equal((await handler(request())).status,200);assert.equal(fetchCalls,2)
globalThis.fetch=originalFetch
console.log('OK worker: autenticación, payload inválido, duplicado, proveedor inválido, timeout, 500 y recuperación 429.')
