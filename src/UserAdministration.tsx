import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'
import { ROLE_LABELS } from './types'
import type { AdminUnit, Role } from './types'

type Account = { id: string; username: string; display_name: string; role: Role; unit_id: string | null }
export function UserAdministration({ units }: { units: AdminUnit[] }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [role, setRole] = useState<'UNIT_LEADER' | 'REVIEWER'>('UNIT_LEADER')
  const [unitId, setUnitId] = useState('')
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  async function load() {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    const result = await supabase.from('profiles').select('id,username,display_name,role,unit_id').order('display_name')
    if (result.error) setError('No pudimos cargar las cuentas. Recarga esta sección antes de crear usuarios.')
    else setAccounts(result.data as Account[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const available = units.filter(u => !accounts.some(a => a.role === 'UNIT_LEADER' && a.unit_id === u.id))
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy || loading) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-user', { body: {
        username: username.trim().toLowerCase(), displayName: name.trim(), password, role,
        unitId: role === 'UNIT_LEADER' ? unitId : null,
      } })
      if (error) {
        let code = ''
        if (error.context instanceof Response) {
          try { code = (await error.context.json()).error } catch { /* Response may be non-JSON. */ }
        }
        const messages: Record<string, string> = {
          NOT_ALLOWED: 'Solo el administrador principal puede crear cuentas.',
          UNAUTHORIZED: 'Tu sesión expiró. Vuelve a ingresar.',
          UNIT_HAS_ACCOUNT: 'Este barrio ya tiene una cuenta.',
          USERNAME_EXISTS: 'Ese usuario ya existe. Elige otro nombre.',
          UNIT_REQUIRED: 'Selecciona un barrio disponible.',
          INVALID_INPUT: 'Revisa el usuario, nombre y contraseña de al menos 12 caracteres.',
        }
        throw new Error(messages[code] ?? 'No se confirmó la creación. Revisa la lista de cuentas antes de reintentar.')
      }
      if (!data?.id) throw new Error('No se confirmó la creación. Revisa la lista de cuentas.')
      setSuccess(`Cuenta ${data.username} creada como ${ROLE_LABELS[role]}.`)
      setPassword(''); setUsername(''); setName(''); setUnitId('')
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos crear la cuenta.') }
    finally { await load(); setBusy(false) }
  }
  return <section className="admin-panel" aria-labelledby="users-title">
    <div className="section-heading"><div><h2 id="users-title">Usuarios y supervisores</h2><p>Una cuenta por barrio. Los supervisores revisan expedientes de todas las unidades del portal.</p></div></div>
    {!supabase ? <p className="muted">La creación de cuentas requiere conexión real a Supabase.</p> : null}
    <form className="admin-import-form" onSubmit={submit}>
      <label className="field">Tipo de cuenta<select value={role} disabled={busy} onChange={e => { setRole(e.target.value as typeof role); setUnitId('') }}><option value="UNIT_LEADER">Cuenta de barrio</option><option value="REVIEWER">Supervisor</option></select></label>
      {role === 'UNIT_LEADER' ? <label className="field">Barrio<select value={unitId} onChange={e => setUnitId(e.target.value)} required disabled={busy || loading}><option value="">Selecciona un barrio sin cuenta</option>{available.map(u => <option value={u.id} key={u.id}>{u.stakeName} · {u.name}</option>)}</select></label> : <p className="muted">Puede revisar, observar y aprobar documentos, confirmar expedientes completos y atender permutas. No administra usuarios.</p>}
      {role === 'UNIT_LEADER' && !loading && !available.length ? <p className="field--wide">No hay barrios disponibles. Primero configura las unidades de la sesión o revisa si ya tienen cuenta.</p> : null}
      <label className="field">Usuario<input value={username} onChange={e => setUsername(e.target.value)} pattern="[a-z0-9][a-z0-9._\-]{2,63}" minLength={3} maxLength={64} autoCapitalize="none" autoComplete="off" placeholder="barrio.ventanilla" required disabled={busy} /><small>Minúsculas, números, puntos, guiones o guion bajo.</small></label>
      <label className="field">Nombre visible<input value={name} onChange={e => setName(e.target.value)} maxLength={100} required disabled={busy} placeholder={role === 'UNIT_LEADER' ? 'Barrio Ventanilla' : 'Nombre del supervisor'} /></label>
      <label className="field">Contraseña inicial<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /><small>Mínimo 12 caracteres. Entrégala personalmente al responsable.</small></label>
      <div className="field--wide"><p>El usuario ingresa con este nombre y contraseña; no se enviará un correo. Podrá cambiar la contraseña desde su cuenta.</p>{error ? <p className="form-error" role="alert">{error}</p> : null}{success ? <p className="form-success" role="status">{success}</p> : null}<button className="button button--primary" disabled={!supabase || busy || loading || (role === 'UNIT_LEADER' && !available.some(u => u.id === unitId))}>{busy ? 'Creando…' : 'Crear cuenta'}</button></div>
    </form>
    <div className="section-heading"><h3>Cuentas existentes</h3><button className="button button--quiet" disabled={busy || loading} onClick={() => void load()}>Actualizar</button></div>
    {loading ? <p role="status">Cargando cuentas…</p> : <ul className="account-list">{accounts.map(a => <li key={a.id}><strong>{a.display_name}</strong><span>{a.username} · {ROLE_LABELS[a.role]}</span>{a.unit_id ? <small>{units.find(u => u.id === a.unit_id)?.name ?? 'Unidad asignada'}</small> : null}</li>)}</ul>}
  </section>
}
