import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createRepository } from './data/repository'
import { ParticipantFields } from './ParticipantFields'
import { ReplacementPanel, ReplacementQueue } from './Replacements'
import { DocumentReview } from './DocumentReview'
import { CsvImport } from './CsvImport'
import { UserAdministration } from './UserAdministration'
import { supabase } from './lib/supabase'
import { Icon } from './icons'
import type { AdminUnit, DashboardData, DocumentItem, DocumentType, ParticipantDetail, ParticipantImportInput, ParticipantSummary, Repository, Viewer } from './types'
import { STATUS_LABELS, ROLE_LABELS } from './types'

const repository = createRepository()

type Route =
  | { page: 'home' }
  | { page: 'participants' }
  | { page: 'participant'; id: string }
  | { page: 'help' }
  | { page: 'account' }
  | { page: 'admin' }

function parseRoute(): Route {
  const path = window.location.hash.replace(/^#\/?/, '')
  if (!path || path === 'inicio') return { page: 'home' }
  if (path === 'jovenes') return { page: 'participants' }
  if (path.startsWith('jovenes/')) return { page: 'participant', id: path.split('/')[1] }
  if (path === 'ayuda') return { page: 'help' }
  if (path === 'cuenta') return { page: 'account' }
  if (path === 'revision') return { page: 'admin' }
  return { page: 'home' }
}

function go(path = 'inicio') {
  window.location.hash = `#/${path}`
}

function useAsync<T>(loader: () => Promise<T>, dependencies: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const reload = () => {
    setLoading(true)
    setError('')
    loader()
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'No pudimos cargar la información.'))
      .finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, dependencies)
  return { data, error, loading, reload, setData }
}

export default function App() {
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [route, setRoute] = useState<Route>(parseRoute)
  const [restoring, setRestoring] = useState(true)

  useEffect(() => {
    repository.restoreSession().then(setViewer).catch(() => setViewer(null)).finally(() => setRestoring(false))
    const onHashChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (restoring) return <BootScreen />
  if (!viewer) return <Login repository={repository} onSignedIn={setViewer} />

  return (
    <AppShell viewer={viewer} route={route}>
      {route.page === 'home' ? <Dashboard viewer={viewer} /> : null}
      {route.page === 'participants' ? <Participants viewer={viewer} /> : null}
      {route.page === 'participant' ? <Participant key={route.id} id={route.id} viewer={viewer} /> : null}
      {route.page === 'help' ? <Help /> : null}
      {route.page === 'account' ? <Account viewer={viewer} onSignOut={() => setViewer(null)} /> : null}
      {route.page === 'admin' ? <AdminQueue viewer={viewer} /> : null}
    </AppShell>
  )
}

function BootScreen() {
  return (
    <main className="boot-screen" aria-label="Cargando portal">
      <BrandMark large />
      <div className="boot-line" />
    </main>
  )
}

function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <div className={`brand-mark ${large ? 'brand-mark--large' : ''}`} aria-label="FSY 2027">
      <span>FSY</span><strong>27</strong><i />
    </div>
  )
}

function Login({ repository, onSignedIn }: { repository: Repository; onSignedIn: (viewer: Viewer) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      onSignedIn(await repository.signIn(username, password))
      go('inicio')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos iniciar sesión.')
    } finally {
      setBusy(false)
    }
  }

  const demo = async (role: 'leader' | 'admin') => {
    setBusy(true)
    setError('')
    try {
      onSignedIn(await repository.signInDemo(role))
      go(role === 'admin' ? 'revision' : 'inicio')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos abrir el demo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-layout">
      <section className="login-story" aria-labelledby="login-title">
        <BrandMark large />
        <div className="login-story__copy">
          <p className="eyebrow">Lima Noroeste · Sesión 2 · 2027</p>
          <h1 id="login-title">Tus jóvenes.<br />Lo que falta.<br /><em>Un camino claro.</em></h1>
          <p>Aquí están tus jóvenes. Nosotros te mostramos qué falta. Tú completas lo pendiente.</p>
        </div>
        <div className="login-path" aria-hidden="true"><span /><span /><span /></div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Portal de confirmación</p>
          <h2>Bienvenido</h2>
          <p className="muted">Ingresa con la cuenta asignada a tu unidad.</p>
          <form onSubmit={submit} className="form-stack">
            <label>
              Usuario
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="barrio.ventanilla" required />
            </label>
            <label>
              Contraseña
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="••••••••" required />
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button--primary button--wide" disabled={busy} type="submit">{busy ? 'Ingresando…' : 'Ingresar'}</button>
          </form>

          {repository.mode === 'demo' ? (
            <div className="demo-access">
              <div><span>Modo demo</span><small>Sin datos reales</small></div>
              <button className="button button--quiet" onClick={() => demo('leader')} disabled={busy}>Ver como líder</button>
              <button className="button button--quiet" onClick={() => demo('admin')} disabled={busy}>Ver revisión FSY</button>
            </div>
          ) : null}
        </div>
        <p className="privacy-note"><Icon name="shield" size={17} /> Tus documentos se almacenan de forma privada.</p>
      </section>
    </main>
  )
}

