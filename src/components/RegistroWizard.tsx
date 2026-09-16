import { useEffect, useMemo, useState } from 'react';
import { ESTACAS_DATA, ESTACAS_PRINCIPALES, ESTACAS_SECUNDARIAS } from '../data/estacas';
import { EVENTO_FECHAS_LABEL, EVENTO_NOMBRE } from '../data/evento';
import { checkDuplicates, registrarParticipante, type DuplicateCheck } from '../services/participantsService';
import { marcarAsistencia } from '../services/asistenciaService';
import { getCapacitacionParaAutoMarcar, subscribeCapacitaciones } from '../services/capacitacionesService';
import { ASIGNACIONES_PREVIAS, EXPERIENCIA_PREVIA_LABEL, HABILIDADES_AUDIOVISUAL, SIN_EXPERIENCIA_AV, type Capacitacion, type ExperienciaPrevia } from '../types';
import { normalizeEmail, normalizeName, normalizePhone, validateEmail, validatePhone } from '../utils/validation';

const EXPERIENCIA_PREVIA_OPTIONS: { value: ExperienciaPrevia; label: string }[] = [
  { value: 'ninguna', label: EXPERIENCIA_PREVIA_LABEL.ninguna },
  { value: 'fsy', label: EXPERIENCIA_PREVIA_LABEL.fsy },
  { value: 'jas', label: EXPERIENCIA_PREVIA_LABEL.jas },
  { value: 'ambos', label: EXPERIENCIA_PREVIA_LABEL.ambos },
];

// Esta sesión FSY es específicamente para 3 estacas — se muestran primero,
// el resto queda detrás de "Otra estaca…" para no saturar el selector.
const OTRA_ESTACA = '__otra_estaca__';
const ESTACA_LIBRE = '__estaca_libre__';

const EMPTY = {
  nombres: '',
  apellidos: '',
  fechaNacimiento: '',
  telefono: '',
  correo: '',
  estaca: '',
  barrio: '',
  barrioLibre: '',
  experienciaPrevia: '' as ExperienciaPrevia | '',
  asignacionAnterior: '',
  genero: '' as 'H' | 'M' | '',
  disponibilidad: '' as 'si' | 'no_creo' | 'no_se' | '',
  audiovisualHabilidades: [] as string[],
  audiovisualOtro: '',
  audiovisualEquipo: '' as 'si' | 'no' | 'algo' | '',
  aceptaConsentimiento: false,
};

