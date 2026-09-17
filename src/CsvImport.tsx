import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { previewRegistrationCsv, REGISTRATION_COLUMNS } from './lib/registrationCsv'
import type { CsvPreview } from './lib/registrationCsv'

export function CsvImport({ onCreated }: { onCreated: () => void }) {
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [sessions, setSessions] = useState<{ id: string; name: string }[]>([])
  const [session, setSession] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [fileName, setFileName] = useState('')
  useEffect(() => {
    let active = true
    if (supabase) void supabase.from('sessions').select('id,name').in('status', ['DRAFT', 'ACTIVE']).order('year', { ascending: false }).then(({ data, error }) => {
      if (!active) return
      if (error) setError('No pudimos cargar las sesiones. Recarga la página.')
      else setSessions(data ?? [])
    })
    return () => { active = false }
  }, [])
  async function choose(file?: File) {
    setPreview(null); setError(''); setSuccess(''); setFileName('')
    if (!file) return
    setReading(true)
    try {
      if (file.size > 2_000_000) throw new Error('El CSV supera el límite de 2 MB.')
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      setPreview(previewRegistrationCsv(text))
      setFileName(file.name)
    } catch (e) { setError(e instanceof TypeError ? 'Guarda el archivo como CSV UTF-8.' : e instanceof Error ? e.message : 'No pudimos leer el CSV.') }
    finally { setReading(false) }
  }
  function template() {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + REGISTRATION_COLUMNS.map(c => `"${c}"`).join(',') + '\r\n'], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'fsy-inscritos-plantilla.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function save() {
    if (!supabase || !session || !preview || preview.errors.length || busy) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const result = await supabase.rpc('import_registration_csv', { p_session_id: session, p_rows: preview.rows })
      if (result.error) {
        const match = result.error.message.match(/POSSIBLE_DUPLICATE (\d+)/)
        throw new Error(match ? `El registro ${match[1]} coincide con un inscrito existente. No se guardó esta carga; revisa el archivo.` : 'No se pudo completar la carga. Comprueba la sesión y tus permisos. Puedes reintentar: las filas idénticas ya guardadas no se duplicarán.')
      }
      setSuccess(`${result.data.imported} inscritos agregados. ${result.data.skipped} filas idénticas ya existentes omitidas.`)
      setPreview(null); onCreated()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la carga.') }
    finally { setBusy(false) }
  }
  return <section className="admin-panel csv-import" aria-labelledby="csv-title">
    <div className="section-heading"><div><h2 id="csv-title">Importar inscritos desde CSV</h2><p>Conserva las respuestas del formulario y crea los barrios dentro de su estaca.</p></div></div>
    <div className="form-stack">
      <button className="button button--secondary" onClick={template}>Descargar plantilla de 28 columnas</button>
      <label className="field">Sesión de destino<select value={session} onChange={e => { setSession(e.target.value); setSuccess('') }} disabled={busy}><option value="">Selecciona la sesión</option>{sessions.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
      {!sessions.length ? <p className="muted">{supabase ? 'Primero debe configurarse una sesión. Puedes revisar el CSV mientras tanto.' : 'Modo demo: puedes revisar el CSV; el guardado requiere una sesión real.'}</p> : null}
      <label className="field">Archivo de inscritos<input type="file" accept=".csv,text/csv" disabled={busy || reading} onChange={e => { void choose(e.target.files?.[0]); e.target.value = '' }} /></label>
      {fileName ? <p className="csv-file-name">Archivo revisado: <strong>{fileName}</strong></p> : null}
      <p className="muted">CSV UTF-8, separado por coma o punto y coma. Máximo 500 inscritos y 2 MB. Usa fechas AAAA-MM-DD.</p>
      {reading ? <p role="status">Leyendo archivo…</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="form-success" role="status">{success}</p> : null}
      {preview ? <>
        <p role="status"><strong>{preview.rows.length} registros</strong> · {new Set(preview.rows.map(r => r.Estaca.trim().toLowerCase())).size} estacas · {new Set(preview.rows.map(r => `${r.Estaca.trim().toLowerCase()}|${r.Barrio.trim().toLowerCase()}`)).size} barrios. Aún no se han guardado.</p>
        {preview.errors.length ? <div role="alert"><strong>Corrige estos errores en el CSV y vuelve a seleccionarlo:</strong><ul>{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div> : null}
        {preview.warnings.length ? <details><summary>{preview.warnings.length} registros con respuestas vacías</summary><ul>{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul></details> : null}
        <div className="csv-preview" aria-label="Vista previa de inscritos">{preview.rows.map((r, i) => <details key={i}><summary>{i + 2}. {r['Nombre de pila']} {r.Apellido} · {r.Barrio} · {r.Estaca}</summary><dl>{preview.headers.map(h => <div key={h}><dt>{h}</dt><dd>{r[h] || 'Sin respuesta'}</dd></div>)}</dl></details>)}</div>
        <p>Las respuestas originales quedan restringidas a administración. Esta carga no aprueba documentos ni confirma cupos.</p>
        <button className="button button--primary" onClick={save} disabled={busy || !!preview.errors.length || !session || !supabase}>{busy ? 'Importando…' : `Confirmar carga de ${preview.rows.length} inscritos`}</button>
      </> : null}
    </div>
  </section>
}