function AppShell({ viewer, route, children }: { viewer: Viewer; route: Route; children: ReactNode }) {
  const leaderNav = [
    { page: 'home', path: 'inicio', label: 'Inicio', icon: 'home' as const },
    { page: 'participants', path: 'jovenes', label: 'Jóvenes', icon: 'users' as const },
    { page: 'help', path: 'ayuda', label: 'Ayuda', icon: 'help' as const },
    { page: 'account', path: 'cuenta', label: 'Cuenta', icon: 'account' as const },
  ]
  const canReview = ['SUPER_ADMIN', 'SESSION_ADMIN', 'REVIEWER'].includes(viewer.role)
  const mobileNav = canReview ? [leaderNav[0], leaderNav[1], { page: 'admin', path: 'revision', label: 'Operación', icon: 'shield' as const }, leaderNav[3]] : leaderNav

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BrandMark />
        <nav aria-label="Navegación principal">
          {leaderNav.slice(0, 2).map((item) => <NavButton key={item.path} item={item} active={route.page === item.page} />)}
          {canReview ? <NavButton item={{ page: 'admin', path: 'revision', label: 'Revisión', icon: 'shield' }} active={route.page === 'admin'} /> : null}
          <NavButton item={leaderNav[2]} active={route.page === 'help'} />
        </nav>
        <div className="sidebar__bottom">
          <button className={`nav-button ${route.page === 'account' ? 'is-active' : ''}`} onClick={() => go('cuenta')}>
            <span className="unit-avatar">{viewer.displayName.slice(0, 2).toUpperCase()}</span>
            <span><strong>{viewer.unitName ?? viewer.displayName}</strong><small>{viewer.stakeName ?? 'Equipo FSY'}</small></span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        {repository.mode === 'demo' ? <div className="demo-banner">Modo demo · no contiene datos personales reales</div> : null}
        <main className="page-content">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Navegación móvil">
        {mobileNav.map((item) => <NavButton key={item.path} item={item} active={route.page === item.page} compact />)}
      </nav>
    </div>
  )
}

function NavButton({ item, active, compact = false }: { item: { path: string; label: string; icon: 'home' | 'users' | 'help' | 'account' | 'shield'; page: string }; active: boolean; compact?: boolean }) {
  return (
    <button className={`nav-button ${active ? 'is-active' : ''} ${compact ? 'nav-button--compact' : ''}`} onClick={() => go(item.path)} aria-current={active ? 'page' : undefined}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </button>
  )
}

