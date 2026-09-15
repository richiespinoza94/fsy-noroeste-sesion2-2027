import type { Dispatch, SetStateAction } from 'react'
import type { ParticipantImportInput } from './types'

export function ParticipantFields({form, setForm, fixedSex, guardianRequired = false}: {
  form: ParticipantImportInput; setForm: Dispatch<SetStateAction<ParticipantImportInput>>
  fixedSex?: ParticipantImportInput['sex']; guardianRequired?: boolean
}) {
  const change = <K extends keyof ParticipantImportInput,>(field: K, value: ParticipantImportInput[K]) => setForm(current => ({...current, [field]: value}))
  return <>
        <label className="field">Nombres<input value={form.firstName} onChange={(event) => change('firstName', event.target.value)} autoComplete="off" required /></label>
        <label className="field">Segundo nombre <span>opcional</span><input value={form.middleName ?? ''} onChange={(event) => change('middleName', event.target.value)} autoComplete="off" /></label>
        <label className="field">Apellido paterno<input value={form.lastName} onChange={(event) => change('lastName', event.target.value)} autoComplete="off" required /></label>
        <label className="field">Apellido materno <span>opcional</span><input value={form.secondLastName ?? ''} onChange={(event) => change('secondLastName', event.target.value)} autoComplete="off" /></label>
        <label className="field">Fecha de nacimiento<input type="date" max={new Date().toISOString().slice(0,10)} value={form.birthDate} onChange={(event) => change('birthDate', event.target.value)} required /></label>
        <label className="field">Sexo<select value={fixedSex ?? form.sex} disabled={Boolean(fixedSex)} onChange={(event) => change('sex', event.target.value as ParticipantImportInput['sex'])}><option value="Hombre">Hombre</option><option value="Mujer">Mujer</option></select></label>
        <label className="field">DNI <span>opcional</span><input inputMode="numeric" maxLength={8} value={form.documentNumber ?? ''} onChange={(event) => change('documentNumber', event.target.value.replace(/\D/g, ''))} placeholder="8 dígitos" /></label>
        <label className="field">Nombre preferido <span>opcional</span><input value={form.preferredName ?? ''} onChange={(event) => change('preferredName', event.target.value)} placeholder="Ej. Pepito Salas" /></label>

    <label className="field">Teléfono del participante <span>opcional</span><input type="tel" maxLength={30} value={form.phone ?? ''} onChange={e=>change('phone',e.target.value)} /></label>
    <label className="field">Correo <span>opcional</span><input type="email" maxLength={200} value={form.email ?? ''} onChange={e=>change('email',e.target.value)} /></label>
    <label className="field">Nombres del padre/madre/tutor {guardianRequired ? null : <span>opcional</span>}<input maxLength={100} required={guardianRequired} value={form.guardianFirstName ?? ''} onChange={e=>change('guardianFirstName',e.target.value)} /></label>
    <label className="field">Apellidos del padre/madre/tutor {guardianRequired ? null : <span>opcional</span>}<input maxLength={100} required={guardianRequired} value={form.guardianLastName ?? ''} onChange={e=>change('guardianLastName',e.target.value)} /></label>
    <label className="field">Teléfono del tutor <span>opcional</span><input type="tel" maxLength={30} value={form.guardianPhone ?? ''} onChange={e=>change('guardianPhone',e.target.value)} /></label>
  </>
}
