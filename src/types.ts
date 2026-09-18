export type Role =
  | 'SUPER_ADMIN'
  | 'SESSION_ADMIN'
  | 'STAKE_COORDINATOR'
  | 'UNIT_LEADER'
  | 'REVIEWER'
  | 'SUPPORT'

export type ParticipantStatus =
  | 'REGISTERED'
  | 'DOCUMENTS_PENDING'
  | 'DOCUMENTS_COMPLETE'
  | 'UNDER_REVIEW'
  | 'OBSERVED'
  | 'CONFIRMED'
  | 'REPLACEMENT_REQUESTED'
  | 'REPLACED'
  | 'CANCELLED'

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Administrador principal', SESSION_ADMIN: 'Administrador de sesión',
  STAKE_COORDINATOR: 'Coordinador de estaca', UNIT_LEADER: 'Cuenta de barrio',
  REVIEWER: 'Supervisor', SUPPORT: 'Soporte',
}

export type DocumentType =
  | 'REGISTRATION_FORM'
  | 'IMAGE_AUTHORIZATION'
  | 'MEDICAL_AUTHORIZATION'
  | 'PARTICIPANT_DNI_FRONT'
  | 'PARTICIPANT_DNI_BACK'
  | 'GUARDIAN_DNI_FRONT'
  | 'GUARDIAN_DNI_BACK'

export type DocumentStatus = 'PENDING' | 'UNDER_REVIEW' | 'OBSERVED' | 'APPROVED'

export interface Viewer {
  id: string
  username: string
  displayName: string
  role: Role
  unitId: string | null
  unitName: string | null
  stakeName: string | null
}

export interface SessionInfo {
  id: string
  name: string
  deadline: string | null
}

export interface Analysis {
  status: 'UNAVAILABLE' | 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED'
  attempts: number
  updatedAt?: string
  note?: string
  result?: { formatoCorresponde: boolean; documentoLegible: boolean; todasLasPaginasPresentes: boolean; nombreIdentificado: boolean; firmaDetectada: boolean | null; consistenciaNombre: string; datos: Record<string, string | null> }
}

export interface DocumentItem {
  id: string
  type: DocumentType
  label: string
  required: boolean
  status: DocumentStatus
  observation?: string
  fileName?: string
  updatedAt?: string
  versionId?: string
  versionNumber?: number
  analysis?: Analysis
  history?: { id: string; number: number; status: DocumentStatus; fileName: string }[]
}

export type ReplacementStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
export interface ReplacementRequest {
  id: string; slotId: string; slotCode: string; outgoingId: string; incomingId: string
  outgoingName: string; incomingName: string; status: ReplacementStatus; reason: string
  createdAt: string; submittedAt?: string; reviewedAt?: string; reviewNote?: string
}

export interface ParticipantSummary {
  unitId?: string
  isReplacementCandidate?: boolean
  id: string
  fullName: string
  preferredName: string
  age: number
  sex: 'Hombre' | 'Mujer'
  maskedDocument: string
  status: ParticipantStatus
  requiredDocuments: number
  approvedDocuments?: number
  readyDocuments: number
  pendingDocuments: string[]
  unitName?: string
}

export interface ParticipantDetail extends ParticipantSummary {
  birthDate: string
  phone?: string
  email?: string
  guardianName?: string
  documents: DocumentItem[]
}

export interface DashboardData {
  session: SessionInfo
  total: number
  confirmed: number
  attention: number
  underReview: number
  attentionParticipants: ParticipantSummary[]
}


export interface AdminUnit {
  id: string
  name: string
  stakeName: string
  sessionId: string
  stakeId: string
}

export interface ParticipantImportInput {
  unitId: string
  firstName: string
  middleName?: string
  lastName: string
  secondLastName?: string
  preferredName?: string
  birthDate: string
  sex: 'Hombre' | 'Mujer'
  documentNumber?: string
  phone?: string
  email?: string
  guardianFirstName?: string
  guardianLastName?: string
  guardianPhone?: string
}

export interface Repository {
  readonly mode: 'demo' | 'supabase'
  restoreSession(): Promise<Viewer | null>
  signIn(username: string, password: string): Promise<Viewer>
  signInDemo(role: 'leader' | 'admin'): Promise<Viewer>
  signOut(): Promise<void>
  getDashboard(): Promise<DashboardData>
  getParticipants(): Promise<ParticipantSummary[]>
  getParticipant(id: string): Promise<ParticipantDetail>
  uploadDocument(participantId: string, documentType: DocumentType, file: File): Promise<ParticipantDetail>
  retryAnalysis(versionId: string): Promise<void>
  reviewDocument(versionId: string, status: 'APPROVED' | 'OBSERVED', note: string): Promise<void>
  getDocumentUrl(versionId: string): Promise<string>
  getAdminQueue(): Promise<ParticipantSummary[]>
  getAdminUnits(): Promise<AdminUnit[]>
  createParticipant(input: ParticipantImportInput): Promise<void>
  getReplacements(participantId?: string): Promise<ReplacementRequest[]>
  startReplacement(outgoingId: string, input: ParticipantImportInput, reason: string): Promise<string>
  transitionReplacement(requestId: string, action: Exclude<ReplacementStatus, 'DRAFT'>, note?: string): Promise<void>
  confirmParticipant(participantId: string): Promise<void>
}

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  REGISTRATION_FORM: 'Formulario de inscripción',
  IMAGE_AUTHORIZATION: 'Autorización para uso de imagen',
  MEDICAL_AUTHORIZATION: 'Permiso y autorización médica',
  PARTICIPANT_DNI_FRONT: 'DNI participante · Frente',
  PARTICIPANT_DNI_BACK: 'DNI participante · Reverso',
  GUARDIAN_DNI_FRONT: 'DNI padre/tutor · Frente',
  GUARDIAN_DNI_BACK: 'DNI padre/tutor · Reverso',
}

export const STATUS_LABELS: Record<ParticipantStatus, string> = {
  REGISTERED: 'Requiere completar',
  DOCUMENTS_PENDING: 'Requiere completar',
  DOCUMENTS_COMPLETE: 'Enviado',
  UNDER_REVIEW: 'En revisión',
  OBSERVED: 'Requiere corrección',
  CONFIRMED: 'Confirmado',
  REPLACEMENT_REQUESTED: 'Cambio solicitado',
  REPLACED: 'Reemplazado',
  CANCELLED: 'Cancelado',
}
