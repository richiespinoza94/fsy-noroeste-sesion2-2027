import { useEffect, useMemo, useState } from 'react';
import type { Asistencia, Capacitacion, Companerismo, Familia, Participante, SessionUser } from '../types';
import { familiasDeAuxiliar, subscribeCompanerismo, subscribeFamilias } from '../services/familiasService';
import { getCapacitacionParaHome, getProximaParaHome } from '../services/capacitacionesService';
import { subscribeAllAsistencia } from '../services/asistenciaService';
import { calcularAsistenciaPorCapacitacion, medianaAsistencia, promedioAsistencia } from '../utils/asistenciaStats';
import { fechaAmigable, rangoHora } from '../utils/fechaAmigable';
import { hoyLocalISO, infoTipo, tipoDe } from '../utils/tiposEvento';
import { calcularCumpleanosProximos } from '../utils/cumpleanos';
import { calcularSeguimiento } from '../utils/seguimiento';
import { useScrollDirection } from '../utils/useScrollDirection';
import MetricCard from './MetricCard';
import CumpleanosCard from './CumpleanosCard';

// Ventana de "próximos cumpleaños" mostrada en Home — 7 días (hoy + 6) es
// suficiente para que el staff se entere con tiempo de preparar un saludo,
// sin que la lista se vuelva larga con un roster de cientos de personas.
const VENTANA_CUMPLEANOS_DIAS = 7;

