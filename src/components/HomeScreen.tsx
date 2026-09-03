import type { Capacitacion, Participante, SessionUser } from '../types';
import { getNextCapacitacion } from '../services/capacitacionesService';

export default function HomeScreen({
  user,
  participantes,
  capacitaciones,
  onNavigate,
}: {
  user: SessionUser;
  participantes: Participante[];
  capacitaciones: Capacitacion[];
  onNavigate: (tab: 'asistencia' | 'busqueda' | 'gestion' | 'reportes') => void;
}) {
  const next = getNextCapacitacion(capacitaciones);
  const confirmados = participantes.filter((p) => p.disponibilidad === 'si').length;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-5 text-white relative overflow-hidden shadow-lg shadow-primary/20">
        <div className="absolute -top-8 -right-10 w-36 h-36 rounded-full bg-accent/10" />
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">📅 Próxima capacitación</div>
          <div className="text-lg font-extrabold">{next?.label || 'Sin capacitaciones programadas'}</div>
          {next && (
            <div className="text-sm opacity-80 mt-1">
              {next.fecha} {next.hora && `· ${next.hora}`} · {next.lugar}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Consejeros registrados" value={participantes.length} color="#0E2954" icon="👥" />
        <Metric label="Confirmados" value={confirmados} color="#4CAF50" icon="✅" />
      </div>

      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-1 mt-1">Acciones rápidas</div>
      <a
        href="/?page=registro"
        target="_blank"
        rel="noopener"
        className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm text-left"
      >
        <span className="text-2xl">📝</span>
        <div className="flex-1">
          <div className="text-sm font-bold">Registrar participante</div>
          <div className="text-xs text-slate-400">Abre el formulario público</div>
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
          <div className="text-xs text-slate-400">Consulta y edita datos</div>
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
          <div className="text-xs text-slate-400">Registro por capacitación</div>
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
          <div className="text-xs text-slate-400">Gestión de la preparación</div>
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
            <div className="text-xs text-slate-400">Asistencia, estacas y roles</div>
          </div>
          <span className="text-slate-300">›</span>
        </button>
      )}

      <div className="text-xs text-slate-400 text-center mt-2">
        Sesión: {user.correo} · {user.rol}
      </div>
    </div>
  );
}

function Metric({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border-t-[3px]" style={{ borderTopColor: color }}>
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-2xl font-extrabold" style={{ color }}>{value}</div>
      <div className="text-[11px] text-slate-400 font-semibold mt-0.5">{label}</div>
    </div>
  );
}
