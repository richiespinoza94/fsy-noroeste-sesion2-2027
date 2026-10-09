import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marcarAsistencia, quitarMarca, subscribeAsistencia } from '../services/asistenciaService';
import { getNextCapacitacion } from '../services/capacitacionesService';
import { subscribeFamilias } from '../services/familiasService';
import { ejecutarReparto } from '../services/repartoFamiliasService';
import { calcularCandidatosPorRol, calcularEstadoFamilia, calcularOActualizarPlanEnVivo, type CandidatoReparto } from '../utils/repartoFamilias';
import { FAMILY_COLORS } from '../data/colors';
import type { Asistencia, Capacitacion, EstadoAsistencia, Familia, Participante, SessionUser } from '../types';
import { filtrarPorCompania, infoCompanias, resumenGrupo, type InfoCompania } from '../utils/companias';
import { agruparEventosParaSelector, hoyLocalISO, infoTipo, tipoDe } from '../utils/tiposEvento';
import { useScrollDirection } from '../utils/useScrollDirection';
import { nombreCorto } from '../utils/nombreCorto';
import QrAsistenciaModal from './QrAsistenciaModal';

export default function AsistenciaScreen({
  user,
  participantes,
  capacitaciones,
  onNavHiddenChange,
}: {
  user: SessionUser;
  participantes: Participante[];
  capacitaciones: Capacitacion[];
  onNavHiddenChange: (hidden: boolean) => void;
}) {
  const handleScroll = useScrollDirection(onNavHiddenChange);
  const [capId, setCapId] = useState('');
  const [asistencia, setAsistencia] = useState<Record<string, Asistencia>>({});
  const [query, setQuery] = useState('');
  // Aviso con "Deshacer" tras marcar (5 s). Reemplaza al bloqueo del botón: la lista
  // ya se actualiza al instante con el dato local, no hace falta esperar al servidor.
  const [aviso, setAviso] = useState<{ texto: string; deshacer?: () => void } | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [qrOpen, setQrOpen] = useState(false);
  // Filtro rápido por compañía: '' = todas · 'sin' = sin compañía · id de una compañía.
  const [filtroCompania, setFiltroCompania] = useState('');
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [asignandoId, setAsignandoId] = useState('');
  // El plan EN VIVO (participanteId → familiaId) — se arma de a pedazos con
  // cada clic, no se recalcula solo. Ver calcularOActualizarPlanEnVivo en
  // repartoFamilias.ts (con 15 pruebas de QA) para la regla exacta: el
  // primer clic en un grupo sin compañía calcula para TODO ese grupo de una
  // vez (no solo para quien se clickeó); los demás, al tocar su propio
  // botón, no recalculan nada — solo confirman lo que ya se sabía. Si
  // llega gente nueva mientras tanto, recién el clic en alguien NUEVO (que
  // no estaba en el plan) dispara un cálculo aparte, solo para los nuevos.
  const [plan, setPlan] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!capId && capacitaciones.length) {
      setCapId(getNextCapacitacion(capacitaciones)?.id || capacitaciones[0].id);
    }
  }, [capacitaciones, capId]);

  useEffect(() => subscribeAsistencia(capId, setAsistencia), [capId]);
  // Solo hace falta para el botón de asignación en vivo (exclusivo de
  // Coordinador General) — se suscribe igual siempre, es liviano (4
  // compañías), más simple que condicionar la suscripción al permiso.
  useEffect(() => subscribeFamilias(setFamilias), []);
  // Cambiar de capacitación es un contexto nuevo — el plan en vivo de la
  // anterior no debería arrastrarse (sería de otro grupo de gente).
  useEffect(() => setPlan({}), [capId]);
  useEffect(() => () => clearTimeout(avisoTimer.current), []);
  useEffect(() => setAviso(null), [capId]);

  const cap = capacitaciones.find((c) => c.id === capId);

  // Número y color de cada compañía: sale de datos que la pantalla YA tiene (familias +
  // familiaId de cada persona), así que mostrar "(2)" y filtrar no cuesta ninguna lectura.
  const companias = useMemo(() => infoCompanias(familias), [familias]);
  const conCompania = useMemo(() => participantes.reduce((n, p) => n + (companias.has(p.familiaId) ? 1 : 0), 0), [participantes, companias]);
  // Si la compañía elegida deja de existir, se vuelve a "Todas" sin tocar el estado.
  const filtroActivo = filtroCompania === 'sin' || companias.has(filtroCompania) ? filtroCompania : '';
  const grupo = useMemo(() => filtrarPorCompania(participantes, filtroActivo, companias), [participantes, filtroActivo, companias]);

  // El POOL de elegibles ahora mismo (presentes, sin compañía, Consejero o
  // Logístico) — listar quién es elegible NO dispara ningún cálculo por sí
  // solo; el cálculo se dispara recién al hacer clic (ver asignarCompania).
  const pendientes = useMemo((): CandidatoReparto[] => {
    if (!user.canRepartirFamilias || !capId) return [];
    const asistenciaArr = Object.values(asistencia);
    const fuente = { modo: 'capacitacion' as const, capacitacionId: capId };
    const referencia = new Date();
    const consejeros = calcularCandidatosPorRol(participantes, asistenciaArr, fuente, 'Consejero', referencia);
    const logisticos = calcularCandidatosPorRol(participantes, asistenciaArr, fuente, 'Logístico', referencia);
    return [...consejeros, ...logisticos];
  }, [user.canRepartirFamilias, capId, asistencia, participantes]);

  async function asignarCompania(p: Participante) {
    // estadosActuales SIEMPRE se recalcula desde participantes/familias
    // reales (lo realmente escrito en Firestore) — nunca desde el plan en
    // sí, para que una persona con resultado ya calculado pero todavía sin
    // confirmar no distorsione el cálculo de alguien nuevo que llega mientras tanto.
    const estadosActuales = familias.map((f) => calcularEstadoFamilia(f.id, participantes.filter((pp) => f.consejeros.includes(pp.id))));
    const { plan: nuevoPlan } = calcularOActualizarPlanEnVivo(plan, p.id, pendientes, estadosActuales);
    setPlan(nuevoPlan);
    const familia = familias.find((f) => f.id === nuevoPlan[p.id]);
    if (!familia) return;
    setAsignandoId(p.id);
    try {
      await ejecutarReparto({ [familia.id]: [p] }, familias, capId, user.correo);
    } finally {
      setAsignandoId('');
    }
  }

  // Prioridad de cada persona para el orden por defecto (sin búsqueda
  // activa): 0 = presente y sin compañía (acción pendiente, lo más
  // urgente para quien puede asignar); 1 = presente (ya con compañía, o
  // sin permiso para asignar); 2 = todavía no marcado. Se calcula UNA vez
  // por persona (no en cada comparación del sort ni en cada fila).
  const prioridad = useMemo(() => {
    const m = new Map<string, 0 | 1 | 2>();
    for (const p of participantes) {
      if (asistencia[p.id]?.estado !== 'presente') m.set(p.id, 2);
      else {
        const necesitaCompania = user.canRepartirFamilias && !p.familiaId && (p.asignacion === 'Consejero' || p.asignacion === 'Logístico');
        m.set(p.id, necesitaCompania ? 0 : 1);
      }
    }
    return m;
  }, [participantes, asistencia, user.canRepartirFamilias]);
  const pendientesIds = useMemo(() => new Set(pendientes.map((c) => c.participante.id)), [pendientes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const list = grupo.filter((p) => `${p.nombres} ${p.apellidos} ${p.estaca}`.toLowerCase().includes(q));
      return [...list].sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es'));
    }
    // Sin búsqueda: quien necesita acción primero, recién llegados después,
    // el resto del roster (sin marcar todavía) al final — así no hay que
    // escarbar entre cientos de personas para ver a quién se acaba de
    // marcar presente.
    return [...grupo].sort((a, b) => {
      const pa = prioridad.get(a.id) ?? 2;
      const pb = prioridad.get(b.id) ?? 2;
      if (pa !== pb) return pa - pb;
      if (pa <= 1) {
        const ta = asistencia[a.id]?.timestamp || '';
        const tb = asistencia[b.id]?.timestamp || '';
        return tb.localeCompare(ta); // más reciente primero
      }
      return a.apellidos.localeCompare(b.apellidos, 'es');
    });
  }, [grupo, query, asistencia, prioridad]);

  const necesitanCompania = useMemo(() => filtered.reduce((n, p) => n + (prioridad.get(p.id) === 0 ? 1 : 0), 0), [filtered, prioridad]);

  // Avance: de todos, o solo del grupo filtrado ("Compañía 2: 7/10").
  const resumen = useMemo(
    () => (filtroActivo ? resumenGrupo(grupo, asistencia) : resumenGrupo(participantes, asistencia)),
    [filtroActivo, grupo, participantes, asistencia]
  );
  const { presentes, total, pct } = resumen;
  const etiquetaGrupo = filtroActivo === 'sin' ? 'Sin compañía' : companias.get(filtroActivo)?.nombre ?? '';

  const mostrarAviso = useCallback((a: { texto: string; deshacer?: () => void }) => {
    clearTimeout(avisoTimer.current);
    setAviso(a);
    avisoTimer.current = setTimeout(() => setAviso(null), 5000);
  }, []);

  // `previo` = lo que había antes: es a lo que vuelve "Deshacer" (sin marca → se borra).
  const marcar = useCallback(
    (p: Participante, next: EstadoAsistencia, previo: EstadoAsistencia | undefined) => {
      const etiqueta = next === 'presente' ? 'presente' : next === 'justificado' ? 'justificado' : 'ausente';
      marcarAsistencia(capId, p.id, next, user.correo).catch(() => mostrarAviso({ texto: 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.' }));
      mostrarAviso({
        texto: `${nombreCorto(p.nombres, p.apellidos)} · ${etiqueta}`,
        deshacer: () => {
          setAviso(null);
          (previo ? marcarAsistencia(capId, p.id, previo, user.correo) : quitarMarca(capId, p.id, user.correo)).catch(() => {});
        },
      });
    },
    [capId, user.correo, mostrarAviso]
  );
  const onToggle = useCallback((p: Participante, actual: EstadoAsistencia | undefined) => marcar(p, actual === 'presente' ? 'ausente' : 'presente', actual), [marcar]);
  const onJustificar = useCallback((p: Participante, actual: EstadoAsistencia | undefined) => marcar(p, 'justificado', actual), [marcar]);
  // asignarCompania cambia en cada render (usa plan/pendientes/familias): se llama por ref
  // para que las filas memoizadas no se redibujen por una función nueva.
  const asignarRef = useRef(asignarCompania);
  asignarRef.current = asignarCompania;
  const onAsignar = useCallback((p: Participante) => void asignarRef.current(p), []);

  const eventos = useMemo(() => agruparEventosParaSelector(capacitaciones, hoyLocalISO()), [capacitaciones]);

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-[#F4F6FA]/95 backdrop-blur px-4 pt-3 pb-3 border-b border-slate-200 z-10">
        <div className="flex gap-2 mb-2">
          <select className="input flex-1" value={capId} onChange={(e) => setCapId(e.target.value)} aria-label="Evento">
            {capacitaciones.length === 0 && <option value="">Sin capacitaciones creadas</option>}
            {eventos.proximos.length > 0 && (
              <optgroup label="Hoy y próximos">
                {eventos.proximos.map((c) => (
                  <option key={c.id} value={c.id}>{infoTipo(tipoDe(c)).icon} {c.label}</option>
                ))}
              </optgroup>
            )}
            {eventos.pasados.length > 0 && (
              <optgroup label="Pasados">
                {eventos.pasados.map((c) => (
                  <option key={c.id} value={c.id}>{infoTipo(tipoDe(c)).icon} {c.label}</option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            onClick={() => setQrOpen(true)}
            disabled={!capId}
            className="shrink-0 bg-accent text-primary font-extrabold text-sm rounded-xl px-4 disabled:opacity-40"
            title="Compartir QR para que la gente marque su propia asistencia"
          >
            QR
          </button>
        </div>
        {cap && !filtroActivo && (
          <div className="text-xs text-slate-500 mb-2">
            📅 {cap.fecha} {cap.hora && `· ${cap.hora}`} · 📍 {cap.lugar}
          </div>
        )}
        <input
          className="input mb-2"
          placeholder="🔍 Buscar por nombre o estaca…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {/* Filtro rápido por compañía — solo si hay compañías con gente. Un toque filtra,
            otro toque sobre el mismo botón vuelve a "Todas". */}
        {conCompania > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 mb-2" role="group" aria-label="Filtrar por compañía">
            {([{ id: '', label: 'Todas' }, ...[...companias.values()].map((c) => ({ id: c.id, label: String(c.numero), c })), ...(conCompania < participantes.length ? [{ id: 'sin', label: 'Sin compañía' }] : [])] as { id: string; label: string; c?: InfoCompania }[]).map((o) => {
              const activo = filtroActivo === o.id;
              return (
                <button
                  key={o.id || 'todas'}
                  aria-pressed={activo}
                  aria-label={o.c ? `Compañía ${o.c.numero}` : o.label}
                  onClick={() => setFiltroCompania(activo ? '' : o.id)}
                  className={`shrink-0 min-h-[44px] min-w-[44px] px-3.5 rounded-full text-sm font-bold border inline-flex items-center justify-center gap-1.5 ${
                    activo ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {o.c && <span className="w-2.5 h-2.5 rounded-full ring-1 ring-slate-400" style={{ background: o.c.hex }} aria-hidden="true" />}
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>{etiquetaGrupo || 'Check-in en vivo'}</span>
          <strong className="text-primary">{presentes}/{total} · {pct}%</strong>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2 pb-24" onScroll={handleScroll}>
        {!query.trim() && necesitanCompania > 0 && (
          <div className="text-[11px] font-bold text-primary uppercase tracking-wide px-1 -mb-1">
            🏠 Necesitan compañía ({necesitanCompania})
          </div>
        )}
        {filtered.map((p) => {
          const pendiente = user.canRepartirFamilias && !p.familiaId && pendientesIds.has(p.id);
          return (
            <FilaAsistencia
              key={p.id}
              p={p}
              estado={asistencia[p.id]?.estado}
              compania={companias.get(p.familiaId)}
              pendiente={pendiente}
              sugerida={pendiente ? familias.find((f) => f.id === plan[p.id]) : undefined}
              asignando={asignandoId === p.id}
              onToggle={onToggle}
              onJustificar={onJustificar}
              onAsignar={onAsignar}
            />
          );
        })}
        {filtered.length === 0 && <div className="text-center text-sm text-slate-500 py-10">Sin resultados.</div>}
      </div>

      {aviso && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-4 right-4 bottom-20 z-30 mx-auto max-w-md bg-slate-900 text-white rounded-xl pl-4 pr-1 flex items-center gap-2 shadow-lg"
        >
          <span className="flex-1 text-sm py-2.5 truncate">{aviso.texto}</span>
          {aviso.deshacer && (
            <button onClick={aviso.deshacer} className="min-h-[44px] px-4 text-sm font-extrabold text-accent">
              Deshacer
            </button>
          )}
        </div>
      )}

      {qrOpen && <QrAsistenciaModal onClose={() => setQrOpen(false)} />}
    </div>
  );
}

// Una fila por persona, memoizada: marcar a alguien redibuja SOLO su fila, no las ~500.
// `content-visibility: auto` deja que el navegador omita pintar las filas fuera de pantalla.
const FilaAsistencia = memo(function FilaAsistencia({
  p,
  estado,
  compania,
  pendiente,
  sugerida,
  asignando,
  onToggle,
  onJustificar,
  onAsignar,
}: {
  p: Participante;
  estado: EstadoAsistencia | undefined;
  compania: InfoCompania | undefined;
  pendiente: boolean;
  sugerida: Familia | undefined;
  asignando: boolean;
  onToggle: (p: Participante, actual: EstadoAsistencia | undefined) => void;
  onJustificar: (p: Participante, actual: EstadoAsistencia | undefined) => void;
  onAsignar: (p: Participante) => void;
}) {
  const checked = estado === 'presente';
  const justified = estado === 'justificado';
  return (
    <div
      className={`bg-white rounded-2xl p-2.5 pl-3.5 shadow-sm border ${checked ? 'border-emerald-200' : 'border-transparent'}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 64px' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 text-sm font-bold">
            <span className="truncate">{nombreCorto(p.nombres, p.apellidos)}</span>
            {compania && (
              <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                <span className="w-2 h-2 rounded-full self-center ring-1 ring-slate-300" style={{ background: compania.hex }} aria-hidden="true" />
                <span aria-hidden="true">({compania.numero})</span>
                <span className="sr-only">Compañía {compania.numero}</span>
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 truncate">⛪ {p.estaca}</div>
        </div>
        <button
          onClick={() => onToggle(p, estado)}
          aria-pressed={checked}
          className={`h-11 min-w-[92px] rounded-xl text-xs font-extrabold ${checked ? 'bg-emerald-500 text-white' : 'bg-primary/10 text-primary'}`}
        >
          {checked ? '✅ Asistió' : 'Marcar'}
        </button>
        <button
          onClick={() => onJustificar(p, estado)}
          aria-pressed={justified}
          aria-label="Justificar falta"
          className={`h-11 w-11 rounded-xl text-xs font-extrabold ${justified ? 'bg-amber-400 text-white' : 'bg-amber-100 text-amber-700'}`}
        >
          J
        </button>
      </div>
      {/* Asignación en vivo — solo Coordinador General, y solo si esta persona está
          presente y sin compañía. Con resultado ya calculado muestra la sugerencia
          (el botón solo confirma); si no, el botón genérico calcula y escribe. */}
      {pendiente && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
          {sugerida ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: FAMILY_COLORS.find((c) => c.id === sugerida.colorId)?.hex || '#94A3B8' }} />
              <span className="text-[11px] text-slate-500 flex-1 truncate">
                Sin compañía — sugerida: <strong>{sugerida.customName || sugerida.nombre}</strong>
              </span>
            </>
          ) : (
            <span className="text-[11px] text-slate-500 flex-1 truncate">Sin compañía</span>
          )}
          <button
            disabled={asignando}
            onClick={() => onAsignar(p)}
            className="shrink-0 min-h-[44px] bg-primary text-white text-[11px] font-bold rounded-lg px-3 disabled:opacity-50"
          >
            {asignando ? (sugerida ? 'Asignando…' : 'Calculando…') : sugerida ? '🏠 Asignar' : '🏠 Asignar compañía'}
          </button>
        </div>
      )}
    </div>
  );
});