function Dashboard({ viewer }: { viewer: Viewer }) {
  const { data, error, loading } = useAsync(() => repository.getDashboard(), [viewer.id])
  if (loading) return <PageSkeleton />
  if (error || !data) return <ErrorState message={error} />

  const days = data.session.deadline ? daysUntil(data.session.deadline) : 0
  const attentionText = data.attention === 1 ? '1 joven necesita atención' : `${data.attention} jóvenes necesitan atención`

  return (
    <div className="page-stack dashboard-page">
      <header className="page-header page-header--dashboard">
        <div>
          <p className="eyebrow">{data.session.name}</p>
          <h1>Hola, {viewer.unitName ?? viewer.displayName}</h1>
          <p className="lead">{data.attention ? attentionText : 'Todo está encaminado por ahora.'}</p>
        </div>
        {viewer.role !== 'UNIT_LEADER' ? <button className="button button--secondary desktop-only" onClick={() => go('revision')}><Icon name="shield" size={18} /> Abrir revisión</button> : null}
      </header>

      {data.session.deadline ? <section className="deadline-card" aria-label={`${days} días para completar expedientes`}>
        <div className="deadline-stamp"><strong>{Math.max(days, 0)}</strong><span>días</span></div>
        <div className="deadline-copy">
          <p>{days > 7 ? 'para completar tus expedientes' : days > 2 ? 'restantes para completar tus expedientes' : 'para resolver lo pendiente'}</p>
          <strong>{formatDate(data.session.deadline)}</strong>
          {days <= 2 && data.attention ? <small>{attentionText}</small> : null}
        </div>
        <div className="deadline-path" aria-hidden="true"><i /><i /><i /><i /></div>
      </section> : <section className="info-banner"><Icon name="clock" /><div><strong>Plazo pendiente de configuración</strong><p>El equipo FSY publicará aquí la fecha límite para completar los expedientes.</p></div></section>}

      <section className="summary-row" aria-label="Resumen de participantes">
        <SummaryMetric value={data.total} label="Tus participantes" />
        <SummaryMetric value={data.confirmed} label="Confirmados" tone="success" />
        <SummaryMetric value={data.attention} label="Requieren atención" tone="warning" />
        <SummaryMetric value={data.underReview} label="En revisión" tone="info" />
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">Primero lo importante</p><h2>Necesitan tu atención</h2></div>
          <button className="text-button" onClick={() => go('jovenes')}>Ver todos <Icon name="chevron" size={17} /></button>
        </div>
        {data.attentionParticipants.length ? (
          <div className="attention-list">
            {data.attentionParticipants.map((participant) => (
              <button className="attention-item" key={participant.id} onClick={() => go(`jovenes/${participant.id}`)}>
                <StatusGlyph status={participant.status} />
                <span className="attention-item__body"><strong>{participant.preferredName}</strong>{participant.isReplacementCandidate ? <small className="candidate-label">Reemplazo propuesto</small> : null}<small>{participant.pendingDocuments.slice(0, 2).join(' · ')}</small></span>
                <span className="attention-item__action">{participant.status === 'OBSERVED' ? 'Corregir' : 'Completar'} <Icon name="chevron" size={17} /></span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state compact"><Icon name="check" /><div><strong>No hay pendientes</strong><p>Todos tus expedientes están enviados o confirmados.</p></div></div>
        )}
      </section>
    </div>
  )
}

function SummaryMetric({ value, label, tone = 'default' }: { value: number; label: string; tone?: string }) {
  return <div className={`summary-metric summary-metric--${tone}`}><strong>{value}</strong><span>{label}</span></div>
}

function Participants({ viewer }: { viewer: Viewer }) {
  const isMultiUnit = viewer.role !== 'UNIT_LEADER'
  const { data, error, loading } = useAsync(() => repository.getParticipants(), [])
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [filter, setFilter] = useState<'all' | 'attention' | 'review' | 'confirmed'>('all')
  const [unitFilter, setUnitFilter] = useState('all')

  const units = useMemo(() => {
    if (!isMultiUnit) return []
    return Array.from(new Set((data ?? []).map((participant) => participant.unitName).filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b, 'es'))
  }, [data, isMultiUnit])

  const filtered = useMemo(() => {
    const term = deferredQuery.trim().toLocaleLowerCase('es')
    return (data ?? []).filter((participant) => {
      const matchesQuery = !term || participant.fullName.toLocaleLowerCase('es').includes(term) || participant.maskedDocument.includes(term)
      const matchesFilter = filter === 'all'
        || (filter === 'attention' && ['DOCUMENTS_PENDING', 'OBSERVED'].includes(participant.status))
        || (filter === 'review' && ['DOCUMENTS_COMPLETE', 'UNDER_REVIEW'].includes(participant.status))
        || (filter === 'confirmed' && participant.status === 'CONFIRMED')
      const matchesUnit = !isMultiUnit || unitFilter === 'all' || participant.unitName === unitFilter
      return matchesQuery && matchesFilter && matchesUnit
    })
  }, [data, deferredQuery, filter, isMultiUnit, unitFilter])

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{isMultiUnit ? 'Todas las unidades' : 'Tu unidad'}</p>
          <h1>{isMultiUnit ? 'Participantes' : 'Mis jóvenes'}</h1>
          <p className="lead">{isMultiUnit ? 'Participantes de todas las unidades de la sesión. Usa el filtro para acotar por unidad.' : 'Encuentra rápidamente quién está listo y quién necesita una acción.'}</p>
        </div>
      </header>
      <div className="participant-toolbar">
        <label className="search-field"><Icon name="search" size={19} /><span className="sr-only">Buscar participante</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre" /></label>
        {isMultiUnit && units.length > 1 ? (
          <label className="field field--inline"><span className="sr-only">Filtrar por unidad</span>
            <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
              <option value="all">Todas las unidades</option>
              {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </label>
        ) : null}
        <div className="filter-chips" role="group" aria-label="Filtrar participantes">
          {([['all', 'Todos'], ['attention', 'Atención'], ['review', 'En revisión'], ['confirmed', 'Confirmados']] as const).map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)} className={filter === value ? 'is-active' : ''} aria-pressed={filter === value}>{label}</button>
          ))}
        </div>
      </div>
      {loading ? <ListSkeleton /> : error ? <ErrorState message={error} /> : (
        <>
          <div className={`participant-table desktop-participants ${isMultiUnit ? 'has-unit' : ''}`} role="group" aria-label="Participantes">
            <div className="participant-table__head" aria-hidden="true"><span>Participante</span>{isMultiUnit ? <span>Unidad</span> : null}<span>Sexo</span><span>Documentos</span><span>Estado</span><span /></div>
            {filtered.map((participant) => <ParticipantRow key={participant.id} participant={participant} showUnit={isMultiUnit} />)}
          </div>
          <div className="mobile-participants">{filtered.map((participant) => <ParticipantCard key={participant.id} participant={participant} showUnit={isMultiUnit} />)}</div>
          {!filtered.length ? <div className="empty-state"><Icon name="search" /><div><strong>No encontramos coincidencias</strong><p>Prueba con otro nombre o cambia el filtro.</p></div></div> : null}
        </>
      )}
    </div>
  )
}