export default function RegistroWizard() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [ubicacionModo, setUbicacionModo] = useState<'principal' | 'otras' | 'libre'>('principal');
  const [dup, setDup] = useState<DuplicateCheck>({ telefono: false, correo: false, nombre: false });
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [capacitaciones, setCapacitaciones] = useState<Capacitacion[]>([]);
  // Si hay una capacitación con la ventana de check-in abierta justo cuando
  // alguien termina de registrarse, no tiene sentido hacerlo buscar su
  // propio nombre otra vez en el check-in — ya está parado ahí, ya llenó
  // el formulario. `capAutoMarcada` guarda cuál quedó marcada, para
  // mostrarlo en la pantalla de éxito.
  const [capAutoMarcada, setCapAutoMarcada] = useState<Capacitacion | null>(null);

  useEffect(() => subscribeCapacitaciones(setCapacitaciones), []);

  const barrios = form.estaca ? ESTACAS_DATA[form.estaca] : null;
  // `!barrios` (no `=== null`) a propósito: cubre tanto las estacas sin
  // barrios precargados como una estaca escrita a mano que no existe en
  // ESTACAS_DATA — en ambos casos ESTACAS_DATA[form.estaca] da `undefined`,
  // no `null`, y antes de este fix eso rendía un <select> vacío en vez de
  // caer al input de texto libre.
  const isBarrioLibre = !!form.estaca && !barrios;

  // Verificación de duplicados con debounce, igual que en el GAS original.
  useEffect(() => {
    if (!validatePhone(form.telefono) || !validateEmail(form.correo) || !form.nombres.trim() || !form.apellidos.trim()) {
      return;
    }
    setChecking(true);
    const t = setTimeout(async () => {
      const res = await checkDuplicates(form.telefono, form.correo, form.nombres, form.apellidos);
      setDup(res);
      setChecking(false);
    }, 500);
    return () => clearTimeout(t);
  }, [form.telefono, form.correo, form.nombres, form.apellidos]);

  const step1Valid = useMemo(
    () =>
      !!form.nombres.trim() &&
      !!form.apellidos.trim() &&
      !!form.fechaNacimiento &&
      new Date(form.fechaNacimiento) <= new Date() &&
      !!form.genero &&
      validatePhone(form.telefono) &&
      validateEmail(form.correo) &&
      !dup.telefono &&
      !dup.correo &&
      !dup.nombre &&
      !checking,
    [form, dup, checking]
  );
  const step2Valid = !!form.estaca && ((isBarrioLibre && !!form.barrioLibre.trim()) || (!isBarrioLibre && !!form.barrio));
  const step3Valid =
    !!form.disponibilidad &&
    !!form.experienciaPrevia &&
    (form.experienciaPrevia === 'ninguna' || !!form.asignacionAnterior);
  // Lo único obligatorio del Paso 4 es el consentimiento — todo lo
  // audiovisual sigue siendo opcional.
  const step4Valid = form.aceptaConsentimiento;

  // Lista legible de qué falta completar en el paso actual — el botón se
  // queda gris igual que antes, pero ahora explica por qué en vez de dejar
  // que la persona adivine campo por campo. No incluye los duplicados
  // (teléfono/correo/nombre ya registrado): esos ya tienen su propio
  // mensaje pegado al campo.
  const camposFaltantes = useMemo(() => {
    const faltan: string[] = [];
    if (step === 1) {
      if (!form.nombres.trim()) faltan.push('Nombres');
      if (!form.apellidos.trim()) faltan.push('Apellidos');
      if (!form.fechaNacimiento || new Date(form.fechaNacimiento) > new Date()) faltan.push('Fecha de nacimiento');
      if (!form.genero) faltan.push('Género');
      if (!validatePhone(form.telefono)) faltan.push('Teléfono');
      if (!validateEmail(form.correo)) faltan.push('Correo');
    } else if (step === 2) {
      if (!form.estaca) faltan.push('Estaca');
      else if (isBarrioLibre ? !form.barrioLibre.trim() : !form.barrio) faltan.push('Barrio');
    } else if (step === 3) {
      if (!form.experienciaPrevia) faltan.push('Experiencia previa');
      if (form.experienciaPrevia && form.experienciaPrevia !== 'ninguna' && !form.asignacionAnterior) faltan.push('Asignación anterior');
      if (!form.disponibilidad) faltan.push('Disponibilidad');
    } else if (step === 4) {
      if (!form.aceptaConsentimiento) faltan.push('Aceptar el tratamiento de datos');
    }
    return faltan;
  }, [step, form, isBarrioLibre]);

  async function submit() {
    if (!step1Valid || !step2Valid || !step3Valid) return;
    setSubmitting(true);
    setError('');
    const res = await registrarParticipante({
      nombres: normalizeName(form.nombres),
      apellidos: normalizeName(form.apellidos),
      fechaNacimiento: form.fechaNacimiento,
      telefono: normalizePhone(form.telefono),
      correo: normalizeEmail(form.correo),
      estaca: form.estaca,
      barrio: isBarrioLibre ? form.barrioLibre.trim() : form.barrio,
      genero: form.genero as 'H' | 'M',
      experienciaPrevia: form.experienciaPrevia as ExperienciaPrevia,
      asignacionAnterior: form.asignacionAnterior,
      disponibilidad: form.disponibilidad as 'si' | 'no_creo' | 'no_se',
      audiovisualHabilidades: form.audiovisualOtro.trim()
        ? [...form.audiovisualHabilidades, form.audiovisualOtro.trim()]
        : form.audiovisualHabilidades,
      audiovisualEquipo: form.audiovisualEquipo,
      consentimientoDatosFecha: new Date().toISOString(),
    });
    setSubmitting(false);
    if (res.ok) {
      const cap = getCapacitacionParaAutoMarcar(capacitaciones);
      if (cap) {
        await marcarAsistencia(cap.id, res.id, 'presente', `autoregistro-nuevo:${form.nombres} ${form.apellidos}`);
        setCapAutoMarcada(cap);
      } else {
        setCapAutoMarcada(null);
      }
      return setSubmitted(true);
    }
    setError(res.message);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
          <h1 className="text-xl font-extrabold text-primary mb-2">¡Registro exitoso!</h1>
          {capAutoMarcada ? (
            <p className="text-sm text-slate-500 leading-relaxed">
              Gracias por prepararte como consejero para FSY 2027. Como <strong>{capAutoMarcada.label}</strong> está
              en curso ahora mismo, tu asistencia ya quedó marcada — no necesitas hacer nada más.
            </p>
          ) : (
            <p className="text-sm text-slate-500 leading-relaxed">
              Gracias por prepararte como consejero para FSY 2027. Pronto recibirás información sobre las próximas
              capacitaciones.
            </p>
          )}
          <button
            onClick={() => {
              setForm(EMPTY);
              setUbicacionModo('principal');
              setSubmitted(false);
              setCapAutoMarcada(null);
              setStep(1);
            }}
            className="mt-6 w-full bg-primary text-white font-bold rounded-xl py-3"
          >
            Registrar otra persona
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
            <h1 className="text-lg font-extrabold">Registro de Consejeros</h1>
            <p className="text-xs font-bold text-accent mt-1">{EVENTO_NOMBRE}</p>
            <p className="text-xs text-white/70 mt-0.5">Preparación previa al evento — 4 pasos rápidos</p>
            <StepIndicator step={step} />
          </div>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {step === 1 && (
            <>
              <SectionHeader icon="👤" title="Datos personales" />
              <Field label="Nombres" required>
                <input className="input" value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} />
              </Field>
              <Field label="Apellidos" required>
                <input className="input" value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
              </Field>
              <Field label="Fecha de nacimiento" required>
                <input
                  className="input"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.fechaNacimiento}
                  onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
                />
              </Field>
              <Field label="Género" required>
                <RadioRow
                  value={form.genero}
                  onChange={(v) => setForm({ ...form, genero: v as 'H' | 'M' })}
                  options={[{ value: 'H', label: 'Hombre' }, { value: 'M', label: 'Mujer' }]}
                />
              </Field>
              <Field label="Teléfono" required>
                <input
                  className={`input ${dup.telefono ? 'error' : ''}`}
                  value={form.telefono}
                  maxLength={9}
                  placeholder="987654321"
                  onChange={(e) => setForm({ ...form, telefono: normalizePhone(e.target.value) })}
                />
                {dup.telefono && <Helper error>Este teléfono ya está registrado.</Helper>}
              </Field>
              <Field label="Correo" required>
                <input
                  className={`input ${dup.correo ? 'error' : ''}`}
                  type="email"
                  value={form.correo}
                  onChange={(e) => setForm({ ...form, correo: e.target.value })}
                />
                {dup.correo && <Helper error>Este correo ya está registrado.</Helper>}
              </Field>
              {dup.nombre && <Helper error>Ya existe un participante con ese nombre y apellido.</Helper>}
            </>
          )}

          {step === 2 && (
            <>
              <SectionHeader icon="📍" title="Ubicación" />
              <Field label="Estaca" required>
                {ubicacionModo === 'principal' && (
                  <select
                    className="input"
                    value={form.estaca}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === OTRA_ESTACA) {
                        setUbicacionModo('otras');
                        setForm({ ...form, estaca: '', barrio: '', barrioLibre: '' });
                      } else {
                        setForm({ ...form, estaca: v, barrio: '', barrioLibre: '' });
                      }
                    }}
                  >
                    <option value="">— Selecciona tu estaca —</option>
                    {ESTACAS_PRINCIPALES.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                    <option value={OTRA_ESTACA}>Otra estaca…</option>
                  </select>
                )}

                {ubicacionModo === 'otras' && (
                  <>
                    <select
                      className="input"
                      value={ESTACAS_SECUNDARIAS.includes(form.estaca) ? form.estaca : ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === ESTACA_LIBRE) {
                          setUbicacionModo('libre');
                          setForm({ ...form, estaca: '', barrio: '', barrioLibre: '' });
                        } else {
                          setForm({ ...form, estaca: v, barrio: '', barrioLibre: '' });
                        }
                      }}
                    >
                      <option value="">— Selecciona tu estaca —</option>
                      {ESTACAS_SECUNDARIAS.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                      <option value={ESTACA_LIBRE}>Mi estaca no está en la lista</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setUbicacionModo('principal');
                        setForm({ ...form, estaca: '', barrio: '', barrioLibre: '' });
                      }}
                      className="text-xs font-bold text-primary mt-1.5"
                    >
                      ‹ Volver
                    </button>
                  </>
                )}

                {ubicacionModo === 'libre' && (
                  <>
                    <input
                      className="input"
                      placeholder="Escribe el nombre de tu estaca"
                      value={form.estaca}
                      onChange={(e) => setForm({ ...form, estaca: e.target.value, barrio: '', barrioLibre: '' })}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUbicacionModo('otras');
                        setForm({ ...form, estaca: '', barrio: '', barrioLibre: '' });
                      }}
                      className="text-xs font-bold text-primary mt-1.5"
                    >
                      ‹ Volver
                    </button>
                  </>
                )}
              </Field>
              {form.estaca && !isBarrioLibre && (
                <Field label="Barrio" required>
                  <select className="input" value={form.barrio} onChange={(e) => setForm({ ...form, barrio: e.target.value })}>
                    <option value="">— Selecciona tu barrio —</option>
                    {(barrios || []).map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </Field>
              )}
              {isBarrioLibre && (
                <Field label="Ingresa tu barrio" required>
                  <input className="input" value={form.barrioLibre} onChange={(e) => setForm({ ...form, barrioLibre: e.target.value })} />
                  <Helper>Esta estaca aún no tiene barrios precargados.</Helper>
                </Field>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <SectionHeader icon="✨" title="Información adicional" />
              <div className="bg-slate-50 rounded-2xl p-4 flex flex-col gap-3">
                <Field label="¿Has servido antes en FSY (PFJ) o en una Conferencia JAS?" required>
                  <RadioRow
                    value={form.experienciaPrevia}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        experienciaPrevia: v as ExperienciaPrevia,
                        asignacionAnterior: v === 'ninguna' ? '' : form.asignacionAnterior,
                      })
                    }
                    vertical
                    options={EXPERIENCIA_PREVIA_OPTIONS}
                  />
                </Field>
                {form.experienciaPrevia && form.experienciaPrevia !== 'ninguna' && (
                  <Field label="Asignación anterior" required>
                    <select className="input" value={form.asignacionAnterior} onChange={(e) => setForm({ ...form, asignacionAnterior: e.target.value })}>
                      <option value="">— Selecciona —</option>
                      {ASIGNACIONES_PREVIAS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              <div className="bg-slate-50 rounded-2xl p-4">
                <Field label={`¿Estarás disponible ${EVENTO_FECHAS_LABEL}?`} required>
                  <RadioRow
                    value={form.disponibilidad}
                    onChange={(v) => setForm({ ...form, disponibilidad: v as 'si' | 'no_creo' | 'no_se' })}
                    vertical
                    options={[
                      {
                        value: 'si',
                        label: (
                          <span className="flex items-center gap-2">
                            <IconCheck className="w-[18px] h-[18px] shrink-0" /> Sí, puedo
                          </span>
                        ),
                      },
                      {
                        value: 'no_creo',
                        label: (
                          <span className="flex items-center gap-2">
                            <IconMinus className="w-[18px] h-[18px] shrink-0" /> No creo
                          </span>
                        ),
                      },
                      {
                        value: 'no_se',
                        label: (
                          <span className="flex items-center gap-2">
                            <IconQuestion className="w-[18px] h-[18px] shrink-0" /> Aún no lo sé
                          </span>
                        ),
                      },
                    ]}
                  />
                  <Helper>Es la fecha real del evento — ayúdanos a planificar con la respuesta más honesta posible.</Helper>
                </Field>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <SectionHeader icon="🎬" title="Equipo audiovisual" />
              <p className="text-xs text-slate-500 -mt-1">
                Opcional — nos ayuda a identificar talento para el equipo audiovisual del evento.
              </p>
              <div className="bg-slate-50 rounded-2xl p-4 flex flex-col gap-2.5">
                <Field label="¿Tienes experiencia o habilidad en algo de esto?">
                  <div className="flex flex-col gap-2">
                    {HABILIDADES_AUDIOVISUAL.map((h) => (
                      <label key={h} className="flex items-center gap-2.5 bg-white rounded-xl border-[1.5px] border-slate-200 px-3.5 py-2.5">
                        <input
                          type="checkbox"
                          checked={form.audiovisualHabilidades.includes(h)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              // Marcar una habilidad real quita "No tengo
                              // experiencia" si estaba marcada — no tiene
                              // sentido tener ambas a la vez.
                              audiovisualHabilidades: (e.target.checked
                                ? [...form.audiovisualHabilidades, h]
                                : form.audiovisualHabilidades.filter((x) => x !== h)
                              ).filter((x) => x !== SIN_EXPERIENCIA_AV),
                            })
                          }
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm font-semibold">{h}</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2.5 bg-white rounded-xl border-[1.5px] border-slate-200 px-3.5 py-2.5">
                      <input
                        type="checkbox"
                        checked={form.audiovisualHabilidades.includes(SIN_EXPERIENCIA_AV)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            // Marcarla reemplaza cualquier otra selección —
                            // son mutuamente excluyentes.
                            audiovisualHabilidades: e.target.checked ? [SIN_EXPERIENCIA_AV] : [],
                          })
                        }
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-sm font-semibold text-slate-500">{SIN_EXPERIENCIA_AV}</span>
                    </label>
                  </div>
                </Field>
                <Field label="¿Alguna otra habilidad? (opcional)">
                  <input
                    className="input"
                    placeholder="Ej: animación, redacción… (déjalo vacío si no tienes otra)"
                    value={form.audiovisualOtro}
                    onChange={(e) => setForm({ ...form, audiovisualOtro: e.target.value })}
                  />
                </Field>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4">
                <Field label="¿Tienes equipo propio para esto? (cámara, laptop con software de edición, etc.)">
                  <RadioRow
                    value={form.audiovisualEquipo}
                    onChange={(v) => setForm({ ...form, audiovisualEquipo: v as 'si' | 'no' | 'algo' })}
                    vertical
                    options={[
                      { value: 'si', label: 'Sí, tengo equipo propio' },
                      { value: 'algo', label: 'Tengo algo, no completo' },
                      { value: 'no', label: 'No tengo equipo' },
                    ]}
                  />
                </Field>
              </div>

              <SectionHeader icon="🔒" title="Consentimiento" />
              <label
                className={`flex items-start gap-3 rounded-2xl border-[1.5px] p-4 cursor-pointer ${
                  form.aceptaConsentimiento ? 'bg-primary/5 border-primary' : 'bg-white border-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.aceptaConsentimiento}
                  onChange={(e) => setForm({ ...form, aceptaConsentimiento: e.target.checked })}
                  className="w-5 h-5 mt-0.5 accent-primary shrink-0"
                />
                <span className="text-sm leading-relaxed">
                  <span className="text-red-500 font-bold">* </span>
                  Acepto el tratamiento de mis datos personales y el uso de mi imagen (fotos y video) para fines del
                  evento FSY 2027, conforme a la Ley de Protección de Datos Personales.
                </span>
              </label>
            </>
          )}

          {error && <Helper error>{error}</Helper>}

          <div className="flex gap-2 mt-2">
            {step > 1 && (
              <button onClick={() => setStep((s) => s - 1)} className="flex-1 border-2 border-primary text-primary font-bold rounded-xl py-3">
                Atrás
              </button>
            )}
            {step < 4 ? (
              <button
                disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid) || (step === 3 && !step3Valid)}
                onClick={() => setStep((s) => s + 1)}
                className="flex-1 bg-primary text-white font-bold rounded-xl py-3 disabled:opacity-40"
              >
                {checking && step === 1 ? 'Verificando…' : 'Siguiente →'}
              </button>
            ) : (
              <button
                disabled={submitting || !step4Valid}
                onClick={submit}
                className="flex-1 bg-primary text-white font-bold rounded-xl py-3 disabled:opacity-40"
              >
                {submitting ? 'Enviando…' : '📤 Enviar registro'}
              </button>
            )}
          </div>

          {camposFaltantes.length > 0 && (
            <p className="text-xs text-amber-700 text-center -mt-1.5">
              Faltan: {camposFaltantes.join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="grid grid-cols-4 gap-1.5 mt-4">
      {['Datos', 'Ubicación', 'Adicional', 'Audiovisual'].map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div
            key={label}
            className={`rounded-lg px-2 py-1.5 text-[10px] font-bold flex items-center gap-1.5 border ${
              active ? 'bg-white text-primary border-white' : done ? 'bg-emerald-400/20 border-emerald-300/30' : 'bg-white/10 border-white/15 text-white/70'
            }`}
          >
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${active ? 'bg-primary text-white' : 'bg-white/20'}`}>
              {done ? '✓' : n}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5 pb-1 -mt-1">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-base shrink-0">{icon}</div>
      <span className="text-[13px] font-extrabold text-primary tracking-tight">{title}</span>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Helper({ error, children }: { error?: boolean; children: React.ReactNode }) {
  return <span className={`text-xs ${error ? 'text-red-500 font-semibold' : 'text-slate-500'}`}>{error && '❌ '}{children}</span>;
}

function RadioRow({
  value,
  onChange,
  options,
  vertical,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: React.ReactNode }[];
  vertical?: boolean;
}) {
  return (
    <div className={vertical ? 'flex flex-col gap-2' : 'flex gap-2'}>
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 text-sm font-semibold rounded-xl border-[1.5px] px-3 py-2.5 transition ${
            value === opt.value ? 'bg-primary/10 border-primary text-primary' : 'border-slate-200 text-slate-600'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Íconos SVG minimalistas para las opciones de disponibilidad — reemplazan
// los emoji (✅🤔❓) según la revisión de ui-ux-pro-max/frontend-design.
// Usan currentColor a propósito: heredan automáticamente el navy (#0E2954)
// cuando la opción está seleccionada y el gris cuando no, sin lógica extra.
function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx={10} cy={10} r={8} />
      <path d="M6.5 10.3l2.2 2.2 4.8-4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconMinus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx={10} cy={10} r={8} />
      <path d="M6.5 10h7" strokeLinecap="round" />
    </svg>
  );
}
function IconQuestion({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx={10} cy={10} r={8} />
      <path d="M7.6 7.8a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1 .7-1 1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={10} cy={14} r={0.9} fill="currentColor" stroke="none" />
    </svg>
  );
}
