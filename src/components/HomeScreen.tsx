import { useEffect, useMemo, useState } from 'react';
import type { Asistencia, Capacitacion, Participante, SessionUser } from '../types';
import { getCapacitacionParaHome, getNextCapacitacion } from '../services/capacitacionesService';
import { subscribeAllAsistencia } from '../services/asistenciaService';
import { calcularAsistenciaPorCapacitacion, promedioAsistencia } from '../utils/asistenciaStats';
import { useScrollDirection } from '../utils/useScrollDirection';
import MetricCard from './MetricCard';

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
  const promedio = useMemo(() => promedioAsistencia(porCap), [porCap]);

  // La capacitación que corresponde mostrar AHORA: en curso si hay una
  // sesión ocurriendo en este momento, si no la última que ya terminó.
  const relevante = useMemo(() => getCapacitacionParaHome(capacitaciones), [capacitaciones]);
  const statsRelevante = relevante ? porCap.find((s) => s.cap.id === relevante.cap.id) : null;

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
        <MetricCard label="Consejeros registrados" value={participantes.length} color="#0E2954" icon="👥" cargando={cargando} />
        <MetricCard label="Confirmados para el evento" value={confirmados} color="#4CAF50" icon="✅" cargando={cargando} />
        <MetricCard
          label="Asistencia promedio"
          value={`${promedio}%`}
          color="#E8863A"
          icon="📈"
          cargando={cargando}
          sub={porCap.filter((c) => c.registros > 0).length ? undefined : 'Aún sin capacitaciones marcadas'}
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

      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide px-1 mt-1">Acciones rápidas</div>
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
      <button
        onClick={() => onNavigate('gestion')}
        className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm text-left"
      >
        <span className="text-2xl">⚙️</span>
        <div className="flex-1">
          <div className="text-sm font-bold">Familias, roles y capacitaciones</div>
          <div className="text-xs text-slate-500">Gestión de la preparación</div>
        </div>
        <span className="text-slate-300">›</span>
      </button>
      {user.canViewReports && (
        <button
          onClick={() => onNavigate('reportes')}
          className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm text-left"
        >
          <span className="text-2xl">📊</span>
          <div className="flex-1">
            <div className="text-sm font-bold">Reportes</div>
            <div className="text-xs text-slate-500">Asistencia, estacas y roles</div>
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