function ParticipantRow({ participant, showUnit = false }: { participant: ParticipantSummary; showUnit?: boolean }) {
  return (
    <button className="participant-row" onClick={() => go(`jovenes/${participant.id}`)}>
      <span className="participant-name"><Avatar name={participant.preferredName} sex={participant.sex} /><span><strong>{participant.preferredName}</strong>{participant.isReplacementCandidate ? <small className="candidate-label">Reemplazo propuesto</small> : null}<small>{participant.age} años · {participant.maskedDocument}</small></span></span>
      {showUnit ? <span>{participant.unitName ?? '—'}</span> : null}
      <span>{participant.sex}</span>
      <span><strong>{participant.readyDocuments}/{participant.requiredDocuments}</strong><Progress value={participant.readyDocuments} max={participant.requiredDocuments} compact /></span>
      <span><StatusPill status={participant.status} /></span>
      <span><Icon name="chevron" size={18} /></span>
    </button>
  )
}

function ParticipantCard({ participant, showUnit = false }: { participant: ParticipantSummary; showUnit?: boolean }) {
  return (
    <button className="participant-card" onClick={() => go(`jovenes/${participant.id}`)}>
      <div className="participant-card__top"><Avatar name={participant.preferredName} sex={participant.sex} /><span><strong>{participant.preferredName}</strong>{participant.isReplacementCandidate ? <small className="candidate-label">Reemplazo propuesto</small> : null}<small>{participant.age} años · {participant.sex}{showUnit && participant.unitName ? ` · ${participant.unitName}` : ''}</small></span><Icon name="chevron" size={19} /></div>
      <div className="participant-card__progress"><span>Documentos <strong>{participant.readyDocuments} de {participant.requiredDocuments}</strong></span><Progress value={participant.readyDocuments} max={participant.requiredDocuments} /></div>
      <div className="participant-card__bottom"><StatusPill status={participant.status} /><small>{participant.pendingDocuments.length ? `Faltan ${participant.pendingDocuments.length}` : 'Sin documentos pendientes'}</small></div>
    </button>
  )
}