export default function HomeScreen({
  user,
  participantes,
  capacitaciones,
  cargando,
  onNavigate,
  onNavHiddenChange,
}: {
  user: SessionUser;
  participantes: Participante[];
  capacitaciones: Capacitacion[];
  cargando: boolean;
  onNavigate: (tab: 'asistencia' | 'busqueda' | 'gestion' | 'reportes', sub?: 'seguimiento') => void;
  onNavHiddenChange: (hidden: boolean) => void;
}) {
  const handleScroll = useScrollDirection(onNavHiddenChange);
  const [asistencia, setAsistencia] = useState<Asistencia[]>([]);
  useEffect(() => subscribeAllAsistencia(setAsistencia), []);

  // Solo el Coordinador Auxiliar necesita saber cuáles son sus familias en
  // Home (para limitar los cumpleaños a su gente) — al resto no se le abren
  // estas dos suscripciones de más.
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [companerismo, setCompanerismo] = useState<Companerismo[]>([]);
  useEffect(() => {
    if (!user.isAuxiliar) return;
    const u1 = subscribeFamilias(setFamilias);
    const u2 = subscribeCompanerismo(setCompanerismo);
    return () => {
      u1();
      u2();
    };
  }, [user.isAuxiliar]);

  // Derivados memoizados — misma lección que ya está documentada en
  // CONFEJAS (CONTEXTO.md, "cálculos sin memoizar" sobre 500 personas):
  // mejor aplicarla desde ahora que es gratis, que esperar a redescubrirla
  // cuando el roster crezca.
  const proxima = useMemo(() => getProximaParaHome(capacitaciones), [capacitaciones]);
  const next = proxima?.cap ?? null;
  const confirmados = useMemo(() => participantes.filter((p) => p.disponibilidad === 'si').length, [participantes]);

  const capsOrdenadas = useMemo(
    () => [...capacitaciones].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`)),
    [capacitaciones]
  );
  const porCap = useMemo(
    () => calcularAsistenciaPorCapacitacion(participantes, capsOrdenadas, asistencia),
    [participantes, capsOrdenadas, asistencia]
  );
  // El promedio es solo de capacitaciones: un baile o una noche de hogar tienen
  // otra asistencia esperada y lo bajarían (el detalle por tipo está en Reportes).
  const { promedio, mediana } = useMemo(() => {
    const caps = porCap.filter((s) => tipoDe(s.cap) === 'capacitacion');
    return { promedio: promedioAsistencia(caps), mediana: medianaAsistencia(caps) };
  }, [porCap]);

  // La capacitación que corresponde mostrar AHORA: en curso si hay una
  // sesión ocurriendo en este momento, si no la última que ya terminó.
  const relevante = useMemo(() => getCapacitacionParaHome(capacitaciones), [capacitaciones]);
  const statsRelevante = relevante ? porCap.find((s) => s.cap.id === relevante.cap.id) : null;

  // A quién ve esta cuenta: todos, o (Coordinador Auxiliar) solo los integrantes
  // de SUS familias — con sus teléfonos para saludar o escribir. Un solo cálculo
  // compartido por cumpleaños y por el aviso de seguimiento.
  const gente = useMemo(() => {
    if (!user.isAuxiliar) return participantes;
    const ids = new Set(familiasDeAuxiliar(user.participantId, companerismo, familias).flatMap((f) => f.consejeros));
    return participantes.filter((p) => ids.has(p.id));
  }, [participantes, user.isAuxiliar, user.participantId, companerismo, familias]);

  // Recalcular contra "ahora" en cada apertura de Home alcanza — no es un
  // dato que necesite estar vivo segundo a segundo como la asistencia.
  const cumpleanos = useMemo(() => calcularCumpleanosProximos(gente, new Date(), VENTANA_CUMPLEANOS_DIAS), [gente]);

  // Aviso de retención: quienes vinieron UNA vez y faltaron al siguiente evento
  // (es cuando todavía se les puede recuperar). El detalle completo, con los
  // otros grupos, está en Reportes → Seguimiento.
  const primeraVezFaltaron = useMemo(
    () =>
      user.canViewReports || user.isAuxiliar
        ? calcularSeguimiento(gente, capacitaciones, asistencia).filter((i) => i.categoria === 'primera_vez_falto').length
        : 0,
    [gente, capacitaciones, asistencia, user.canViewReports, user.isAuxiliar]
  );

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 flex flex-col gap-4 [&>*]:shrink-0" onScroll={handleScroll}>
      <div className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-5 text-white relative overflow-hidden shadow-lg shadow-primary/20 min-h-[92px]">
        <div className="absolute -top-8 -right-10 w-36 h-36 rounded-full bg-accent/10" />
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">
            {proxima?.enCurso ? '🔴 En curso ahora' : next && tipoDe(next) !== 'capacitacion' ? `${infoTipo(tipoDe(next)).icon} Próximo evento` : '📅 Próxima capacitación'}
          </div>
          {cargando ? (
            <div className="text-sm opacity-70 mt-1">Cargando…</div>
          ) : (
            <>
              <div className="text-lg font-extrabold">{next?.label || 'Aún no hay otra programada'}</div>
              {next && (
                <div className="text-sm opacity-80 mt-1">
                  {[fechaAmigable(next.fecha, hoyLocalISO()), next.hora && rangoHora(next.hora, next.horaFin), next.lugar].filter(Boolean).join(' · ')}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Personas registradas" value={participantes.length} color="#0E2954" icon="👥" cargando={cargando} />
        <MetricCard label="Confirmados para el evento" value={confirmados} color="#4CAF50" icon="✅" cargando={cargando} />
        <MetricCard
          label="Asistencia promedio"
          value={`${promedio}%`}
          color="#E8863A"
          icon="📈"
          cargando={cargando}
          sub={porCap.filter((c) => c.registros > 0).length ? `Mediana ${mediana}%` : 'Aún sin capacitaciones marcadas'}
        />
        {relevante && statsRelevante ? (
          <MetricCard
            label={relevante.enCurso ? 'Asistencia de hoy' : 'Última capacitación'}
            value={`${statsRelevante.presentes}/${participantes.length}`}
            color={relevante.enCurso ? '#C62828' : '#9C27B0'}
            icon={relevante.enCurso ? '🔴' : '📋'}
            cargando={cargando}
            badge={relevante.enCurso ? 'EN VIVO' : undefined}
            sub={`${statsRelevante.pct}% · ${relevante.cap.label}`}
          />
        ) : (
          <MetricCard
            label="Última capacitación"
            value="—"
            color="#9C27B0"
            icon="📋"
            cargando={cargando}
            sub="Ninguna ha ocurrido todavía"
          />
        )}
      </div>

      {!cargando && primeraVezFaltaron > 0 && (
        <button
          onClick={() => onNavigate('reportes', 'seguimiento')}
          className="min-h-[44px] bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm text-left border-l-4"
          style={{ borderLeftColor: '#9C27B0' }}
        >
          <span className="text-2xl" aria-hidden="true">🌱</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">
              {primeraVezFaltaron} {primeraVezFaltaron === 1 ? 'persona vino por primera vez y faltó' : 'personas vinieron por primera vez y faltaron'} al siguiente
            </div>
          </div>
          <span className="text-slate-300">›</span>
        </button>
      )}

      {/* Después de las métricas operativas (asistencia en vivo, confirmados),
          no antes — esto es seguimiento/cercanía, no es urgente como lo de
          arriba, así que no debe competir por el primer vistazo. */}
      {!cargando && <CumpleanosCard items={cumpleanos} />}

      {!user.isAuxiliar && (
        <a
          href="/?page=registro"
          target="_blank"
          rel="noopener"
          className="min-h-[44px] bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm text-left"
        >
          <span className="text-2xl" aria-hidden="true">📝</span>
          <span className="flex-1 text-sm font-bold">Registrar participante</span>
          <span className="text-slate-400" aria-hidden="true">↗</span>
        </a>
      )}

      <div className="text-xs text-slate-500 text-center mt-2">
        Sesión: {user.correo} · {user.rol}
      </div>
    </div>
  );
}

