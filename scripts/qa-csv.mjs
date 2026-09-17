import assert from 'node:assert/strict'
import { readCsv, previewRegistrationCsv, REGISTRATION_COLUMNS } from '../src/lib/registrationCsv.ts'
const fields = Object.fromEntries(REGISTRATION_COLUMNS.map(k => [k, '']))
Object.assign(fields, { Estaca: 'Norte', Barrio: 'Centro', 'Nombre de pila': 'Ana María', Apellido: 'Prueba', 'Fecha de nacimiento': '2010-01-01', Sexo: 'Mujer', 'Tipo de solicitud': 'Participante', 'Información médica': 'Texto, con "comillas"\ny dos líneas' })
const csv = (rows, sep=',') => '\uFEFF' + [REGISTRATION_COLUMNS, ...rows.map(r => REGISTRATION_COLUMNS.map(k => r[k]))].map(row => row.map(v => '"' + v.replaceAll('"', '""') + '"').join(sep)).join('\r\n')
for (const sep of [',', ';']) {
  const result = previewRegistrationCsv(csv([fields], sep))
  assert.deepEqual(result.rows[0], fields)
  assert.equal(result.errors.length, 0)
}
assert.ok(previewRegistrationCsv(csv([fields, fields])).errors.some(e => e.includes('repetido')))
assert.ok(previewRegistrationCsv(csv([{...fields, 'Tipo de solicitud':'Consejero'}])).errors.some(e => e.includes('consejeros')))
assert.ok(previewRegistrationCsv(csv([{...fields, 'Fecha de nacimiento':'2010-02-31'}])).errors.some(e => e.includes('fecha inválida')))
assert.throws(() => readCsv('a,b\n"sin cerrar'), /sin cerrar/)
assert.throws(() => readCsv('a,b\n"a"x,b'), /Comillas/)
assert.throws(() => previewRegistrationCsv('Estaca,Barrio\nNorte,Centro'), /Faltan columnas/)
assert.equal(REGISTRATION_COLUMNS.length,28)
console.log('OK CSV: 28 campos, delimitadores, UTF-8, respuestas multilínea, fechas, duplicados y consejeros.')