function Participant({ id, viewer }: { id: string; viewer: Viewer }) {
  const { data, error, loading, setData } = useAsync(() => repository.getParticipant(id), [id])
  const [uploadType, setUploadType] = useState<DocumentType | null>(null)
  const [refreshError, setRefreshError] = useState('')
  const canReview = ['SUPER_ADMIN', 'SESSION_ADMIN', 'REVIEWER'].includes(viewer.role)
  const refresh = async () => { setData(await repository.getParticipant(id)); setRefreshError('') }
  useEffect(() => {
    const pending = (d: DocumentItem) => d.status === 'UNDER_REVIEW' && d.analysis && ['PENDING', 'PROCESSING'].includes(d.analysis.status) && (!d.analysis.updatedAt || Date.now() - Date.parse(d.analysis.updatedAt) < 120000)
    if (!data?.documents.some(pending)) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { const updated = await repository.getParticipant(id); if (!stopped) { setData(updated); setRefreshError('') }; if (!updated.documents.some(pending)) return }
      catch { if (!stopped) setRefreshError('No pudimos actualizar el análisis. Tus archivos siguen guardados.') }
      if (!stopped) timer = setTimeout(poll, 4000)
    }
    timer = setTimeout(poll, 2500)
    return () => { stopped = true; clearTimeout(timer) }
  }, [id, data?.documents.map(d => `${d.status}:${d.analysis?.status}:${d.analysis?.updatedAt}`).join(',')])
  if (loading) return <PageSkeleton />
  if (error || !data) return <ErrorState message={error} />

  const locked = ['CONFIRMED','REPLACED','CANCELLED','REPLACEMENT_REQUESTED'].includes(data.status)
  const complete = data.documents.filter((document) => document.status === 'APPROVED' || document.status === 'UNDER_REVIEW').length
  const groups = [
    { title: 'Formularios', types: ['REGISTRATION_FORM', 'IMAGE_AUTHORIZATION', 'MEDICAL_AUTHORIZATION'] },
    { title: 'Identificación', types: ['PARTICIPANT_DNI_FRONT', 'PARTICIPANT_DNI_BACK', 'GUARDIAN_DNI_FRONT', 'GUARDIAN_DNI_BACK'] },
  ] as const

  return (
    <div className="page-stack participant-detail">
      <button className="back-button" onClick={() => go('jovenes')}><Icon name="arrowLeft" size={18} /> Participantes</button>
      <header className="participant-hero">
        <Avatar name={data.preferredName} sex={data.sex} large />
        <div><StatusPill status={data.status} />{data.isReplacementCandidate ? <span className="candidate-label">Propuesto para reemplazo · aún sin cupo asignado</span> : null}<h1>{data.preferredName}</h1><p>{data.age} años · {data.sex} · {data.maskedDocument}</p></div>
        <div className="participant-hero__progress"><strong>{complete} de {data.requiredDocuments}</strong><span>documentos recibidos</span><Progress value={complete} max={data.requiredDocuments} /></div>
      </header>

      {data.status === 'CONFIRMED' ? <div className="success-banner"><span><Icon name="check" /></span><div><strong>Inscripción confirmada</strong><p>{data.preferredName} está listo para FSY Lima Noroeste · Sesión 2 · 2027.</p></div></div> : null}
      {['DOCUMENTS_COMPLETE', 'UNDER_REVIEW'].includes(data.status) ? <div className="info-banner"><Icon name="clock" /><div><strong>Expediente enviado</strong><p>Ya recibimos toda la información. Ahora será revisada por el equipo FSY.</p></div></div> : null}

      <div className="analysis-guide"><Icon name="shield" /><div><strong>Una revisión que te acompaña</strong><p>Recibimos el archivo, comprobamos su contenido y el equipo FSY decide su aprobación.</p>{repository.mode === 'demo' ? <small>Modo demo: resultados simulados, sin lectura de documentos por IA.</small> : null}</div></div>
      {refreshError ? <p role="alert" className="form-error">{refreshError}</p> : null}
      <section className="detail-grid">
        <div className="detail-main">
          {groups.map((group) => (
            <div className="document-section" key={group.title}>
              <div className="section-heading simple"><h2>{group.title}</h2></div>
              <div className="document-list">
                {data.documents.filter((document) => group.types.some((type) => type === document.type)).map((document) => (
                  <div key={document.type} className="document-entry"><DocumentRow document={document} locked={locked} onUpload={() => setUploadType(document.type)} /><DocumentReview document={document} repository={repository} canReview={canReview && !locked} onChanged={refresh} /></div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <aside className="person-data-card">
          <p className="eyebrow">Datos</p><h2>Participante</h2>
          <DataPair label="Nombre completo" value={data.fullName} />
          <DataPair label="Fecha de nacimiento" value={formatDate(data.birthDate)} />
          <DataPair label="Padre / tutor" value={data.guardianName ?? 'Pendiente'} />
          <p className="data-note"><Icon name="shield" size={17} /> Los datos sensibles se muestran solo cuando son necesarios.</p>
        </aside>
      </section>

      <ReplacementPanel participant={data} viewer={viewer} repository={repository} onChanged={refresh} onOpen={id => go(`jovenes/${id}`)} />
      {uploadType ? (
        <UploadDialog
          participant={data}
          document={data.documents.find((document) => document.type === uploadType)!}
          onClose={() => setUploadType(null)}
          onSaved={(updated) => { setData(updated); setUploadType(null) }}
        />
      ) : null}
    </div>
  )
}

function DocumentRow({ document, onUpload, locked = false }: { document: DocumentItem; onUpload: () => void; locked?: boolean }) {
  const action = locked ? null : document.status === 'OBSERVED' ? 'Corregir' : document.status === 'PENDING' ? 'Agregar' : null
  return (
    <div className={`document-row document-row--${document.status.toLowerCase()}`}>
      <span className="document-icon"><Icon name="file" size={21} /></span>
      <div className="document-row__body">
        <strong>{document.label}</strong>
        {document.status === 'APPROVED' ? <small>Listo</small> : null}
        {document.status === 'UNDER_REVIEW' ? <small>En revisión{document.fileName ? ` · ${document.fileName}` : ''}</small> : null}
        {document.status === 'PENDING' ? <small>Pendiente</small> : null}
        {document.status === 'OBSERVED' ? <small className="observation">{document.observation ?? 'Necesita una corrección.'}</small> : null}
      </div>
      {action ? <button className="button button--small button--secondary" onClick={onUpload}>{action}</button> : <StatusGlyph status={document.status === 'APPROVED' ? 'CONFIRMED' : 'UNDER_REVIEW'} />}
    </div>
  )
}

function UploadDialog({ participant, document, onClose, onSaved }: { participant: ParticipantDetail; document: DocumentItem; onClose: () => void; onSaved: (participant: ParticipantDetail) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [preview, setPreview] = useState('')
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(''); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { dialog?.close(); previous?.focus() }
  }, [])

  const choose = (selected?: File) => {
    if (!selected) return
    setFile(null)
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(selected.type) || !selected.size) return setError('Elige un archivo JPG, PNG, WebP o PDF válido.')
    if (selected.type === 'application/pdf' && selected.size > 12 * 1024 * 1024) return setError('El PDF supera 12 MB. Elige una versión más liviana.')
    if (selected.type.startsWith('image/') && selected.size > 25 * 1024 * 1024) return setError('La foto supera 25 MB. Elige una imagen más liviana.')
    setError('')
    setFile(selected)
  }

  const save = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      onSaved(await repository.uploadDocument(participant.id, document.type, file))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar el archivo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="upload-title" className="upload-dialog" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
      <div className="upload-sheet">
        <div className="upload-sheet__handle" aria-hidden="true" />
        <div className="upload-sheet__header"><div><p className="eyebrow">{participant.preferredName}</p><h2 id="upload-title">{document.label}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar" disabled={busy}>×</button></div>
        {!file ? (
          <div className="upload-choice">
            <p>¿Cómo deseas agregarlo?</p>
            <button onClick={() => cameraRef.current?.click()}><span><Icon name="upload" /></span><div><strong>Tomar una foto</strong><small>Usa la cámara del teléfono</small></div><Icon name="chevron" /></button>
            <button onClick={() => fileRef.current?.click()}><span><Icon name="file" /></span><div><strong>Elegir un archivo</strong><small>Fotos optimizadas automáticamente · PDF máx. 12 MB</small></div><Icon name="chevron" /></button>
            <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => choose(event.target.files?.[0])} />
            <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" onChange={(event) => choose(event.target.files?.[0])} />
          </div>
        ) : (
          <div className="file-preview">
            {preview ? <img className="upload-local-preview" src={preview} alt="Vista previa del documento seleccionado" /> : null}
            <span className="file-preview__icon"><Icon name="file" /></span>
            <div><p>Archivo seleccionado · aún no guardado</p><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></div>
            <button className="text-button" disabled={busy} onClick={() => setFile(null)}>Cambiar</button>
            <div className="file-preview__hint"><Icon name="clock" size={18} /><span>Al guardarlo comenzará el <strong>análisis asistido</strong>. Puedes continuar con otro documento; el equipo FSY toma la decisión final.</span></div>
          </div>
        )}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {file ? <button className="button button--primary button--wide" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar y continuar'}</button> : null}
      </div>
    </dialog>
  )
}

function AdminQueue({ viewer }: { viewer: Viewer }) {
  const canReview = ['SUPER_ADMIN', 'SESSION_ADMIN', 'REVIEWER'].includes(viewer.role)
  const canImport = ['SUPER_ADMIN', 'SESSION_ADMIN'].includes(viewer.role)
  const queue = useAsync(() => canReview ? repository.getAdminQueue() : Promise.resolve([]), [viewer.id])
  const units = useAsync<AdminUnit[]>(() => canImport ? repository.getAdminUnits() : Promise.resolve([]), [viewer.id])
  const [tab, setTab] = useState<'review' | 'import' | 'replacements' | 'users'>('review')
  const [busyId, setBusyId] = useState('')
  const [actionError, setActionError] = useState('')

  if (!canReview) return <ErrorState message="Tu cuenta no tiene permisos para revisar expedientes." />

  const confirm = async (id: string) => {
    setBusyId(id); setActionError('')
    try { await repository.confirmParticipant(id); queue.reload() }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'No pudimos confirmar el expediente.') }
    finally { setBusyId('') }
  }

  return (
    <div className="page-stack">
      <header className="page-header"><div><p className="eyebrow">Equipo FSY</p><h1>Operación de sesión</h1><p className="lead">Revisa documentos, solicita correcciones y confirma expedientes completos.</p></div></header>
      <div className="admin-tabs" role="group" aria-label="Operación administrativa">
        <button aria-pressed={tab === 'review'} className={tab === 'review' ? 'is-active' : ''} onClick={() => setTab('review')}>Revisión {queue.data?.length ? <span>{queue.data.length}</span> : null}</button>
        <button aria-pressed={tab === 'replacements'} className={tab === 'replacements' ? 'is-active' : ''} onClick={() => setTab('replacements')}>Permutas</button>
        {canImport ? <button aria-pressed={tab === 'import'} className={tab === 'import' ? 'is-active' : ''} onClick={() => setTab('import')}>Carga inicial</button> : null}
        {viewer.role === 'SUPER_ADMIN' ? <button aria-pressed={tab === 'users'} className={tab === 'users' ? 'is-active' : ''} onClick={() => setTab('users')}>Usuarios</button> : null}
      </div>

      {tab === 'users' && viewer.role === 'SUPER_ADMIN' ? <UserAdministration units={units.data ?? []} /> : tab === 'replacements' ? <ReplacementQueue repository={repository} onOpen={id => go(`jovenes/${id}`)} /> : tab === 'import' && canImport ? (
        <><CsvImport onCreated={() => { queue.reload(); units.reload() }} /><ParticipantImportForm units={units.data ?? []} loadingUnits={units.loading} loadError={units.error} onCreated={() => queue.reload()} /></>
      ) : (
        <>
          <div className="section-heading"><div><h2>Requieren revisión</h2><p>Aprueba cada documento antes de confirmar la inscripción. Puedes revisar archivos aunque falten otros por enviar.</p></div></div>
          {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
          {queue.loading ? <ListSkeleton /> : queue.error ? <ErrorState message={queue.error} /> : queue.data?.length ? (
            <div className="review-list">
              {queue.data.map((participant) => (
                <article className="review-card" key={participant.id}>
                  <div className="review-card__person"><Avatar name={participant.preferredName} sex={participant.sex} /><div><strong>{participant.preferredName}</strong>{participant.isReplacementCandidate ? <small className="candidate-label">Reemplazo propuesto</small> : null}<small>{participant.sex} · {participant.readyDocuments}/{participant.requiredDocuments} recibidos · {participant.approvedDocuments ?? 0} aprobados</small></div></div>
                  <StatusPill status={participant.status} />
                  <div className="review-card__actions"><button className="button button--quiet" onClick={() => go(`jovenes/${participant.id}`)}>Ver expediente</button><button className="button button--primary" disabled={busyId === participant.id || participant.approvedDocuments !== participant.requiredDocuments || participant.isReplacementCandidate || participant.status === 'REPLACEMENT_REQUESTED'} onClick={() => confirm(participant.id)}>{busyId === participant.id ? 'Confirmando…' : 'Confirmar'}</button></div>
                </article>
              ))}
            </div>
          ) : <div className="empty-state"><Icon name="check" /><div><strong>Bandeja al día</strong><p>No hay expedientes listos para revisión.</p></div></div>}
        </>
      )}
    </div>
  )
}

function ParticipantImportForm({ units, loadingUnits, loadError, onCreated }: { units: AdminUnit[]; loadingUnits: boolean; loadError: string; onCreated: () => void }) {
  const empty: ParticipantImportInput = { unitId: '', firstName: '', lastName: '', birthDate: '', sex: 'Hombre' }
  const [form, setForm] = useState<ParticipantImportInput>(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const change = <K extends keyof ParticipantImportInput,>(field: K, value: ParticipantImportInput[K]) => setForm((current) => ({ ...current, [field]: value }))

  useEffect(() => {
    if (!form.unitId && units[0]) setForm((current) => ({ ...current, unitId: units[0].id }))
  }, [form.unitId, units])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(''); setSuccess('')
    if (!form.unitId || !form.firstName.trim() || !form.lastName.trim() || !form.birthDate) return setError('Completa unidad, nombres, apellido y fecha de nacimiento.')
    if (form.documentNumber && !/^\d{8}$/.test(form.documentNumber)) return setError('El DNI debe tener 8 dígitos.')
    setBusy(true)
    try {
      await repository.createParticipant(form)
      setSuccess(`${form.firstName.trim()} ${form.lastName.trim()} fue agregado a la lista inicial.`)
      setForm((current) => ({ ...empty, unitId: current.unitId }))
      onCreated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos agregar al participante.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-import-card" aria-labelledby="import-title">
      <div className="section-heading"><div><p className="eyebrow">Importación manual</p><h2 id="import-title">Agregar participante</h2><p>Agrega un inscrito individual a una unidad existente. El sistema crea también su cupo para conservar trazabilidad.</p></div></div>
      {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}
      <form className="admin-import-form" onSubmit={submit}>
        <label className="field field--wide">Unidad<select value={form.unitId} onChange={(event) => change('unitId', event.target.value)} required disabled={loadingUnits || !units.length}><option value="">Selecciona una unidad</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.stakeName} · {unit.name}</option>)}</select></label>
        <ParticipantFields form={form} setForm={setForm} />
        <div className="form-feedback field--wide">{error ? <p className="form-error" role="alert">{error}</p> : null}{success ? <p className="form-success" role="status">{success}</p> : null}</div>
        <div className="form-actions field--wide"><button className="button button--primary" type="submit" disabled={busy || loadingUnits || !units.length}>{busy ? 'Agregando…' : 'Agregar participante'}</button></div>
      </form>
    </section>
  )
}

