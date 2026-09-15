import { useState } from 'react'
import type { DocumentItem, Repository } from './types'

const stateText = {
  UNAVAILABLE: 'Revisión manual disponible', PENDING: 'Archivo guardado · análisis pendiente',
  PROCESSING: 'Analizando documento…', COMPLETE: 'Análisis finalizado · revisión humana',
  FAILED: 'No pudimos completar el análisis',
}

export function DocumentReview({ document: doc, repository, canReview, onChanged }: {
  document: DocumentItem; repository: Repository; canReview: boolean; onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [url, setUrl] = useState('')
  const [urlVersion, setUrlVersion] = useState('')
  const [openedVersion, setOpenedVersion] = useState('')
  const [notice, setNotice] = useState('')
  const analysis = doc.analysis
  const stale = analysis?.updatedAt && Date.now() - Date.parse(analysis.updatedAt) > 120000
  const retry = doc.status === 'UNDER_REVIEW' && analysis && analysis.attempts < 3 && (['FAILED', 'UNAVAILABLE'].includes(analysis.status) || (stale && analysis.status !== 'COMPLETE'))
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Inténtalo nuevamente.') }
    finally { setBusy(false) }
  }
  if (!doc.versionId) return null
  const open = (id: string) => run(async () => { setUrl(await repository.getDocumentUrl(id)); setUrlVersion(id); setOpenedVersion('') })
  const review = (status: 'APPROVED' | 'OBSERVED') => run(async () => {
    await repository.reviewDocument(doc.versionId!, status, note)
    await onChanged(); setNotice(status === 'APPROVED' ? 'Documento aprobado.' : 'Corrección enviada al líder.'); setNote('')
  })
  return <div className="document-review">
    {analysis ? <div className="analysis-status" role="status"><span className={`analysis-dot analysis-dot--${analysis.status.toLowerCase()}`} /><div><strong>{doc.status === 'APPROVED' ? 'Revisión completada por FSY' : stateText[analysis.status]}</strong>{analysis.note ? <p>{analysis.note}</p> : null}{['FAILED', 'UNAVAILABLE'].includes(analysis.status) ? <p>El archivo está guardado. El equipo puede revisarlo sin esperar a la IA.</p> : null}</div></div> : null}
    <details>
      <summary>{canReview ? 'Revisar archivo y hallazgos' : 'Ver archivo e historial'} <span>Versión {doc.versionNumber ?? 1}</span></summary>
      <div className="review-content">
        <button className="button button--secondary" disabled={busy} onClick={() => open(doc.versionId!)}>Preparar vista del archivo</button>
        {url ? <a className="file-link" href={url} onClick={() => setOpenedVersion(urlVersion)} target="_blank" rel="noopener noreferrer">Abrir archivo privado en otra pestaña (enlace temporal)</a> : null}
        {canReview && analysis?.result ? <><ul className="analysis-checks">{([
          ['Formato esperado', analysis.result.formatoCorresponde], ['Documento legible', analysis.result.documentoLegible],
          ['Páginas completas', analysis.result.todasLasPaginasPresentes], ['Nombre identificado', analysis.result.nombreIdentificado],
          ['Firma visible', analysis.result.firmaDetectada],
        ] as const).map(([label, ok]) => <li key={label}><span>{label}</span><strong>{ok === null ? 'No aplica' : ok ? 'Detectado' : 'Por revisar'}</strong></li>)}</ul>
          <p className="review-disclaimer">Hallazgos orientativos. Comprueba identidad, firmas y consentimiento en el original.</p>
          <details><summary>Datos extraídos · uso del revisor</summary><dl className="extracted-data">{Object.entries(analysis.result.datos).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1')}</dt><dd>{value ?? 'No identificado'}</dd></div>)}</dl></details>
        </> : null}
        {canReview ? <div className="review-decision"><label className="field">Indicación para el líder<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="Explica qué debe corregir y cómo hacerlo." /></label><p>Abre el archivo antes de decidir. Para solicitar una corrección, escribe una indicación.</p><div className="review-buttons"><button className="button button--primary" disabled={busy || openedVersion !== doc.versionId} onClick={() => review('APPROVED')}>Aprobar documento</button><button className="button button--secondary" disabled={busy || !note.trim() || openedVersion !== doc.versionId} onClick={() => review('OBSERVED')}>Solicitar corrección</button></div></div> : null}
        {doc.history?.length ? <details><summary>Historial de versiones</summary><ul className="version-list">{doc.history.map(v => <li key={v.id}><span>v{v.number} · {v.fileName} · {v.status === 'APPROVED' ? 'Aprobado' : v.status === 'OBSERVED' ? 'Observado' : 'Recibido'}</span><button className="text-button" disabled={busy} onClick={() => open(v.id)}>Ver archivo</button></li>)}</ul></details> : null}
      </div>
    </details>
    {retry ? <button className="text-button" disabled={busy} onClick={() => run(async () => { await repository.retryAnalysis(doc.versionId!); await onChanged(); setNotice('Análisis solicitado.') })}>Reintentar análisis</button> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {notice ? <p className="form-success" role="status">{notice}</p> : null}
  </div>
}
