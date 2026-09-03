import { useEffect, useMemo, useState } from 'react';
import { marcarAsistencia, subscribeAsistencia } from '../services/asistenciaService';
import { estadoVentanaCheckIn, getCapacitacionParaCheckIn, subscribeCapacitaciones } from '../services/capacitacionesService';
import { subscribeParticipantes } from '../services/participantsService';
import type { Asistencia, Capacitacion, Participante } from '../types';
import { fuzzyIncludes } from '../utils/search';

// Un check-in por dispositivo, por capacitación — evita que una sola persona
// marque presente a varios amigos desde su celular. No es a prueba de balas
// (borrar datos del navegador lo esquiva), pero corta el caso normal de uso
// indebido con el mismo modelo de "gating a nivel de cliente, no
// criptográfico" que ya se usa en el resto de esta app.
function claveDispositivo(capId: string) {
  return `fsy_checkin_dispositivo_${capId}`;
}
interface MarcaDispositivo {
  participanteId: string;
  nombre: string;
}
function leerMarcaDispositivo(capId: string): MarcaDispositivo | null {
  try {
    const raw = localStorage.getItem(claveDispositivo(capId));
    return raw ? (JSON.parse(raw) as MarcaDispositivo) : null;
  } catch {
    return null;
  }
}
function guardarMarcaDispositivo(capId: string, marca: MarcaDispositivo) {
  try {
    localStorage.setItem(claveDispositivo(capId), JSON.stringify(marca));
  } catch {
    /* si localStorage no está disponible, simplemente no se recuerda — no es crítico */
  }
}

export default function AutoCheckInScreen({ onBack }: { onBack: () => void }) {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [capacitaciones, setCapacitaciones] = useState<Capacitacion[]>([]);
  const [asistencia, setAsistencia] = useState<Record<string, Asistencia>>({});
  const [query, setQuery] = useState('');
  const [marcandoId, setMarcandoId] = useState('');
  const [confirmado, setConfirmado] = useState<Participante | null>(null);

  // "Cargando" y "vacío" son estados distintos — sin esto, el primer render
  // (con capacitaciones/participantes todavía en []) se veía igual que "no
  // hay ninguna capacitación programada" hasta que Firestore respondía,
  // mostrando por un instante el mensaje equivocado antes de corregirse solo.
  const [cargandoCaps, setCargandoCaps] = useState(true);
  const [cargandoParticipantes, setCargandoParticipantes] = useState(true);
  const cargando = cargandoCaps || cargandoParticipantes;

  useEffect(
    () =>
      subscribeParticipantes((items) => {
        setParticipantes(items);
        setCargandoParticipantes(false);
      }),
    []
  );
  useEffect(
    () =>
      subscribeCapacitaciones((items) => {
        setCapacitaciones(items);
        setCargandoCaps(false);
      }),
    []
  );

  const cap = getCapacitacionParaCheckIn(capacitaciones);
  const ventana = estadoVentanaCheckIn(cap);

  useEffect(() => (cap ? subscribeAsistencia(cap.id, setAsistencia) : undefined), [cap?.id]);

  const marcaDispositivo = cap ? leerMarcaDispositivo(cap.id) : null;

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    return participantes.filter((p) => fuzzyIncludes(`${p.nombres} ${p.apellidos}`, query)).slice(0, 8);
  }, [participantes, query]);

  async function marcar(p: Participante) {
    if (!cap || ventana !== 'abierta' || marcaDispositivo) return;
    setMarcandoId(p.id);
    await marcarAsistencia(cap.id, p.id, 'presente', `autoregistro:${p.nombres} ${p.apellidos}`);
    guardarMarcaDispositivo(cap.id, { participanteId: p.id, nombre: `${p.nombres} ${p.apellidos}` });
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
          <p className="text-xs text-slate-400 mt-3">
            Por seguridad, cada celular solo puede marcar una asistencia por capacitación. Si necesitas marcar a
            alguien más, pídele que use su propio celular o pide ayuda a un encargado.
          </p>
          <button onClick={onBack} className="mt-6 w-full bg-primary text-white font-bold rounded-xl py-3">
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
            {cargando ? (
              <p className="text-xs text-white/70 mt-1">Cargando…</p>
            ) : cap ? (
              <p className="text-xs text-white/70 mt-1">
                {ventana === 'abierta' ? '📍 ' : '📅 '}
                {cap.label} · {cap.fecha} {cap.hora && `· ${cap.hora}`}
              </p>
            ) : (
              <p className="text-xs text-white/70 mt-1">No hay capacitaciones programadas todavía.</p>
            )}
          </div>
        </div>

        <div className="p-6 flex flex-col gap-3">
          {cargando && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="spinner" />
              <p className="text-sm text-slate-500">Buscando la capacitación vigente…</p>
            </div>
          )}

          {!cargando && ventana === 'sin_fecha' && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-3 py-3">
              Todavía no hay ninguna capacitación programada. Vuelve a intentarlo más cerca de la fecha, o pídele a un
              encargado que la cree.
            </div>
          )}

          {!cargando && ventana === 'muy_temprano' && cap && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-3 py-3">
              Todavía es muy temprano. <strong>{cap.label}</strong> es el {cap.fecha}
              {cap.hora && ` a las ${cap.hora}`} — puedes marcar tu asistencia desde 1 hora antes.
            </div>
          )}

          {!cargando && ventana === 'cerrada' && cap && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-3 py-3">
              La ventana para marcar asistencia a <strong>{cap.label}</strong> ya se cerró. Si sí asististe, pide a un
              encargado que lo marque manualmente.
            </div>
          )}

          {!cargando && ventana === 'abierta' && cap && marcaDispositivo && (
            <div className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-3">
              Ya se marcó la asistencia de <strong>{marcaDispositivo.nombre}</strong> desde este celular para{' '}
              <strong>{cap.label}</strong>. Si necesitas marcar a alguien más, pídele que use su propio celular, o
              pide ayuda a un encargado.
            </div>
          )}

          {!cargando && ventana === 'abierta' && cap && !marcaDispositivo && (
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
