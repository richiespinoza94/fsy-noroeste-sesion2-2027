import { useEffect, useMemo, useState } from 'react';
import { getRecentLogs } from '../services/auditService';
import {
  describirEntradas,
  etiquetaDia,
  filtrarHistorial,
  GRUPOS_HISTORIAL,
  type GrupoHistorial,
  type RangoHistorial,
} from '../utils/historial';
import type { AuditLog, Capacitacion, Familia, Participante } from '../types';

const PAGINA = 20;
const LOTE = 100; // cada lectura de Firestore se cobra: se pide poco y se amplía solo si hace falta

function hace(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export default function HistorialTab({
  participantes,
  capacitaciones,
  familias,
}: {
  participantes: Participante[];
  capacitaciones: Capacitacion[];
  familias: Familia[];
}) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [limite, setLimite] = useState(LOTE);
  const [grupo, setGrupo] = useState<GrupoHistorial | 'cambios'>('cambios');
  const [rango, setRango] = useState<RangoHistorial>('7d');
  const [texto, setTexto] = useState('');
  const [visibles, setVisibles] = useState(PAGINA);

  async function cargar(n = limite) {
    setCargando(true);
    setError(false);
    try {
      setLogs(await getRecentLogs(n));
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    void cargar(LOTE);
  }, []);

  const entradas = useMemo(
    () => describirEntradas(logs, { participantes, familias, capacitaciones }),
    [logs, participantes, familias, capacitaciones]
  );
  const filtradas = useMemo(() => filtrarHistorial(entradas, { grupo, rango, texto }), [entradas, grupo, rango, texto]);
  const lista = filtradas.slice(0, visibles);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold text-primary">🕘 Historial de cambios</div>
          <div className="text-xs text-slate-500">Quién hizo qué y cuándo (últimos {logs.length} movimientos)</div>
        </div>
        <button
          onClick={() => cargar()}
          disabled={cargando}
          className="min-h-[44px] px-3 rounded-xl border-2 border-primary text-primary text-xs font-bold disabled:opacity-50"
        >
          {cargando ? '⏳' : '↻ Actualizar'}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5" role="group" aria-label="Filtrar por tipo de cambio">
        {GRUPOS_HISTORIAL.map((g) => (
          <button
            key={g.id}
            aria-pressed={grupo === g.id}
            onClick={() => {
              setGrupo(g.id);
              setVisibles(PAGINA);
            }}
            className={`shrink-0 min-h-[44px] px-3.5 rounded-full text-xs font-bold border ${
              grupo === g.id ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="search"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setVisibles(PAGINA);
          }}
          placeholder="Buscar usuario o persona…"
          aria-label="Buscar en el historial"
          className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-base"
        />
        <select
          value={rango}
          onChange={(e) => {
            setRango(e.target.value as RangoHistorial);
            setVisibles(PAGINA);
          }}
          aria-label="Rango de fechas"
          className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-2 text-base"
        >
          <option value="hoy">Hoy</option>
          <option value="7d">7 días</option>
          <option value="todo">Todo</option>
        </select>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          No se pudo cargar el historial. Revisa tu conexión y toca "Actualizar".
        </div>
      )}

      {!error && !cargando && filtradas.length === 0 && (
        <div className="text-center text-sm text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200 py-8 px-4">
          <div className="text-2xl mb-1">🗒️</div>
          {logs.length === 0 ? 'Aún no hay movimientos registrados.' : 'Ningún movimiento coincide con estos filtros.'}
          {logs.length > 0 && rango !== 'todo' && (
            <div>
              <button onClick={() => setRango('todo')} className="mt-2 min-h-[44px] px-3 text-primary font-bold text-sm">
                Ver todo el historial
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col">
        {lista.map((e, i) => {
          const dia = etiquetaDia(e.log.timestamp);
          const nuevoDia = i === 0 || dia !== etiquetaDia(lista[i - 1].log.timestamp);
          return (
            <div key={e.log.id}>
              {nuevoDia && (
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide px-1 pt-3 pb-1 capitalize">{dia}</div>
              )}
              <div className="bg-white rounded-xl px-3 py-2.5 mb-1.5 shadow-sm flex gap-2.5 items-start">
                <span className="text-base shrink-0 mt-0.5" aria-hidden="true">{e.icon}</span>
                <div className="flex-1 min-w-0 text-sm leading-snug">
                  <strong className="text-primary">{e.actor}</strong> <span className="text-slate-700 break-words">{e.texto}</span>
                </div>
                <time className="text-xs text-slate-500 whitespace-nowrap shrink-0" dateTime={e.log.timestamp} title={new Date(e.log.timestamp).toLocaleString('es-PE')}>
                  {hace(e.log.timestamp)}
                </time>
              </div>
            </div>
          );
        })}
      </div>

      {filtradas.length <= visibles && logs.length >= limite && !cargando && (
        <button
          onClick={() => {
            setLimite(limite + 200);
            void cargar(limite + 200);
          }}
          className="min-h-[44px] w-full rounded-xl border border-slate-300 text-slate-600 font-bold text-sm"
        >
          Cargar 200 movimientos más antiguos
        </button>
      )}

      {filtradas.length > visibles && (
        <button
          onClick={() => setVisibles((v) => v + PAGINA)}
          className="min-h-[44px] w-full rounded-xl border-2 border-primary text-primary font-bold text-sm"
        >
          Ver {Math.min(PAGINA, filtradas.length - visibles)} más ({filtradas.length - visibles} restantes)
        </button>
      )}
    </div>
  );
}