function Help() {
  return (
    <div className="page-stack narrow-page">
      <header className="page-header"><div><p className="eyebrow">Centro de ayuda</p><h1>¿En qué te ayudamos?</h1><p className="lead">Respuestas rápidas para completar expedientes sin detenerte.</p></div></header>
      <div className="help-list">
        <details><summary>¿Qué hago si una foto sale borrosa?</summary><p>Vuelve a tomarla sobre una superficie plana, con buena luz y mostrando las cuatro esquinas del documento.</p></details>
        <details><summary>¿Puedo reemplazar un documento observado?</summary><p>Sí. Abre el expediente, busca el documento con la observación y elige “Corregir”. La versión anterior se conservará en el historial.</p></details>
        <details><summary>¿Qué significa “En revisión”?</summary><p>El archivo ya fue recibido. No necesitas volver a subirlo mientras el equipo FSY lo revisa.</p></details>
      </div>
      <div className="info-banner"><Icon name="help" /><div><strong>Soporte con tickets</strong><p>El canal de tickets y adjuntos está planificado para el MVP 4. Puedes completar y revisar documentos desde este portal.</p></div></div>
    </div>
  )
}

function Account({ viewer, onSignOut }: { viewer: Viewer; onSignOut: () => void }) {
  const signOut = async () => { await repository.signOut(); onSignOut(); go('inicio') }
  return (
    <div className="page-stack narrow-page">
      <header className="page-header"><div><p className="eyebrow">Cuenta</p><h1>{viewer.displayName}</h1><p className="lead">{viewer.stakeName ?? 'Administración de sesión'}</p></div></header>
      <section className="account-card">
        <DataPair label="Usuario" value={viewer.username} />
        <DataPair label="Rol" value={ROLE_LABELS[viewer.role]} />
        {viewer.unitName ? <DataPair label="Unidad" value={viewer.unitName} /> : null}
        {supabase ? <ChangePassword /> : null}
        <button className="button button--danger button--wide" onClick={signOut}><Icon name="logout" size={18} /> Cerrar sesión</button>
      </section>
    </div>
  )
}

