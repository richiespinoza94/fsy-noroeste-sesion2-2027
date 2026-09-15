import { useEffect, useState } from 'react'
import type { ParticipantDetail, ParticipantImportInput, ReplacementRequest, ReplacementStatus, Repository, Viewer } from './types'
import { ParticipantFields } from './ParticipantFields'

const labels: Record<ReplacementStatus,string> = {DRAFT:'Preparar documentos',SUBMITTED:'Cambio en revisión',APPROVED:'Cambio aprobado',REJECTED:'Cambio no aprobado',CANCELLED:'Solicitud cancelada'}
const date = (value: string) => new Date(value).toLocaleDateString('es-PE')

export function ReplacementPanel({participant, viewer, repository, onChanged, onOpen}: {
  participant: ParticipantDetail; viewer: Viewer; repository: Repository; onChanged: () => Promise<void>; onOpen: (id: string) => void
}) {
  const [requests,setRequests]=useState<ReplacementRequest[] | null>(null)
  const [editing,setEditing]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [reason,setReason]=useState('')
  const [note,setNote]=useState('')
  const [form,setForm]=useState<ParticipantImportInput>({unitId:participant.unitId ?? '',firstName:'',lastName:'',birthDate:'',sex:participant.sex})
  const canStart=['UNIT_LEADER','SUPER_ADMIN','SESSION_ADMIN'].includes(viewer.role)
  const canReview=['SUPER_ADMIN','SESSION_ADMIN','REVIEWER'].includes(viewer.role)
  const load=async()=>setRequests(await repository.getReplacements(participant.id))
  useEffect(()=>{let active=true; repository.getReplacements(participant.id).then(r=>{if(active)setRequests(r)}).catch(()=>{if(active)setError('No pudimos cargar las solicitudes. Intenta nuevamente.')});return()=>{active=false}},[participant.id,participant.status])
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action()}catch(e){setError(e instanceof Error?e.message:'No pudimos completar la operación.')}finally{setBusy(false)}}
  const transition=(id:string,action:Exclude<ReplacementStatus,'DRAFT'>)=>run(async()=>{await repository.transitionReplacement(id,action,note);setNote('');await onChanged();await load()})
  const active=requests?.some(r=>['DRAFT','SUBMITTED'].includes(r.status))
  const startable=canStart && requests !== null && !active && !participant.isReplacementCandidate && !['REPLACED','CANCELLED','REPLACEMENT_REQUESTED'].includes(participant.status)
  return <section className="replacement-panel" aria-labelledby="replacement-title">
    <h2 id="replacement-title">Permutas y reemplazos</h2>
    <p>Si {participant.preferredName} no participará, prepara el expediente de otro joven. El cupo cambia de titular únicamente cuando el equipo FSY aprueba la solicitud.</p>
    {requests === null && !error ? <p role="status">Cargando solicitudes…</p> : null}
    {requests?.map(r=>{
      const incoming=participant.id===r.incomingId
      const ready=participant.readyDocuments===participant.requiredDocuments && participant.requiredDocuments>0
      const approved=participant.approvedDocuments===participant.requiredDocuments && participant.requiredDocuments>0
      return <article className="replacement-item" key={r.id}>
        <h3>{labels[r.status]}</h3>
        <div className="replacement-flow"><span>Sale: <strong>{r.outgoingName}</strong></span><span>Ingresa: <strong>{r.incomingName}</strong></span><small>Cupo {r.slotCode} · Solicitud {r.id.slice(0,8).toUpperCase()}</small></div>
        <p>{r.reason}</p>
        <small>Preparación: {date(r.createdAt)}{r.submittedAt ? ` · Envío: ${date(r.submittedAt)}` : ''}{r.reviewedAt ? ` · Decisión: ${date(r.reviewedAt)}` : ''}</small>
        {r.reviewNote ? <p><strong>Indicación del equipo: </strong>{r.reviewNote}</p> : null}
        <div className="replacement-actions"><button className="button button--secondary" onClick={()=>onOpen(incoming?r.outgoingId:r.incomingId)}>{incoming?'Ver expediente saliente':'Ver expediente entrante'}</button></div>
        {incoming && r.status==='DRAFT' ? <><p>Completa el checklist de este expediente y luego solicita la revisión del cambio.</p>{canStart ? <button className="button button--primary" disabled={busy || !ready} onClick={()=>transition(r.id,'SUBMITTED')}>Solicitar revisión del cambio</button>:null}</> : null}
        {incoming && r.status==='SUBMITTED' && canReview ? <><p>Aprueba todos los documentos antes de reasignar el cupo. Una aprobación confirma también la inscripción del entrante.</p><label className="field">Motivo si no se aprueba<textarea maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} /></label><div className="replacement-actions"><button className="button button--primary" disabled={busy || !approved} onClick={()=>transition(r.id,'APPROVED')}>Aprobar cambio y confirmar</button><button className="button button--secondary" disabled={busy || !note.trim()} onClick={()=>transition(r.id,'REJECTED')}>No aprobar cambio</button></div></>:null}
        {canStart && ['DRAFT','SUBMITTED'].includes(r.status) ? <details><summary>Cancelar esta solicitud</summary><p>El cupo permanecerá con {r.outgoingName}. Se conservarán los datos y documentos cargados como historial.</p><button className="button button--secondary" disabled={busy} onClick={()=>transition(r.id,'CANCELLED')}>Cancelar solicitud y conservar titular</button></details> : null}
      </article>
    })}
    {startable && !editing ? <button className="button button--secondary" onClick={()=>setEditing(true)}>Preparar reemplazo</button> : null}
    {startable && editing ? <form className="admin-import-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const id=await repository.startReplacement(participant.id,form,reason);setEditing(false);await onChanged();onOpen(id)})}}>
      <div className="field--wide"><h3>Datos del nuevo participante</h3><p>Debe ser del mismo sexo: <strong>{participant.sex}</strong>. Sus documentos se cargarán en el siguiente paso.</p></div>
      <ParticipantFields form={form} setForm={setForm} fixedSex={participant.sex} guardianRequired />
      <label className="field field--wide">Motivo del reemplazo<textarea required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} /></label>
      <div className="replacement-actions field--wide"><button className="button button--primary" disabled={busy}>{busy?'Guardando…':'Guardar y completar documentos'}</button><button type="button" className="button button--secondary" disabled={busy} onClick={()=>setEditing(false)}>Volver</button></div>
    </form> : null}
    {error ? <div role="alert" className="form-error">{error}{requests===null?<button className="text-button" onClick={()=>run(load)}>Reintentar</button>:null}</div>:null}
  </section>
}

export function ReplacementQueue({repository,onOpen}:{repository:Repository;onOpen:(id:string)=>void}) {
  const [requests,setRequests]=useState<ReplacementRequest[] | null>(null)
  const [error,setError]=useState('')
  const load=()=>{setError('');repository.getReplacements().then(setRequests).catch(()=>setError('No pudimos cargar las permutas.'))}
  useEffect(load,[])
  return <section className="replacement-panel"><h2>Solicitudes de cambio</h2><p>Revisa el expediente entrante para decidir. El historial conserva también los cambios resueltos.</p>{error?<p role="alert">{error}<button className="text-button" onClick={load}>Reintentar</button></p>:requests===null?<p role="status">Cargando…</p>:!requests.length?<p>Aún no hay solicitudes. Se preparan desde el expediente del participante saliente.</p>:requests.map(r=><article className="replacement-item" key={r.id}><h3>{r.outgoingName} → {r.incomingName}</h3><p>{labels[r.status]} · {date(r.createdAt)}</p><button className="button button--secondary" onClick={()=>onOpen(r.incomingId)}>Ver expediente entrante</button></article>)}</section>
}
