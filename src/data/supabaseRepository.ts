import type {
  ReplacementRequest,
  ReplacementStatus,
  AdminUnit,
  DashboardData,
  DocumentItem,
  DocumentType,
  ParticipantDetail,
  ParticipantImportInput,
  ParticipantSummary,
  Repository,
  Viewer,
} from '../types'
import { DOCUMENT_LABELS } from '../types'
import { supabase } from '../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

const RPC_ERROR_MESSAGES: Record<string, string> = {
  RETRY_NOT_ALLOWED: 'Espera dos minutos antes de reintentar. Máximo tres análisis por versión.',
  PARTICIPANT_LOCKED: 'El expediente está confirmado y no admite cambios.',
  NOTE_REQUIRED: 'Explica qué debe corregir el líder.',
  SEX_MISMATCH: 'El nuevo participante debe ser del mismo sexo que el cupo.',
  GUARDIAN_REQUIRED: 'Completa nombres y apellidos del padre o tutor.',
  REASON_REQUIRED: 'Explica el motivo del reemplazo.',
  REPLACEMENT_EXISTS: 'Ya hay un reemplazo en proceso para este cupo.',
  DEADLINE_CLOSED: 'El plazo para solicitar cambios ha terminado.',
  SLOT_CHANGED: 'Este cupo ya tiene otro participante. Actualiza el expediente.',
  INVALID_TRANSITION: 'La solicitud cambió de estado. Actualiza el expediente.',
  NOT_ALLOWED: 'Tu cuenta no tiene permiso para hacer esto.',
  NAME_REQUIRED: 'Completa nombres y apellido paterno.',
  INVALID_PARTICIPANT: 'Revisa la fecha de nacimiento y el sexo del participante.',
  INVALID_DNI: 'El DNI debe tener 8 dígitos.',
  DUPLICATE_DNI: 'Ya existe un participante con ese DNI en esta sesión.',
  UNIT_NOT_FOUND: 'No encontramos esa unidad.',
  PARTICIPANT_NOT_FOUND: 'No encontramos a este participante.',
  DOCUMENTS_INCOMPLETE: 'Este participante todavía tiene documentos pendientes.',
  VERSION_NOT_ALLOWED: 'No pudimos vincular ese archivo. Intenta subirlo de nuevo.',
}

function friendlyRpcError(error: { message?: string } | null | undefined) {
  const code = error?.message?.trim()
  if (code && RPC_ERROR_MESSAGES[code]) return new Error(RPC_ERROR_MESSAGES[code])
  return new Error('No pudimos completar la operación. Intenta nuevamente.')
}

