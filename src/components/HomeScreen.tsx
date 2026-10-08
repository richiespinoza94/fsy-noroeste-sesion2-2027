import { useEffect, useMemo, useState } from 'react';
import type { Asistencia, Capacitacion, Companerismo, Familia, Participante, SessionUser } from '../types';
import { familiasDeAuxiliar, subscribeCompanerismo, subscribeFamilias } from '../services/familiasService';
import { getCapacitacionParaHome, getNextCapacitacion } from '../services/capacitacionesService';
import { subscribeAllAsistencia } from '../services/asistenciaService';
import { calcularAsistenciaPorCapacitacion, promedioAsistencia } from '../utils/asistenciaStats';
import { tipoDe } from '../utils/tiposEvento';
import { calcularCumpleanosProximos } from '../utils/cumpleanos';
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
  onNavigate: (tab: 'asistencia' | 'busqueda' | 'gestion' | 'reportes') => void;
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
  const next = useMemo(() => getNextCapacitacion(capacitaciones), [capacitaciones]);
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
  const promedio = useMemo(
    () => promedioAsistencia(porCap.filter((s) => tipoDe(s.cap) === 'capacitacion')),
    [porCap]
  );

  // La capacitación que corresponde mostrar AHORA: en curso si hay una
  // sesión ocurriendo en este momento, si no la última que ya terminó.
  const relevante = useMemo(() => getCapacitacionParaHome(capacitaciones), [capacitaciones]);
  const statsRelevante = relevante ? porCap.find((s) => s.cap.id === relevante.cap.id) : null;

  // Recalcular contra "ahora" en cada apertura de Home alcanza — no es un
  // dato que necesite estar vivo segundo a segundo como la asistencia.
  // Al Coordinador Auxiliar solo le salen los cumpleaños de los integrantes
  // de SUS familias (y con ellos sus teléfonos para saludar) — no los de
  // toda la conferencia.
  const cumpleanos = useMemo(() => {
    let base = participantes;
    if (user.isAuxiliar) {
      const ids = new Set(familiasDeAuxiliar(user.participantId, companerismo, familias).flatMap((f) => f.consejeros));
      base = participantes.filter((p) => ids.has(p.id));
    }
    return calcularCumpleanosProximos(base, new Date(), VENTANA_CUMPLEANOS_DIAS);
  }, [participantes, user.isAuxiliar, user.participantId, companerismo, familias]);

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 flex flex-col gap-4" onScroll={handleScroll}>
      <div className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-5 text-white relative overflow-hidden shadow-lg shadow-primary/20 min-h-[92px]">
        <div className="absolute -top-8 -right-10 w-36 h-36 rounded-full bg-accent/10" />
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">📅 Próxima capacitación</div>
          {cargando ? (
            <div className="text-sm opacity-70 mt-1">Cargando…</div>
          ) : (
            <>
              <div className="text-lg font-extrabold">{next?.label || 'Sin capacitaciones programadas'}</div>
              {next && (
                <div className="text-sm opacity-80 mt-1">
                  {next.fecha} {next.hora && `· ${next.hora}${next.horaFin ? `–${next.horaFin}` : ''}`} · {next.lugar}
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
          sub={porCap.filter((c) => c.registros > 0).length ? 'Solo capacitaciones' : 'Aún sin capacitaciones marcadas'}
        />
        {relevante && statsRelevante ? (
          <MetricCard
            label={relevante.enCurso ? 'Asistencia de hoy' : 'Última capacitación'}
            value={`${statsRelevante.presentes}/${participantes.length}`}
            color={relevante.enCurso ? '#C62828' : '#9C27B0'}
            icon={relevante.enCurso ? '🔴' : '📋'}
            cargando={cargando}
            badge={relevante.enCurso ? 'EN VIVO' : undefined}
            sub={`${relevante.cap.label} · ${statsRelevante.pct}%`}
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

      {/* Después de las métricas operativas (asistencia en vivo, confirmados),
          no antes — esto es seguimiento/cercanía, no es urgente como lo de
          arriba, así que no debe competir por el primer vistazo. */}
      {!cargando && <CumpleanosCard items={cumpleanos} />}

      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide px-1 mt-1">Acciones rápidas</div>
      {!user.isAuxiliar && (
      <a
        href="/?page=registro"
        target="_blank"
        rel="noopener"
        className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm text-left"
      >
        <span className="text-2xl">📝</span>
        <div className="flex-1">
          <div className="text-sm font-bold">Registrar participante</div>
          <div className="text-xs text-slate-500">Abre el formulario público</div>
        </div>
        <span className="text-slate-300">↗</span>
      </a>
      )}
      {!user.isAuxiliar && (
      <button
        onClick={() => onNavigate('busqueda')}
        className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm text-left"
      >
        <span className="text-2xl">🔍</span>
        <div className="flex-1">
          <div className="text-sm font-bold">Buscar participante</div>
          <div className="text-xs text-slate-500">Consulta y edita datos</div>
        </div>
        <span className="text-slate-300">›</span>
      </button>
      )}
      {!user.isAuxiliar && (
      <button
        onClick={() => onNavigate('asistencia')}
        className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm text-left"
      >
        <span className="text-2xl">✅</span>
        <div className="flex-1">
          <div className="text-sm font-bold">Marcar asistencia</div>
          <div className="text-xs text-slate-500">Registro por capacitación</div>
        </div>
        <span className="text-slate-300">›</span>
      </button>
      )}
      <button
        onClick={() => onNavigate('gestion')}
        className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm text-left"
      >
        <span className="text-2xl">⚙️</span>
        <div className="flex-1">
          <div className="text-sm font-bold">{user.isAuxiliar ? 'Mi familia y roles' : 'Familias, roles y capacitaciones'}</div>
          <div className="text-xs text-slate-500">{user.isAuxiliar ? 'Gestiona a tus integrantes' : 'Gestión de la preparación'}</div>
        </div>
        <span className="text-slate-300">›</span>
      </button>
      {(user.canViewReports || user.isAuxiliar) && (
        <button
          onClick={() => onNavigate('reportes')}
          className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm text-left"
        >
          <span className="text-2xl">📊</span>
          <div className="flex-1">
            <div className="text-sm font-bold">{user.isAuxiliar ? 'Reportes de mi familia' : 'Reportes'}</div>
            <div className="text-xs text-slate-500">{user.isAuxiliar ? 'Asistencia y compromiso de tus integrantes' : 'Asistencia, estacas y roles'}</div>
          </div>
          <span className="text-slate-300">›</span>
        </button>
      )}

      <div className="text-xs text-slate-500 text-center mt-2">
        Sesión: {user.correo} · {user.rol}
      </div>
    </div>
  );
}

