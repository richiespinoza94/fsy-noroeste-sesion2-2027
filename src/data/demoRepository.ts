import type {
  ReplacementRequest,
  ReplacementStatus,
  DashboardData,
  DocumentItem,
  DocumentType,
  ParticipantDetail,
  ParticipantImportInput,
  ParticipantStatus,
  ParticipantSummary,
  Repository,
  Viewer,
} from '../types'
import { DOCUMENT_LABELS } from '../types'

const SESSION = {
  id: 'session-2027-2',
  name: 'FSY Lima Noroeste · Sesión 2 · 2027',
  deadline: '2027-07-12',
}

const leader: Viewer = {
  id: 'demo-leader',
  username: 'barrio.ventanilla',
  displayName: 'Barrio Ventanilla',
  role: 'UNIT_LEADER',
  unitId: 'unit-ventanilla',
  unitName: 'Barrio Ventanilla',
  stakeName: 'Estaca Ventanilla',
}

const admin: Viewer = {
  id: 'demo-admin',
  username: 'admin.fsy',
  displayName: 'Equipo FSY',
  role: 'SUPER_ADMIN',
  unitId: null,
  unitName: null,
  stakeName: null,
}

const allTypes = Object.keys(DOCUMENT_LABELS) as DocumentType[]

function docs(ready: number, observedAt = -1): DocumentItem[] {
  return allTypes.map((type, index) => ({
    id: `doc-${type}-${index}`,
    type,
    label: DOCUMENT_LABELS[type],
    required: true,
    status: index === observedAt ? 'OBSERVED' : index < ready ? 'APPROVED' : 'PENDING',
    observation: index === observedAt ? 'La imagen quedó cortada. Necesitamos ver las 4 esquinas.' : undefined,
  }))
}

const demoFiles = new Map<string, string>()

let participants: ParticipantDetail[] = [
  {
    id: 'pepito-salas',
    fullName: 'Pepito Carlos Salas Ramos',
    preferredName: 'Pepito Salas',
    age: 17,
    birthDate: '2009-03-12',
    sex: 'Hombre',
    maskedDocument: 'DNI ••••••42',
    status: 'DOCUMENTS_PENDING',
    requiredDocuments: 7,
    readyDocuments: 5,
    pendingDocuments: ['Permiso y autorización médica', 'DNI participante · Reverso'],
    guardianName: 'Rosa Ramos',
    unitName: 'Barrio Ventanilla',
    phone: '999 111 222',
    documents: docs(5),
  },
  {
    id: 'ana-torres',
    fullName: 'Ana Lucía Torres Vega',
    preferredName: 'Ana Torres',
    age: 16,
    birthDate: '2010-01-20',
    sex: 'Mujer',
    maskedDocument: 'DNI ••••••18',
    status: 'OBSERVED',
    requiredDocuments: 7,
    readyDocuments: 6,
    pendingDocuments: ['Autorización para uso de imagen'],
    guardianName: 'María Vega',
    unitName: 'Barrio Ventanilla',
    documents: docs(7, 1),
  },
  {
    id: 'jose-perez',
    fullName: 'José Miguel Pérez Díaz',
    preferredName: 'José Pérez',
    age: 17,
    birthDate: '2009-05-04',
    sex: 'Hombre',
    maskedDocument: 'DNI ••••••77',
    status: 'CONFIRMED',
    requiredDocuments: 7,
    readyDocuments: 7,
    pendingDocuments: [],
    guardianName: 'Miguel Pérez',
    unitName: 'Barrio Ventanilla',
    documents: docs(7),
  },
  {
    id: 'luciana-garcia',
    fullName: 'Luciana García Medina',
    preferredName: 'Luciana García',
    age: 15,
    birthDate: '2011-02-18',
    sex: 'Mujer',
    maskedDocument: 'DNI ••••••63',
    status: 'UNDER_REVIEW',
    requiredDocuments: 7,
    readyDocuments: 7,
    pendingDocuments: [],
    guardianName: 'Patricia Medina',
    unitName: 'Barrio Ventanilla',
    documents: docs(7).map((document) => ({ ...document, status: 'UNDER_REVIEW' })),
  },
  {
    id: 'mateo-ruiz',
    fullName: 'Mateo Alejandro Ruiz Flores',
    preferredName: 'Mateo Ruiz',
    age: 16,
    birthDate: '2010-07-10',
    sex: 'Hombre',
    maskedDocument: 'DNI ••••••05',
    status: 'DOCUMENTS_PENDING',
    requiredDocuments: 7,
    readyDocuments: 4,
    pendingDocuments: ['Permiso y autorización médica', 'DNI participante · Frente', 'DNI participante · Reverso'],
    guardianName: 'Carlos Ruiz',
    unitName: 'Barrio Ventanilla',
    documents: docs(4),
  },
  {
    id: 'valeria-leon',
    fullName: 'Valeria León Soto',
    preferredName: 'Valeria León',
    age: 17,
    birthDate: '2009-09-02',
    sex: 'Mujer',
    maskedDocument: 'DNI ••••••91',
    status: 'CONFIRMED',
    requiredDocuments: 7,
    readyDocuments: 7,
    pendingDocuments: [],
    guardianName: 'Silvia Soto',
    unitName: 'Barrio Ventanilla',
    documents: docs(7),
  },
]