function ChangePassword() {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setSuccess('')
    if (password !== repeat) { setError('Las contraseñas no coinciden.'); return }
    if (!supabase || busy) return
    setBusy(true)
    try {
      const result = await supabase.auth.updateUser({ password })
      if (result.error) throw result.error
      setPassword(''); setRepeat(''); setSuccess('Contraseña actualizada.')
    } catch { setError('No pudimos actualizarla. Vuelve a iniciar sesión e inténtalo nuevamente.') }
    finally { setBusy(false) }
  }
  return <details><summary>Cambiar contraseña</summary><form className="form-stack" onSubmit={save}>
    <label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /></label>
    <label>Repetir contraseña<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={repeat} onChange={e => setRepeat(e.target.value)} required disabled={busy} /></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}{success ? <p role="status">{success}</p> : null}
    <button className="button button--secondary" disabled={busy}>{busy ? 'Guardando…' : 'Actualizar contraseña'}</button>
  </form></details>
}

function DataPair({ label, value }: { label: string; value: string }) {
  return <div className="data-pair"><span>{label}</span><strong>{value}</strong></div>
}

function StatusPill({ status }: { status: ParticipantSummary['status'] }) {
  const tone = status === 'CONFIRMED' ? 'success' : status === 'OBSERVED' ? 'danger' : status === 'DOCUMENTS_PENDING' || status === 'REGISTERED' ? 'warning' : 'info'
  return <span className={`status-pill status-pill--${tone}`}>{STATUS_LABELS[status]}</span>
}