function ageFromBirthDate(value: string) {
  const birth = new Date(`${value}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const month = today.getMonth() - birth.getMonth()
  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1
  return age
}

function fullName(row: any) {
  return [row.first_name, row.middle_name, row.last_name, row.second_last_name].filter(Boolean).join(' ')
}

function statusReady(status: string) {
  return status === 'APPROVED' || status === 'UNDER_REVIEW'
}

function mapParticipant(row: any, requirements: any[]): ParticipantSummary {
  const requiredTypes = requirements.filter((item) => item.required && item.session_id === row.session_id).map((item) => item.document_type as DocumentType)
  const documents = row.documents ?? []
  const ready = requiredTypes.filter((type) => documents.some((document: any) => document.document_type === type && statusReady(document.status))).length
  const pending = requiredTypes
    .filter((type) => !documents.some((document: any) => document.document_type === type && statusReady(document.status)))
    .map((type) => DOCUMENT_LABELS[type])
  return {
    id: row.id,
    unitId: row.unit_id,
    isReplacementCandidate: row.is_replacement_candidate,
    fullName: fullName(row),
    preferredName: row.preferred_name || `${row.first_name} ${row.last_name}`,
    age: ageFromBirthDate(row.birth_date),
    sex: row.sex,
    maskedDocument: row.document_number_masked ?? 'DNI pendiente',
    status: row.status,
    requiredDocuments: requiredTypes.length,
    approvedDocuments: requiredTypes.filter(type => documents.some((d: any) => d.document_type === type && d.status === 'APPROVED')).length,
    readyDocuments: ready,
    pendingDocuments: pending,
    unitName: row.units?.name,
  }
}

async function requirements() {
  const { data, error } = await client().from('document_requirements').select('session_id,document_type,required').eq('required', true)
  if (error) throw error
  return data ?? []
}


async function optimizeDocumentImage(file: File) {
  if (!file.type.startsWith('image/') || file.size <= 2.5 * 1024 * 1024) return file
  const bitmap = await createImageBitmap(file)
  try {
    const maxSide = 2400
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob || blob.size >= file.size) return file
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'documento'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
  } finally {
    bitmap.close()
  }
}

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const
  private viewer: Viewer | null = null

  private async loadViewer(userId: string): Promise<Viewer> {
    const { data, error } = await client()
      .from('profiles')
      .select('id,username,display_name,role,unit_id,units(name,stakes(name))')
      .eq('id', userId)
      .single()
    if (error) throw error
    const unit = data.units as any
    this.viewer = {
      id: data.id,
      username: data.username,
      displayName: data.display_name,
      role: data.role,
      unitId: data.unit_id,
      unitName: unit?.name ?? null,
      stakeName: unit?.stakes?.name ?? null,
    }
    return this.viewer
  }

  async restoreSession() {
    const { data, error } = await client().auth.getUser()
    if (error || !data.user) return null
    return this.loadViewer(data.user.id)
  }

  async signIn(username: string, password: string) {
    const email = username.includes('@') ? username.trim() : `${username.trim()}@fsy.local`
    const { data, error } = await client().auth.signInWithPassword({ email, password })
    if (error || !data.user) throw new Error('Usuario o contraseña incorrectos.')
    return this.loadViewer(data.user.id)
  }

  async signInDemo(): Promise<Viewer> {
    throw new Error('El acceso demo solo está disponible sin configuración Supabase.')
  }

  async signOut() {
    await client().auth.signOut()
    this.viewer = null
  }

  async getDashboard(): Promise<DashboardData> {
    const summaryPromise = client().rpc('leader_dashboard_summary')
    const attentionPromise = client()
      .from('participants')
      .select('id,session_id,stake_id,unit_id,first_name,middle_name,last_name,second_last_name,preferred_name,birth_date,sex,document_type,document_number_masked,is_replacement_candidate,phone,email,registration_source,status,created_at,updated_at,units(name),documents(id,document_type,status)')
      .eq('is_replacement_candidate', false)
      .in('status', ['DOCUMENTS_PENDING', 'OBSERVED'])
      .order('updated_at', { ascending: true })
      .limit(4)
    const requirementPromise = requirements()
    const [summaryResult, attentionResult, requirementRows] = await Promise.all([summaryPromise, attentionPromise, requirementPromise])
    if (summaryResult.error) throw summaryResult.error
    if (attentionResult.error) throw attentionResult.error
    const summary = summaryResult.data as any
    return {
      session: {
        id: summary.session_id,
        name: summary.session_name,
        deadline: summary.deadline,
      },
      total: summary.total,
      confirmed: summary.confirmed,
      attention: summary.attention,
      underReview: summary.under_review,
      attentionParticipants: (attentionResult.data ?? []).map((row) => mapParticipant(row, requirementRows)),
    }
  }

  async getParticipants() {
    const participantPromise = client()
      .from('participants')
      .select('id,session_id,stake_id,unit_id,first_name,middle_name,last_name,second_last_name,preferred_name,birth_date,sex,document_type,document_number_masked,is_replacement_candidate,phone,email,registration_source,status,created_at,updated_at,units(name),documents(id,document_type,status)')
      .not('status', 'in', '(REPLACED,CANCELLED)')
      .order('last_name', { ascending: true })
    const [participantResult, requirementRows] = await Promise.all([participantPromise, requirements()])
    if (participantResult.error) throw participantResult.error
    return (participantResult.data ?? []).map((row) => mapParticipant(row, requirementRows))
  }

  async getParticipant(id: string): Promise<ParticipantDetail> {
    const participantPromise = client()
      .from('participants')
      .select('id,session_id,stake_id,unit_id,first_name,middle_name,last_name,second_last_name,preferred_name,birth_date,sex,document_type,document_number_masked,is_replacement_candidate,phone,email,registration_source,status,created_at,updated_at,units(name),participant_guardians(first_name,last_name),documents(id,document_type,status,last_observation_note,current_version_id,document_versions!document_versions_document_id_fkey(id,version_number,file_name,uploaded_at,status,ai_status,ai_attempts,ai_updated_at,ai_note))')
      .eq('id', id)
      .single()
    const [participantResult, requirementRows] = await Promise.all([participantPromise, requirements()])
    if (participantResult.error) throw participantResult.error
    const row = participantResult.data as any
    const summary = mapParticipant(row, requirementRows)
    let validations: any[] = []
    const currentVersions = (row.documents ?? []).map((d: any) => d.current_version_id).filter(Boolean)
    if (this.viewer && ['SUPER_ADMIN', 'SESSION_ADMIN', 'REVIEWER'].includes(this.viewer.role) && currentVersions.length) {
      const result = await client().from('document_validations').select('document_version_id,extracted_data_json,created_at').in('document_version_id', currentVersions).order('created_at', { ascending: false })
      if (result.error) throw result.error
      validations = result.data ?? []
    }
    const byType = new Map((row.documents ?? []).map((document: any) => [document.document_type, document]))
    const documents: DocumentItem[] = requirementRows
      .filter((item) => item.required && item.session_id === row.session_id)
      .map((item) => {
        const type = item.document_type as DocumentType
        const document: any = byType.get(type)
        const latest = document?.document_versions?.find((v: any) => v.id === document.current_version_id)
        return {
          id: document?.id ?? `${id}-${type}`,
          type,
          label: DOCUMENT_LABELS[type],
          required: true,
          status: document?.status ?? 'PENDING',
          observation: document?.last_observation_note ?? undefined,
          versionId: latest?.id,
          versionNumber: latest?.version_number,
          history: (document?.document_versions ?? []).sort((a: any, b: any) => b.version_number - a.version_number).map((v: any) => ({ id: v.id, number: v.version_number, status: v.status, fileName: v.file_name })),
          analysis: latest ? { status: latest.ai_status, attempts: latest.ai_attempts, updatedAt: latest.ai_updated_at, note: latest.ai_note, result: validations.find(v => v.document_version_id === latest.id)?.extracted_data_json } : undefined,
          fileName: latest?.file_name,
          updatedAt: latest?.uploaded_at,
        }
      })
    const guardian = row.participant_guardians?.[0]
    return {
      ...summary,
      birthDate: row.birth_date,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      guardianName: guardian ? `${guardian.first_name} ${guardian.last_name}` : undefined,
      documents,
    }
  }

  async uploadDocument(participantId: string, documentType: DocumentType, file: File) {
    if (!this.viewer) throw new Error('Tu sesión expiró. Ingresa nuevamente.')
    if (!file.size) throw new Error('El archivo está vacío. Elige otro documento.')
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      throw new Error('Formato no permitido. Usa JPG, PNG, WebP o PDF.')
    }
    if (file.type === 'application/pdf' && file.size > 12 * 1024 * 1024) {
      throw new Error('El PDF supera 12 MB. Elige una versión más liviana.')
    }
    if (file.type.startsWith('image/') && file.size > 25 * 1024 * 1024) {
      throw new Error('La foto supera 25 MB. Elige una imagen más liviana.')
    }

    const preparedFile = await optimizeDocumentImage(file)
    if (preparedFile.size > 12 * 1024 * 1024) throw new Error('No pudimos reducir el archivo por debajo de 12 MB.')

    const db = client()
    const { data: participant, error: participantError } = await db.from('participants').select('id,unit_id').eq('id', participantId).single()
    if (participantError) throw participantError

    const { data: existing, error: documentError } = await db
      .from('documents')
      .select('id')
      .eq('participant_id', participantId)
      .eq('document_type', documentType)
      .maybeSingle()
    if (documentError) throw documentError

    let documentId = existing?.id
    if (!documentId) {
      const created = await db.from('documents').insert({ participant_id: participantId, document_type: documentType, status: 'PENDING' }).select('id').single()
      if (created.error) throw created.error
      documentId = created.data.id
    }

    const { data: version, error: versionError } = await db
      .from('document_versions')
      .select('version_number')
      .eq('document_id', documentId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (versionError) throw versionError
    const versionNumber = (version?.version_number ?? 0) + 1
    const safeExtension = preparedFile.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const path = `${participant.unit_id}/${participantId}/${documentId}/${crypto.randomUUID()}.${safeExtension}`

    const upload = await db.storage.from('participant-documents').upload(path, preparedFile, { upsert: false, contentType: preparedFile.type })
    if (upload.error) throw upload.error

    const versionInsert = await db
      .from('document_versions')
      .insert({
        document_id: documentId,
        version_number: versionNumber,
        storage_path: path,
        mime_type: preparedFile.type,
        file_size: preparedFile.size,
        file_name: preparedFile.name,
        uploaded_by: this.viewer.id,
        status: 'UNDER_REVIEW',
      })
      .select('id')
      .single()

    if (versionInsert.error) {
      await db.storage.from('participant-documents').remove([path])
      throw versionInsert.error
    }

    const attach = await db.rpc('attach_document_version', { p_document_id: documentId, p_version_id: versionInsert.data.id })
    if (attach.error) throw attach.error

    await db.rpc('refresh_participant_document_status', { p_participant_id: participantId })
    return this.getParticipant(participantId)
  }

  async retryAnalysis(versionId: string) {
    const { error } = await client().rpc('retry_document_analysis', { p_version_id: versionId })
    if (error) throw friendlyRpcError(error)
  }

  async reviewDocument(versionId: string, status: 'APPROVED' | 'OBSERVED', note: string) {
    const { error } = await client().rpc('review_document', { p_version_id: versionId, p_status: status, p_note: note })
    if (error) throw friendlyRpcError(error)
  }

  async getDocumentUrl(versionId: string) {
    const { data, error } = await client().from('document_versions').select('storage_path').eq('id', versionId).single()
    if (error) throw friendlyRpcError(error)
    const signed = await client().storage.from('participant-documents').createSignedUrl(data.storage_path, 60)
    if (signed.error) throw friendlyRpcError(signed.error)
    return signed.data.signedUrl
  }

  async getAdminQueue() {
    const participantPromise = client()
      .from('participants')
      .select('id,session_id,stake_id,unit_id,first_name,middle_name,last_name,second_last_name,preferred_name,birth_date,sex,document_type,document_number_masked,is_replacement_candidate,phone,email,registration_source,status,created_at,updated_at,units(name),documents(id,document_type,status)')
      .in('status', ['DOCUMENTS_COMPLETE', 'UNDER_REVIEW', 'OBSERVED', 'DOCUMENTS_PENDING'])
      .order('updated_at', { ascending: true })
    const [participantResult, requirementRows] = await Promise.all([participantPromise, requirements()])
    if (participantResult.error) throw participantResult.error
    return (participantResult.data ?? []).map((row) => mapParticipant(row, requirementRows))
  }

  async getAdminUnits(): Promise<AdminUnit[]> {
    const { data, error } = await client()
      .from('units')
      .select('id,name,session_id,stake_id,stakes(name)')
      .order('name', { ascending: true })
    if (error) throw error
    return (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      sessionId: row.session_id,
      stakeId: row.stake_id,
      stakeName: row.stakes?.name ?? 'Estaca',
    }))
  }

  async createParticipant(input: ParticipantImportInput) {
    const { error } = await client().rpc('create_enrollment', {p_unit_id: input.unitId, p_data: input})
    if (error) throw friendlyRpcError(error)
  }

  async getReplacements(participantId?: string): Promise<ReplacementRequest[]> {
    let query = client().from('replacement_requests').select('id,slot_id,outgoing_participant_id,incoming_participant_id,status,reason,created_at,submitted_at,reviewed_at,review_note,registration_slots(slot_code),outgoing:participants!replacement_requests_outgoing_participant_id_fkey(first_name,last_name),incoming:participants!replacement_requests_incoming_participant_id_fkey(first_name,last_name)').order('created_at', {ascending:false})
    if (participantId) query = query.or(`outgoing_participant_id.eq.${participantId},incoming_participant_id.eq.${participantId}`)
    const { data, error } = await query
    if (error) throw friendlyRpcError(error)
    return (data ?? []).map((r: any) => ({id:r.id,slotId:r.slot_id,slotCode:r.registration_slots?.slot_code,outgoingId:r.outgoing_participant_id,incomingId:r.incoming_participant_id,outgoingName:fullName(r.outgoing ?? {}),incomingName:fullName(r.incoming ?? {}),status:r.status,reason:r.reason,createdAt:r.created_at,submittedAt:r.submitted_at,reviewedAt:r.reviewed_at,reviewNote:r.review_note}))
  }

  async startReplacement(outgoingId: string, input: ParticipantImportInput, reason: string) {
    const {data,error}=await client().rpc('start_replacement',{p_outgoing_id:outgoingId,p_data:input,p_reason:reason})
    if (error) throw friendlyRpcError(error)
    return data as string
  }

  async transitionReplacement(requestId: string, action: Exclude<ReplacementStatus,'DRAFT'>, note = '') {
    const {error}=await client().rpc('transition_replacement',{p_request_id:requestId,p_action:action,p_note:note})
    if (error) throw friendlyRpcError(error)
  }

  async confirmParticipant(participantId: string) {
    const { error } = await client().rpc('confirm_participant', { p_participant_id: participantId })
    if (error) throw friendlyRpcError(error)
  }
}
