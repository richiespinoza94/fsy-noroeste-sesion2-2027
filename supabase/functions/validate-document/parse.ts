import type { DocumentValidationResult } from './prompts.ts'

// Provider output is untrusted: missing checks and string booleans must fail closed.
export function parseResult(text: string): DocumentValidationResult {
  const r = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim())
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('INVALID_AI_RESULT')
  for (const key of ['formatoCorresponde', 'documentoLegible', 'todasLasPaginasPresentes', 'nombreIdentificado']) {
    if (typeof r[key] !== 'boolean') throw new Error('INVALID_AI_RESULT')
  }
  if (!['coincide', 'revisar', 'no_aplica'].includes(r.consistenciaNombre)
    || !(r.firmaDetectada === null || typeof r.firmaDetectada === 'boolean')
    || !r.datos || typeof r.datos !== 'object' || Array.isArray(r.datos)
    || Object.values(r.datos).some(v => v !== null && typeof v !== 'string')) throw new Error('INVALID_AI_RESULT')
  for (const key of ['problemasCalidad', 'camposFaltantes']) {
    if (!Array.isArray(r[key]) || r[key].some((v: unknown) => typeof v !== 'string' || v.length > 300)) throw new Error('INVALID_AI_RESULT')
  }
  for (const key of ['tipoDetectado', 'nombreExtraido', 'mensajeSiFalla']) {
    if (r[key] !== null && typeof r[key] !== 'string') throw new Error('INVALID_AI_RESULT')
  }
  return r
}

export function observationFor(r: DocumentValidationResult): string | null {
  if (!r.formatoCorresponde) return 'El archivo parece corresponder a otro documento. Comprueba el tipo solicitado.'
  if (!r.documentoLegible) return 'Necesitamos una foto más nítida. Usa buena luz y evita reflejos.'
  if (!r.todasLasPaginasPresentes || r.problemasCalidad.includes('DOCUMENTO_CORTADO')) return 'Muestra las cuatro esquinas e incluye todas las páginas del documento.'
  if (r.camposFaltantes.length) return 'Hay campos o firmas por revisar. El equipo FSY verificará el documento.'
  if (r.consistenciaNombre === 'revisar') return 'El nombre necesita una revisión del equipo FSY.'
  if (r.problemasCalidad.length) return 'La calidad de la imagen necesita una revisión del equipo FSY.'
  return null
}