function StatusGlyph({ status }: { status: ParticipantSummary['status'] | 'APPROVED' }) {
  const ok = status === 'CONFIRMED' || status === 'APPROVED'
  const warning = status === 'OBSERVED' || status === 'DOCUMENTS_PENDING'
  return <span className={`status-glyph ${ok ? 'is-success' : warning ? 'is-warning' : 'is-info'}`}><Icon name={ok ? 'check' : warning ? 'alert' : 'clock'} size={18} /></span>
}

function Avatar({ name, sex, large = false }: { name: string; sex: 'Hombre' | 'Mujer'; large?: boolean }) {
  const initials = name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return <span className={`avatar avatar--${sex === 'Mujer' ? 'sky' : 'navy'} ${large ? 'avatar--large' : ''}`} aria-hidden="true">{initials}</span>
}

function Progress({ value, max, compact = false }: { value: number; max: number; compact?: boolean }) {
  const percent = max ? Math.round((value / max) * 100) : 0
  return <span className={`progress ${compact ? 'progress--compact' : ''}`} aria-label={`${value} de ${max} documentos`}><i style={{ width: `${percent}%` }} /></span>
}

function ErrorState({ message }: { message: string }) {
  return <div className="empty-state error-state"><Icon name="alert" /><div><strong>No pudimos mostrar esta sección</strong><p>{message || 'Inténtalo nuevamente.'}</p></div></div>
}

function PageSkeleton() {
  return <div className="page-stack" aria-label="Cargando"><div className="skeleton skeleton--title" /><div className="skeleton skeleton--hero" /><div className="skeleton-grid"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div><div className="skeleton skeleton--list" /></div>
}

function ListSkeleton() {
  return <div className="skeleton-list" aria-label="Cargando participantes"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div>
}

function daysUntil(date: string) {
  const end = new Date(`${date}T23:59:59`).getTime()
  return Math.ceil((end - Date.now()) / 86_400_000)
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