// Give seeded files distinct version IDs; never pretend these are real uploads.
participants.forEach(p => {p.unitId='unit-ventanilla'; p.documents.forEach(d => {
  d.id = `${p.id}-${d.type}`
  if (d.status !== 'PENDING') { d.versionId = `${d.id}-1`; d.versionNumber = 1 }
})})

const replacements: (ReplacementRequest & {outgoingStatus: ParticipantStatus})[] = []
const demoSlots = new Map(participants.map(p => [`FSY27-${p.id}`,p.id]))
const demoDnis = new Map<string,string>()

function summaryOf(participant: ParticipantDetail): ParticipantSummary {
  const { documents: _documents, birthDate: _birthDate, phone: _phone, email: _email, guardianName: _guardian, ...summary } = participant
  return summary
}

function syncParticipant(participant: ParticipantDetail): ParticipantDetail {
  const ready = participant.documents.filter((document) => document.status === 'APPROVED' || document.status === 'UNDER_REVIEW').length
  const pending = participant.documents
    .filter((document) => document.status === 'PENDING' || document.status === 'OBSERVED')
    .map((document) => document.label)
  const hasObserved = participant.documents.some((document) => document.status === 'OBSERVED')
  const allSubmitted = participant.documents.every((document) => document.status !== 'PENDING' && document.status !== 'OBSERVED')
  let status: ParticipantStatus = participant.status
  if (!['CONFIRMED','REPLACED','CANCELLED','REPLACEMENT_REQUESTED'].includes(status)) status = hasObserved ? 'OBSERVED' : allSubmitted ? 'DOCUMENTS_COMPLETE' : 'DOCUMENTS_PENDING'
  return { ...participant, approvedDocuments: participant.documents.filter(d => d.status === 'APPROVED').length, readyDocuments: ready, pendingDocuments: pending, status }
}

export class DemoRepository implements Repository {
  readonly mode = 'demo' as const
  private viewer: Viewer | null = null

  async restoreSession() {
    return this.viewer
  }

  async signIn(username: string, password: string) {
    if (!username.trim() || !password.trim()) throw new Error('Ingresa tu usuario y contraseña.')
    this.viewer = username.toLowerCase().includes('admin') ? admin : leader
    return this.viewer
  }

  async signInDemo(role: 'leader' | 'admin') {
    this.viewer = role === 'admin' ? admin : leader
    return this.viewer
  }

  async signOut() {
    this.viewer = null
  }

  async getDashboard(): Promise<DashboardData> {
    const list = participants.filter(p=>!p.isReplacementCandidate && !['REPLACED','CANCELLED'].includes(p.status)).map(syncParticipant).map(summaryOf)
    const attention = list.filter((participant) => participant.status === 'DOCUMENTS_PENDING' || participant.status === 'OBSERVED')
    return {
      session: SESSION,
      total: list.length,
      confirmed: list.filter((participant) => participant.status === 'CONFIRMED').length,
      attention: attention.length,
      underReview: list.filter((participant) => ['UNDER_REVIEW','DOCUMENTS_COMPLETE','REPLACEMENT_REQUESTED'].includes(participant.status)).length,
      attentionParticipants: attention.slice(0, 4),
    }
  }

