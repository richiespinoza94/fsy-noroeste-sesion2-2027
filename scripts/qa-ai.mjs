import assert from 'node:assert/strict'
import { parseResult, observationFor } from '../supabase/functions/validate-document/parse.ts'
import { calcularBandaConfianza, puedeAutoValidarse } from '../supabase/functions/validate-document/prompts.ts'
const valid = { formatoCorresponde:true,tipoDetectado:null,documentoLegible:true,problemasCalidad:[],todasLasPaginasPresentes:true,nombreIdentificado:true,nombreExtraido:'Persona de prueba',consistenciaNombre:'coincide',firmaDetectada:null,datos:{nombre:'Persona de prueba'},camposFaltantes:[],mensajeSiFalla:null }
assert.equal(observationFor(parseResult(JSON.stringify(valid))), null)
assert.equal(calcularBandaConfianza(valid), 'alta')
assert.equal(puedeAutoValidarse('REGISTRATION_FORM',valid),false)
for (const patch of [{formatoCorresponde:'false'}, {todasLasPaginasPresentes:undefined}, {datos:[]}, {datos:{nombre:42}}, {camposFaltantes:[{}]}, {firmaDetectada:'true'}]) assert.throws(() => parseResult(JSON.stringify({...valid,...patch})))
for (const patch of [{formatoCorresponde:false}, {documentoLegible:false}, {todasLasPaginasPresentes:false}, {problemasCalidad:['DOCUMENTO_CORTADO']}, {consistenciaNombre:'revisar'}, {camposFaltantes:['firma']}]) assert.ok(observationFor({...valid,...patch}))
assert.notEqual(calcularBandaConfianza({...valid,problemasCalidad:['DESENFOQUE']}),'alta')
assert.throws(() => parseResult('null'))
assert.throws(() => parseResult('not JSON'))
console.log('OK: contrato estricto, formato incorrecto, desenfoque, corte, páginas, firma, nombre y aprobación humana.')
