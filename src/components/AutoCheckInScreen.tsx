import { useEffect, useMemo, useState } from 'react';
import { marcarAsistencia, subscribeAsistencia } from '../services/asistenciaService';
import { getNextCapacitacion, subscribeCapacitaciones } from '../services/capacitacionesService';
import { subscribeParticipantes } from '../services/participantsService';
import type { Asistencia, Capacitacion, Participante } from '../types';
import { fuzzyIncludes } from '../utils/search';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AutoCheckInScreen({ onBack }: { onBack: () => void }) {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [capacitaciones, setCapacitaciones] = useState<Capacitacion[]>([]);
  const [asistencia, setAsistencia] = useState<Record<string, Asistencia>>({});
  const [query, setQuery] = useState('');
  const [marcandoId, setMarcandoId] = useState('');
  const [confirmado, setConfirmado] = useState<Participante | null>(null);

  useEffect(() => subscribeParticipantes(setParticipantes), []);
  useEffect(() => subscribeCapacitaciones(setCapacitaciones), []);

  const cap = getNextCapacitacion(capacitaciones);
  const esHoy = !!cap && cap.fecha === todayISO();

  useEffect(() => (cap ? subscribeAsistencia(cap.id, setAsistencia) : undefined), [cap?.id]);

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    return participantes.filter((p) => fuzzyIncludes(`${p.nombres} ${p.apellidos}`, query)).slice(0, 8);
  }, [participantes, query]);

  async function marcar(p: Participante) {
    if (!cap) return;
    setMarcandoId(p.id);
    await marcarAsistencia(cap.id, p.id, 'presente', `autoregistro:${p.nombres} ${p.apellidos}`);
    setMarcandoId('');
    setConfirmado(p);
  }

  if (confirmado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
          <h1 className="text-xl font-extrabold text-primary mb-1">¡Listo, {confirmado.nombres}!</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            Quedaste registrado en <strong>{cap?.label}</strong>.
          </p>
          <button
            onClick={() => {
              setConfirmado(null);
              setQuery('');
            }}
            className="mt-6 w-full bg-primary text-white font-bold rounded-xl py-3"
          >
            Marcar a alguien más
          </button>
          <button onClick={onBack} className="mt-2 w-full text-primary font-bold text-sm py-2">
            ‹ Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-br from-primary to-primary-dark px-6 py-7 text-white relative overflow-hidden">
          <div className="absolute -top-10 -right-12 w-44 h-44 rounded-full bg-accent/10" />
          <div className="relative">
            <div className="inline-block bg-accent/20 text-accent text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full border border-accent/30 mb-2">
              Gestión FSY 2027
            </div>
            <h1 className="text-lg font-extrabold">Marcar mi asistencia</h1>
            {cap ? (
              <p className="text-xs text-white/70 mt-1">
                {esHoy ? '📍 ' : '📅 '}
                {cap.label} · {cap.fecha} {cap.hora && `· ${cap.hora}`}
              </p>
            ) : (
              <p className="text-xs text-white/70 mt-1">No hay capacitaciones programadas todavía.</p>
            )}
          </div>
        </div>

        <div className="p-6 flex flex-col gap-3">
          {!cap && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-3 py-3">
              Todavía no hay ninguna capacitación programada. Vuelve a intentarlo más cerca de la fecha, o pídele a un
              encargado que la cree.
            </div>
          )}

          {cap && !esHoy && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-3 py-3">
              La próxima capacitación es <strong>{cap.label}</strong> el {cap.fecha}
              {cap.hora && ` a las ${cap.hora}`}. Vuelve a marcar tu asistencia ese día.
            </div>
          )}

          {cap && esHoy && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Escribe tu apellido</span>
                <input
                  autoFocus
                  className="input"
                  placeholder="Ej: García"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>

              <div className="flex flex-col gap-2">
                {results.map((p) => {
                  const yaMarcado = asistencia[p.id]?.estado === 'presente';
                  return (
                    <button
                      key={p.id}
                      disabled={!!marcandoId}
                      onClick={() => marcar(p)}
                      className={`flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition ${
                        yaMarcado ? 'bg-emerald-50 border-emerald-200' : 'border-slate-200 active:bg-slate-50'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center shrink-0">
                        {(p.nombres[0] || '').toUpperCase()}{(p.apellidos[0] || '').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate">{p.nombres} {p.apellidos}</div>
                        <div className="text-[11px] text-slate-500 truncate">⛪ {p.estaca}</div>
                      </div>
                      <span className="text-xs font-extrabold shrink-0">
                        {marcandoId === p.id ? '⏳' : yaMarcado ? '✅ Ya marcado' : 'Toca aquí'}
                      </span>
                    </button>
                  );
                })}
                {query.trim().length >= 2 && results.length === 0 && (
                  <div className="text-sm text-slate-500 text-center py-3">
                    No encontramos a nadie con ese apellido. Revisa que esté bien escrito, o pide ayuda a un encargado.
                  </div>
                )}
                {query.trim().length < 2 && (
                  <div className="text-xs text-slate-500 text-center py-2">Escribe al menos 2 letras para buscar.</div>
                )}
              </div>
            </>
          )}

          <button onClick={onBack} className="mt-2 w-full text-primary font-bold text-sm py-2">
            ‹ Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );
}
