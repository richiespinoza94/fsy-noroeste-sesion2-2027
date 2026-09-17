export const REGISTRATION_COLUMNS = [
  'Estaca', 'Barrio', 'Nombre de pila', 'Apellido', 'Nombre preferido', 'Fecha de nacimiento',
  'Sexo', 'Tipo de solicitud', 'Teléfono', 'Correo electrónico',
  'Contacto emergencia 1 nombre', 'Contacto emergencia 1 correo', 'Contacto emergencia 1 teléfono',
  'Contacto emergencia 2 nombre', 'Contacto emergencia 2 correo', 'Contacto emergencia 2 teléfono',
  'Obispo', 'Información médica', 'Información alimentaria', 'Talla de camiseta',
  'Grupo sanguíneo y RH', 'Alergias', 'Tratamiento médico', 'Diabetes o asma', 'Seguro médico',
  'Acepta condiciones y conducta', 'Nombre del firmante', 'Referencia de firma',
] as const

const normalized = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ')
const aliases: Record<string, string> = {
  'Estaca / Distrito / Misión': 'Estaca', 'Barrio / Rama': 'Barrio',
  'Nombre que se prefiere': 'Nombre preferido', 'Cumpleaños': 'Fecha de nacimiento',
  'Número de teléfono': 'Teléfono', 'Grupo sanguíneo y factor (RH)': 'Grupo sanguíneo y RH',
  'Tu nombre': 'Nombre del firmante', 'Tu firma': 'Referencia de firma',
}

// A bounded RFC-style reader: quoted delimiters, escaped quotes and multiline answers.
export function readCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, '')
  let quoted = false
  let first = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted
    if (!quoted && /[\r\n]/.test(text[i])) break
    first += text[i]
  }
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], field = '', closed = false
  quoted = false
  const pushRow = () => { row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ''; closed = false }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else { quoted = false; closed = true } }
      else field += c
    } else if (c === delimiter) { row.push(field); field = ''; closed = false }
    else if (c === '\n' || c === '\r') { pushRow(); if (c === '\r' && text[i + 1] === '\n') i++ }
    else if (c === '"' && !field && !closed) quoted = true
    else { if (closed || c === '"') throw new Error('Comillas incorrectas en el CSV.'); field += c }
  }
  if (quoted) throw new Error('Hay una respuesta con comillas sin cerrar.')
  pushRow()
  return rows
}

export interface CsvPreview { rows: Record<string, string>[]; errors: string[]; warnings: string[]; headers: string[] }
export function previewRegistrationCsv(source: string): CsvPreview {
  if (source.length > 2_000_000) throw new Error('El CSV supera el límite de 2 MB.')
  const [originalHeaders, ...values] = readCsv(source)
  if (!originalHeaders || !values.length) throw new Error('Incluye encabezados y al menos un inscrito.')
  if (values.length > 500) throw new Error('Carga hasta 500 inscritos por archivo.')
  const lookup = new Map(REGISTRATION_COLUMNS.map(c => [normalized(c), c as string]))
  Object.entries(aliases).forEach(([key, value]) => lookup.set(normalized(key), value))
  const headers = originalHeaders.map(h => lookup.get(normalized(h)) ?? h.trim())
  if (headers.some(h => !h) || new Set(headers.map(normalized)).size !== headers.length) throw new Error('Hay encabezados vacíos o repetidos.')
  const missing = REGISTRATION_COLUMNS.filter(c => !headers.includes(c))
  if (missing.length) throw new Error(`Faltan columnas: ${missing.join(', ')}. Usa los encabezados de la plantilla.`)
  const errors: string[] = [], warnings: string[] = [], seen = new Set<string>()
  const rows = values.map((values, index) => {
    const line = index + 2
    if (values.length !== headers.length) errors.push(`Registro ${line}: cantidad de columnas incorrecta.`)
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
    for (const key of ['Estaca', 'Barrio', 'Nombre de pila', 'Apellido', 'Fecha de nacimiento']) {
      if (!row[key].trim()) errors.push(`Registro ${line}: falta ${key}.`)
    }
    const date = row['Fecha de nacimiento'].trim()
    const parsed = new Date(date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10)) errors.push(`Registro ${line}: fecha inválida; usa AAAA-MM-DD.`)
    if (!['Hombre', 'Mujer'].includes(row.Sexo.trim())) errors.push(`Registro ${line}: sexo debe ser Hombre o Mujer.`)
    if (row['Tipo de solicitud'].trim() !== 'Participante') errors.push(`Registro ${line}: esta carga es solo para Participante; separa los consejeros.`)
    const signature = ['Nombre de pila', 'Apellido', 'Fecha de nacimiento'].map(k => normalized(row[k])).join('|')
    if (seen.has(signature)) errors.push(`Registro ${line}: posible inscrito repetido; revisa antes de cargar.`)
    seen.add(signature)
    if (REGISTRATION_COLUMNS.some(c => !row[c].trim())) warnings.push(`Registro ${line}: tiene respuestas vacías; se conservarán sin completar.`)
    return row
  })
  return { rows, errors, warnings, headers }
}
