import { useEffect, useMemo, useState } from 'react';
import { marcarAsistencia, subscribeAsistencia } from '../services/asistenciaService';
import { getNextCapacitacion } from '../services/capacitacionesService';
import type { Asistencia, Capacitacion, Participante, SessionUser } from '../types';
import QrAsistenciaModal from './QrAsistenciaModal';

export default function AsistenciaScreen({
  user,
  participantes,
  capacitaciones,
}: {
  user: SessionUser;
  participantes: Participante[];
  capacitaciones: Capacitacion[];
}) {
  const [capId, setCapId] = useState('');
  const [asistencia, setAsistencia] = useState<Record<string, Asistencia>>({});
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState('');
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    if (!capId && capacitaciones.length) {
      setCapId(getNextCapacitacion(capacitaciones)?.id || capacitaciones[0].id);
    }
  }, [capacitaciones, capId]);

  useEffect(() => subscribeAsistencia(capId, setAsistencia), [capId]);

  const cap = capacitaciones.find((c) => c.id === capId);

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

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2 pb-24">
        {filtered.map((p) => {
          const estado = asistencia[p.id]?.estado;
          const checked = estado === 'presente';
          const justified = estado === 'justificado';
          return (
            <div
              key={p.id}
              className={`bg-white rounded-2xl p-2.5 pl-3.5 flex items-center gap-3 shadow-sm border ${
                checked ? 'border-emerald-200' : 'border-transparent'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{p.nombres} {p.apellidos}</div>
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
          );
        })}
        {filtered.length === 0 && <div className="text-center text-sm text-slate-500 py-10">Sin resultados.</div>}
      </div>

      {qrOpen && <QrAsistenciaModal onClose={() => setQrOpen(false)} />}
    </div>
  );
}