  async getParticipants() {
    participants = participants.map(syncParticipant)
    return participants.filter(p=>!['REPLACED','CANCELLED'].includes(p.status)).map(summaryOf)
  }

  async getParticipant(id: string) {
    const participant = participants.find((item) => item.id === id)
    if (!participant) throw new Error('No encontramos a este participante.')
    return structuredClone(syncParticipant(participant))
  }

  async uploadDocument(participantId: string, documentType: DocumentType, file: File) {
    const index = participants.findIndex((item) => item.id === participantId)
    if (index < 0) throw new Error('No encontramos a este participante.')
    const participant = structuredClone(participants[index])
    const document = participant.documents.find((item) => item.type === documentType)
    if (!document) throw new Error('Este documento no pertenece al checklist de la sesión.')
    if (!this.viewer) throw new Error('Ingresa nuevamente.')
    if (['CONFIRMED','REPLACED','CANCELLED','REPLACEMENT_REQUESTED'].includes(participant.status) || !['PENDING', 'OBSERVED'].includes(document.status)) throw new Error('Este documento no admite cambios.')
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type) || !file.size || file.size > 12 * 1024 * 1024) throw new Error('Usa JPG, PNG, WebP o PDF de hasta 12 MB en la demo.')
    document.history = [...(document.history ?? []), ...(document.versionId ? [{ id: document.versionId, number: document.versionNumber ?? 1, status: document.status, fileName: document.fileName ?? 'Documento de ejemplo' }] : [])]
    document.versionId = crypto.randomUUID()
    document.versionNumber = (document.versionNumber ?? 0) + 1
    demoFiles.set(document.versionId, URL.createObjectURL(file))
    document.analysis = { status: 'PENDING', attempts: 0, updatedAt: new Date().toISOString() }
    document.status = 'UNDER_REVIEW'
    document.fileName = file.name
    document.observation = undefined
    document.updatedAt = new Date().toISOString()
    participants[index] = syncParticipant(participant)
    this.simulateAnalysis(document.versionId)
    return structuredClone(participants[index])
  }

  private simulateAnalysis(versionId: string) {
    setTimeout(() => {
      const doc = participants.flatMap(p => p.documents).find(d => d.versionId === versionId)
      if (doc) doc.analysis = { status: 'COMPLETE', attempts: 1, updatedAt: new Date().toISOString(), note: 'Simulación: archivo recibido. En producción se analiza su contenido; aquí no se ejecuta OCR.' }
    }, 1800)
  }

  async retryAnalysis(versionId: string) {
    const person = participants.find(p => p.documents.some(d => d.versionId === versionId))
    const doc = person?.documents.find(d => d.versionId === versionId)
    if (!this.viewer || !doc || (person && ['CONFIRMED','REPLACED','CANCELLED','REPLACEMENT_REQUESTED'].includes(person.status))) throw new Error('Documento no disponible.')
    doc.analysis = { status: 'PENDING', attempts: 0, updatedAt: new Date().toISOString() }
    this.simulateAnalysis(versionId)
  }

  async getDocumentUrl(versionId: string) {
    const url = demoFiles.get(versionId)
    if (!url) throw new Error('Este archivo de ejemplo no tiene una imagen real. Sube un archivo para probar la vista previa.')
    return url
  }

  async reviewDocument(versionId: string, status: 'APPROVED' | 'OBSERVED', note: string) {
    if (!this.viewer || this.viewer.role === 'UNIT_LEADER') throw new Error('Solo el equipo FSY puede revisar.')
    const person = participants.find(p => p.documents.some(d => d.versionId === versionId))
    const doc = person?.documents.find(d => d.versionId === versionId)
    if (!doc || (person && ['CONFIRMED','REPLACED','CANCELLED','REPLACEMENT_REQUESTED'].includes(person.status))) throw new Error('Documento no disponible.')
    if (status === 'OBSERVED' && !note.trim()) throw new Error('Explica qué debe corregirse.')
    doc.status = status
    doc.observation = status === 'OBSERVED' ? note.trim() : undefined
  }

  async getAdminQueue() {
    participants = participants.map(syncParticipant)
    return participants
      .filter((participant) => !['CONFIRMED','REPLACED','CANCELLED'].includes(participant.status))
      .map(summaryOf)
  }

  async getAdminUnits() {
    return [{ id: 'unit-ventanilla', name: 'Barrio Ventanilla', stakeName: 'Estaca Ventanilla', sessionId: SESSION.id, stakeId: 'stake-ventanilla' }]
  }

  async createParticipant(input: ParticipantImportInput) {
    if (!this.viewer || this.viewer.role === 'UNIT_LEADER') throw new Error('Tu cuenta no puede cargar participantes.')
    const id=this.addParticipant(input)
    demoSlots.set(`FSY27-${id}`,id)
  }

  private addParticipant(input: ParticipantImportInput): string {
    if (!input.firstName.trim() || !input.lastName.trim() || !input.birthDate || !Number.isFinite(Date.parse(input.birthDate)) || input.birthDate>new Date().toISOString().slice(0,10) || !['Hombre','Mujer'].includes(input.sex)) throw new Error('Revisa nombres, fecha y sexo.')
    if (input.documentNumber && !/^\d{8}$/.test(input.documentNumber)) throw new Error('El DNI debe tener 8 dígitos.')
    if (input.documentNumber && participants.some(p=>!['REPLACED','CANCELLED'].includes(p.status) && demoDnis.get(p.id)===input.documentNumber)) throw new Error('Ya existe un participante con ese DNI.')
    if (Boolean(input.guardianFirstName?.trim()) !== Boolean(input.guardianLastName?.trim())) throw new Error('Completa nombres y apellidos del tutor.')
    const id=crypto.randomUUID()

    const birth = new Date(`${input.birthDate}T00:00:00`)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1
    const preferredName = input.preferredName?.trim() || `${input.firstName.trim()} ${input.lastName.trim()}`
    participants = [...participants, {
      id,
      unitId: input.unitId,
      phone: input.phone,
      email: input.email,
      guardianName: [input.guardianFirstName,input.guardianLastName].filter(Boolean).join(' ') || undefined,
      fullName: [input.firstName, input.middleName, input.lastName, input.secondLastName].filter(Boolean).join(' '),
      preferredName,
      age,
      birthDate: input.birthDate,
      sex: input.sex,
      maskedDocument: input.documentNumber ? `DNI ••••••${input.documentNumber.slice(-2)}` : 'DNI pendiente',
      unitName: 'Barrio Ventanilla',
      status: 'DOCUMENTS_PENDING',
      requiredDocuments: 7,
      readyDocuments: 0,
      pendingDocuments: allTypes.map((type) => DOCUMENT_LABELS[type]),
      documents: docs(0),
    }]
    if(input.documentNumber)demoDnis.set(id,input.documentNumber)
    return id
  }

  async getReplacements(participantId?: string): Promise<ReplacementRequest[]> {
    if (!this.viewer) throw new Error('Ingresa nuevamente.')
    return structuredClone(replacements.filter(r=>!participantId || r.incomingId===participantId || r.outgoingId===participantId).slice().reverse())
  }

  async startReplacement(outgoingId: string, input: ParticipantImportInput, reason: string) {
    if (!this.viewer || !['UNIT_LEADER','SUPER_ADMIN','SESSION_ADMIN'].includes(this.viewer.role)) throw new Error('No tienes permiso para preparar cambios.')
    const outgoing=participants.find(p=>p.id===outgoingId)
    const slot=[...demoSlots].find(([,id])=>id===outgoingId)
    if(!outgoing || !slot)throw new Error('No encontramos el cupo.')
    if(replacements.some(r=>r.slotId===slot[0] && ['DRAFT','SUBMITTED'].includes(r.status)))throw new Error('Ya existe un reemplazo en proceso.')
    if(new Date().toISOString().slice(0,10)>SESSION.deadline)throw new Error('El plazo para solicitar cambios ha terminado.')
    if(input.sex!==outgoing.sex)throw new Error('El nuevo participante debe ser del mismo sexo que el cupo.')
    if(!reason.trim() || reason.length>1000)throw new Error('Explica el motivo del reemplazo.')
    if(!input.guardianFirstName?.trim() || !input.guardianLastName?.trim())throw new Error('Completa nombres y apellidos del padre o tutor.')
    const id=this.addParticipant({...input,unitId:outgoing.unitId ?? ''})
    const incoming=participants.find(p=>p.id===id)!
    incoming.isReplacementCandidate=true
    replacements.push({id:crypto.randomUUID(),slotId:slot[0],slotCode:slot[0],outgoingId,incomingId:id,outgoingName:outgoing.fullName,incomingName:incoming.fullName,status:'DRAFT',reason:reason.trim(),createdAt:new Date().toISOString(),outgoingStatus:outgoing.status})
    outgoing.status='REPLACEMENT_REQUESTED'
    return id
  }

  async transitionReplacement(requestId: string, action: Exclude<ReplacementStatus,'DRAFT'>, note='') {
    const r=replacements.find(r=>r.id===requestId)
    if(!this.viewer || !r)throw new Error('No tienes acceso a esta solicitud.')
    if(['SUBMITTED','CANCELLED'].includes(action) && !['UNIT_LEADER','SUPER_ADMIN','SESSION_ADMIN'].includes(this.viewer.role))throw new Error('No tienes permiso para solicitar cambios.')
    if(['APPROVED','REJECTED'].includes(action) && !['SUPER_ADMIN','SESSION_ADMIN','REVIEWER'].includes(this.viewer.role))throw new Error('Solo el equipo FSY puede decidir.')
    if(!['SUBMITTED','CANCELLED','APPROVED','REJECTED'].includes(action) || (action==='SUBMITTED' && r.status!=='DRAFT') || (['APPROVED','REJECTED'].includes(action) && r.status!=='SUBMITTED') || (action==='CANCELLED' && !['DRAFT','SUBMITTED'].includes(r.status)))throw new Error('La solicitud cambió de estado.')
    const incoming=participants.find(p=>p.id===r.incomingId)!,outgoing=participants.find(p=>p.id===r.outgoingId)!
    if(demoSlots.get(r.slotId)!==outgoing.id || incoming.sex!==outgoing.sex)throw new Error('El cupo no corresponde a esta solicitud.')
    if(action==='SUBMITTED' && new Date().toISOString().slice(0,10)>SESSION.deadline)throw new Error('El plazo para solicitar cambios ha terminado.')
    if(['SUBMITTED','APPROVED'].includes(action) && (!incoming.documents.length || !incoming.documents.every(d=>d.status==='APPROVED' || (action==='SUBMITTED' && d.status==='UNDER_REVIEW'))))throw new Error('Completa y revisa los documentos antes de continuar.')
    if(action==='REJECTED' && (!note.trim() || note.length>1000))throw new Error('Indica el motivo de la decisión.')
    if(action==='APPROVED'){outgoing.status='REPLACED';incoming.status='CONFIRMED';incoming.isReplacementCandidate=false;demoSlots.set(r.slotId,incoming.id)}
    if(['REJECTED','CANCELLED'].includes(action)){outgoing.status=r.outgoingStatus;incoming.status='CANCELLED'}
    r.status=action;r.reviewNote=note.trim() || undefined
    if(action==='SUBMITTED')r.submittedAt=new Date().toISOString()
    if(['APPROVED','REJECTED'].includes(action))r.reviewedAt=new Date().toISOString()
  }

  async confirmParticipant(participantId: string) {
    if (!this.viewer || this.viewer.role === 'UNIT_LEADER') throw new Error('Solo el equipo FSY puede confirmar.')
    const index = participants.findIndex((item) => item.id === participantId)
    if (index < 0) throw new Error('No encontramos a este participante.')
    if (participants[index].isReplacementCandidate || ['REPLACED','CANCELLED','REPLACEMENT_REQUESTED'].includes(participants[index].status)) throw new Error('Resuelve la solicitud de cambio desde su expediente.')
    if (!participants[index].documents.every(d => d.status === 'APPROVED')) throw new Error('Revisa y aprueba cada documento antes de confirmar.')
    participants[index] = {
      ...participants[index],
      status: 'CONFIRMED',
      readyDocuments: participants[index].requiredDocuments,
      pendingDocuments: [],
      documents: participants[index].documents.map((document) => ({ ...document, status: 'APPROVED' })),
    }
  }
}
