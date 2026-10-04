import { useEffect, useMemo, useState } from 'react';
import { marcarAsistencia, subscribeAsistencia } from '../services/asistenciaService';
import { getNextCapacitacion } from '../services/capacitacionesService';
import { subscribeFamilias } from '../services/familiasService';
import { ejecutarReparto } from '../services/repartoFamiliasService';
import { calcularCandidatosPorRol, calcularEstadoFamilia, calcularOActualizarPlanEnVivo, type CandidatoReparto } from '../utils/repartoFamilias';
import { FAMILY_COLORS } from '../data/colors';
import type { Asistencia, Capacitacion, Familia, Participante, SessionUser } from '../types';
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
  const [savingId, setSavingId] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
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

  const cap = capacitaciones.find((c) => c.id === capId);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? participantes.filter((p) => `${p.nombres} ${p.apellidos} ${p.estaca}`.toLowerCase().includes(q))
      : participantes;
    return [...list].sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es'));
  }, [participantes, query]);

  const presentes = Object.values(asistencia).filter((a) => a.estado === 'presente').length;
  const pct = participantes.length ? Math.round((presentes / participantes.length) * 100) : 0;

  async function toggle(p: Participante) {
    const current = asistencia[p.id]?.estado;
    const next = current === 'presente' ? 'ausente' : 'presente';
    setSavingId(p.id);
    await marcarAsistencia(capId, p.id, next, user.correo);
    setSavingId('');
  }

  async function justificar(p: Participante) {
    setSavingId(p.id);
    await marcarAsistencia(capId, p.id, 'justificado', user.correo);
    setSavingId('');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-[#F4F6FA]/95 backdrop-blur px-4 pt-3 pb-3 border-b border-slate-200 z-10">
        <div className="flex gap-2 mb-2">
          <select className="input flex-1" value={capId} onChange={(e) => setCapId(e.target.value)}>
            {capacitaciones.length === 0 && <option value="">Sin capacitaciones creadas</option>}
            {capacitaciones.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
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
        {cap && (
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
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Check-in en vivo</span>
          <strong className="text-primary">{presentes}/{participantes.length} · {pct}%</strong>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2 pb-24" onScroll={handleScroll}>
        {filtered.map((p) => {
          const estado = asistencia[p.id]?.estado;
          const checked = estado === 'presente';
          const justified = estado === 'justificado';
          const esPendienteDeCompania = user.canRepartirFamilias && !p.familiaId && pendientes.some((c) => c.participante.id === p.id);
          const sugerida = esPendienteDeCompania ? familias.find((f) => f.id === plan[p.id]) : undefined;
          return (
            <div
              key={p.id}
              className={`bg-white rounded-2xl p-2.5 pl-3.5 shadow-sm border ${checked ? 'border-emerald-200' : 'border-transparent'}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{nombreCorto(p.nombres, p.apellidos)}</div>
                  <div className="text-[11px] text-slate-500 truncate">⛪ {p.estaca}</div>
                </div>
                <button
                  disabled={savingId === p.id}
                  onClick={() => toggle(p)}
                  className={`h-11 min-w-[92px] rounded-xl text-xs font-extrabold ${
                    checked ? 'bg-emerald-500 text-white' : 'bg-primary/10 text-primary'
                  }`}
                >
                  {checked ? '✅ Asistió' : 'Marcar'}
                </button>
                <button
                  disabled={savingId === p.id}
                  onClick={() => justificar(p)}
                  className={`h-11 w-9 rounded-xl text-xs font-extrabold ${justified ? 'bg-amber-400 text-white' : 'bg-amber-100 text-amber-700'}`}
                >
                  J
                </button>
              </div>
              {/* Asignación en vivo — solo Coordinador General, y solo si
                  esta persona está presente y sin compañía. Dos estados:
                  - Ya hay un resultado calculado (de un clic anterior en
                    este mismo grupo) → se muestra la sugerencia, el botón
                    solo confirma/escribe, sin recalcular nada.
                  - Todavía no se calculó nada para ella → botón genérico;
                    al tocarlo recién se dispara el cálculo (para ella y
                    cualquier otro pendiente que tampoco tenga resultado
                    todavía) y se revela+escribe en el mismo paso. */}
              {esPendienteDeCompania && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                  {sugerida ? (
                    <>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: FAMILY_COLORS.find((c) => c.id === sugerida.colorId)?.hex || '#94A3B8' }}
                      />
                      <span className="text-[11px] text-slate-500 flex-1 truncate">
                        Sin compañía — sugerida: <strong>{sugerida.customName || sugerida.nombre}</strong>
                      </span>
                      <button
                        disabled={asignandoId === p.id}
                        onClick={() => asignarCompania(p)}
                        className="shrink-0 bg-primary text-white text-[11px] font-bold rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                      >
                        {asignandoId === p.id ? 'Asignando…' : '🏠 Asignar'}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] text-slate-500 flex-1 truncate">Sin compañía</span>
                      <button
                        disabled={asignandoId === p.id}
                        onClick={() => asignarCompania(p)}
                        className="shrink-0 bg-primary text-white text-[11px] font-bold rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                      >
                        {asignandoId === p.id ? 'Calculando…' : '🏠 Asignar compañía'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center text-sm text-slate-500 py-10">Sin resultados.</div>}
      </div>

      {qrOpen && <QrAsistenciaModal onClose={() => setQrOpen(false)} />}
    </div>
  );
}
