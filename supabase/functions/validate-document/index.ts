// MVP2: authenticated worker, enqueued only after the version is attached.
// Results assist a human reviewer and never change document decisions.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  buildValidationPrompt,
  calcularBandaConfianza,
  type DocumentType,
  type DocumentValidationResult,
} from './prompts.ts'

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest'
const GEMINI_REINTENTOS = 2
const GEMINI_ESPERA_BASE_MS = 4000
import { parseResult, observationFor } from './parse.ts'

const BUCKET = 'participant-documents'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) return json({ error: 'NOT_ALLOWED' }, 401)
  let documentVersionId: string
  try {
    documentVersionId = (await req.json()).document_version_id
    if (typeof documentVersionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentVersionId)) throw new Error()
  } catch { return json({ error: 'BAD_REQUEST' }, 400) }
  const claim = await supabase.rpc('claim_document_analysis', { p_version_id: documentVersionId })
  if (claim.error) return json({ error: 'CLAIM_FAILED' }, 503)
  if (!claim.data) return json({ ok: true, skipped: true })
  try {
    await procesar(documentVersionId, claim.data)
    return json({ ok: true })
  } catch {
    // Never persist provider bodies: they may echo identity or medical data.
    const failed = await supabase.rpc('finish_document_analysis', {
      p_version_id: documentVersionId, p_attempt: claim.data, p_result: null, p_note: null,
    })
    return json({ error: failed.error ? 'SAVE_FAILED' : 'ANALYSIS_FAILED' }, 503)
  }
})

async function procesar(documentVersionId: string, attempt: number) {
  const { data: version, error: versionError } = await supabase
    .from('document_versions')
    .select('id,document_id,storage_path,mime_type,documents!document_versions_document_id_fkey(participant_id,document_type,participants(first_name,middle_name,last_name,second_last_name,participant_guardians(first_name,last_name)))')
    .eq('id', documentVersionId)
    .single()

  if (versionError || !version) throw new Error(`No se encontró document_version ${documentVersionId}: ${versionError?.message}`)

  // Los tipos exactos del join anidado de supabase-js son difíciles de expresar
  // sin generar los tipos de la BD; se accede como registro suelto a propósito.
  const doc = (version as any).documents
  const participant = doc?.participants
  const documentType = doc?.document_type as DocumentType
  const guardian = participant?.participant_guardians?.[0]

  if (!documentType || !participant) throw new Error(`document_version ${documentVersionId} sin documento/participante asociado`)

  const participantFullName = [participant.first_name, participant.middle_name, participant.last_name, participant.second_last_name]
    .filter(Boolean)
    .join(' ')
  const guardianFullName = guardian ? [guardian.first_name, guardian.last_name].filter(Boolean).join(' ') : null

  const { data: fileBlob, error: downloadError } = await supabase.storage.from(BUCKET).download((version as any).storage_path)
  if (downloadError || !fileBlob) throw new Error(`No se pudo descargar ${(version as any).storage_path}: ${downloadError?.message}`)

  if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(version.mime_type) || !fileBlob.size || fileBlob.size > 12 * 1024 * 1024) throw new Error('INVALID_FILE')
  const base64 = arrayBufferToBase64(await fileBlob.arrayBuffer())
  const prompt = buildValidationPrompt(documentType, { participantFullName, guardianFullName })
  const result = await llamarGeminiConReintentos(prompt, base64, (version as any).mime_type)

  const { error } = await supabase.rpc('finish_document_analysis', {
    p_version_id: documentVersionId, p_attempt: attempt,
    p_result: { ...result, confidence: calcularBandaConfianza(result) },
    p_note: observationFor(result),
  })
  if (error) throw new Error('SAVE_FAILED')
}

async function llamarGeminiConReintentos(prompt: string, base64: string, mimeType: string): Promise<DocumentValidationResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('Falta el secret GEMINI_API_KEY')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`
  const payload = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
    generationConfig: { temperature: 0, response_mime_type: 'application/json' },
  }

  let espera = GEMINI_ESPERA_BASE_MS
  let ultimaRespuesta: Response | null = null
  for (let intento = 1; intento <= GEMINI_REINTENTOS; intento++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000), method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(payload) })
    if (res.status !== 429 && res.status < 500) {
      ultimaRespuesta = res
      break
    }
    if (intento === GEMINI_REINTENTOS) {
      ultimaRespuesta = res
      break
    }
    console.warn(`[validate-document] Proveedor temporalmente no disponible, reintento ${intento} en ${espera}ms`)
    await new Promise((r) => setTimeout(r, espera))
    espera *= 2
  }

  if (!ultimaRespuesta?.ok) throw new Error('PROVIDER_FAILED')
  const data = await ultimaRespuesta.json()
  const text = data?.candidates?.[0]?.content?.parts?.filter((part: { thought?: boolean; text?: string }) => !part.thought && typeof part.text === 'string').map((part: { text: string }) => part.text).join('')
  if (!text) throw new Error('EMPTY_AI_RESULT')
  return parseResult(text)
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
