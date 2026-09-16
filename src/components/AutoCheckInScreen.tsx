import { useEffect, useMemo, useState } from 'react';
import { marcarAsistencia, subscribeAsistencia } from '../services/asistenciaService';
import { estadoVentanaCheckIn, getCapacitacionParaCheckIn, subscribeCapacitaciones } from '../services/capacitacionesService';
import { subscribeParticipantes, updateParticipante } from '../services/participantsService';
import type { Asistencia, Capacitacion, Participante } from '../types';
import { HABILIDADES_AUDIOVISUAL } from '../types';
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

  const marcaGuardada = cap ? leerMarcaDispositivo(cap.id) : null;
  // El bloqueo de "un check-in por dispositivo" solo cuenta mientras la
  // asistencia siga vigente en Firestore. Si un admin la quita o la cambia
  // desde Gestión, `asistencia` (suscripción en tiempo real) deja de decir
  // "presente" para esa persona, y el bloqueo se cae solo — sin recargar
  // nada ni depender de que alguien borre datos del navegador.
  const marcaDispositivo =
    marcaGuardada && asistencia[marcaGuardada.participanteId]?.estado === 'presente' ? marcaGuardada : null;

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

  // Antes de marcar asistencia, si a esta persona le falta el
  // consentimiento (obligatorio) y/o nunca contestó audiovisual (opcional),
  // se le ofrece resolverlo aquí. `marcar()` en sí no se toca: el prompt
  // solo la llama después, nunca la reemplaza.
  //
  // `!p.campo` (no `=== ''`) a propósito en los dos: para participantes
  // registrados antes de que estos campos existieran, Firestore ni
  // siquiera tiene la propiedad (`undefined`), no un string vacío.
  const [pendingAv, setPendingAv] = useState<Participante | null>(null);
  const [avHabilidades, setAvHabilidades] = useState<string[]>([]);
  const [avOtro, setAvOtro] = useState('');
  const [avEquipo, setAvEquipo] = useState<'si' | 'no' | 'algo' | ''>('');
  const [aceptoConsentimiento, setAceptoConsentimiento] = useState(false);
  const [guardandoAv, setGuardandoAv] = useState(false);
  const faltaConsentimiento = !!pendingAv && !pendingAv.consentimientoDatosFecha;
  const faltaAudiovisual = !!pendingAv && !pendingAv.audiovisualEquipo;

  function alTocarPersona(p: Participante) {
    if (!p.consentimientoDatosFecha || !p.audiovisualEquipo) {
      setPendingAv(p);
      setAvHabilidades([]);
      setAvOtro('');
      setAvEquipo('');
      setAceptoConsentimiento(false);
    } else {
      marcar(p);
    }
  }

  async function guardarYMarcar() {
    if (!pendingAv || (faltaConsentimiento && !aceptoConsentimiento)) return;
    setGuardandoAv(true);
    const changes: Partial<Participante> = {};
    if (faltaConsentimiento) changes.consentimientoDatosFecha = new Date().toISOString();
    if (faltaAudiovisual) {
      changes.audiovisualHabilidades = avOtro.trim() ? [...avHabilidades, avOtro.trim()] : avHabilidades;
      changes.audiovisualEquipo = avEquipo;
    }
    await updateParticipante(pendingAv.id, changes, `autoregistro-consentimiento:${pendingAv.nombres} ${pendingAv.apellidos}`);
    const p = pendingAv;
    setGuardandoAv(false);
    setPendingAv(null);
    await marcar(p);
  }

  // Solo se puede omitir cuando lo único pendiente es lo audiovisual — el
  // consentimiento nunca tiene salida de "omitir", es obligatorio de verdad.
  function omitirAudiovisual() {
    const p = pendingAv;
    setPendingAv(null);
    if (p) marcar(p);
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

              {/* Visible desde el primer segundo, no solo cuando falla una
                  búsqueda — no todos los que escanean este QR ya se
                  registraron antes, y no deberían tener que fracasar una
                  búsqueda para enterarse de que hay otro camino. */}
              <a
                href="/?page=registro"
                className="flex items-center gap-3 bg-white border-[1.5px] border-primary/20 rounded-2xl px-4 py-3 text-left"
              >
                <span className="text-xl">🆕</span>
                <div className="flex-1">
                  <div className="text-sm font-bold text-primary">¿Es tu primera vez aquí?</div>
                  <div className="text-xs text-slate-500">Regístrate primero (3 pasos rápidos)</div>
                </div>
                <span className="text-primary">›</span>
              </a>

              <div className="flex flex-col gap-2">
                {results.map((p) => {
                  const yaMarcado = asistencia[p.id]?.estado === 'presente';
                  return (
                    <button
                      key={p.id}
                      disabled={!!marcandoId}
                      onClick={() => alTocarPersona(p)}
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
                    No encontramos a nadie con ese apellido. Revisa que esté bien escrito, o usa el botón de arriba si
                    es tu primera vez.
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

      {pendingAv && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50">
          <div className="bg-white rounded-t-3xl w-full max-w-[500px] mx-auto p-6 max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
            <div className="font-extrabold text-lg text-primary mb-0.5">¡Hola, {pendingAv.nombres}!</div>

            {faltaConsentimiento && (
              <>
                <div className="text-xs text-slate-500 mb-3">Antes de marcar tu asistencia, necesitamos esto:</div>
                <label
                  className={`flex items-start gap-3 rounded-2xl border-[1.5px] p-4 mb-4 cursor-pointer ${
                    aceptoConsentimiento ? 'bg-primary/5 border-primary' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={aceptoConsentimiento}
                    onChange={(e) => setAceptoConsentimiento(e.target.checked)}
                    className="w-5 h-5 mt-0.5 accent-primary shrink-0"
                  />
                  <span className="text-sm leading-relaxed">
                    <span className="text-red-500 font-bold">* </span>
                    Acepto el tratamiento de mis datos personales y el uso de mi imagen (fotos y video) para fines
                    del evento FSY 2027, conforme a la Ley de Protección de Datos Personales.
                  </span>
                </label>
              </>
            )}

            {faltaAudiovisual && (
              <>
                <div className="text-xs text-slate-500 mb-4">
                  {faltaConsentimiento ? 'Y dos preguntas rápidas y opcionales' : 'Dos preguntas rápidas y opcionales'} —
                  nos ayudan a armar el equipo audiovisual.
                </div>

                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  ¿Tienes experiencia o habilidad en algo de esto?
                </div>
                <div className="flex flex-col gap-2 mb-3">
                  {HABILIDADES_AUDIOVISUAL.map((h) => (
                    <label key={h} className="flex items-center gap-2.5 bg-slate-50 rounded-xl border-[1.5px] border-slate-200 px-3.5 py-2.5">
                      <input
                        type="checkbox"
                        checked={avHabilidades.includes(h)}
                        onChange={(e) =>
                          setAvHabilidades(e.target.checked ? [...avHabilidades, h] : avHabilidades.filter((x) => x !== h))
                        }
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-sm font-semibold">{h}</span>
                    </label>
                  ))}
                </div>
                <input
                  className="input mb-4"
                  placeholder="Otra habilidad (opcional)"
                  value={avOtro}
                  onChange={(e) => setAvOtro(e.target.value)}
                />

                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  ¿Tienes equipo propio? (cámara, laptop con software de edición, etc.)
                </div>
                <div className="flex flex-col gap-2 mb-5">
                  {[
                    { value: 'si', label: 'Sí, tengo equipo propio' },
                    { value: 'algo', label: 'Tengo algo, no completo' },
                    { value: 'no', label: 'No tengo equipo' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAvEquipo(opt.value as 'si' | 'no' | 'algo')}
                      className={`text-left text-sm font-semibold rounded-xl border-[1.5px] px-3.5 py-2.5 ${
                        avEquipo === opt.value ? 'bg-primary/10 border-primary text-primary' : 'border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              disabled={guardandoAv || (faltaConsentimiento && !aceptoConsentimiento)}
              onClick={guardarYMarcar}
              className="w-full bg-primary text-white font-bold rounded-xl py-3.5 mb-2 disabled:opacity-50"
            >
              {guardandoAv ? 'Guardando…' : 'Guardar y marcar asistencia'}
            </button>
            {/* El consentimiento nunca tiene salida de "omitir" — solo se
                puede saltar cuando lo único pendiente es lo audiovisual. */}
            {!faltaConsentimiento && (
              <button onClick={omitirAudiovisual} className="w-full text-slate-500 font-semibold text-sm py-2">
                Omitir y solo marcar asistencia
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
