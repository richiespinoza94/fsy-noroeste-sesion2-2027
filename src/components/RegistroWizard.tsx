import { useEffect, useMemo, useState } from 'react';
import { ESTACAS_DATA, TODAS_LAS_ESTACAS } from '../data/estacas';
import { checkDuplicates, registrarParticipante, type DuplicateCheck } from '../services/participantsService';
import { ASIGNACIONES_PREVIAS } from '../types';
import { normalizeEmail, normalizeName, normalizePhone, validateEmail, validatePhone } from '../utils/validation';

const EMPTY = {
  nombres: '',
  apellidos: '',
  telefono: '',
  correo: '',
  estaca: '',
  barrio: '',
  barrioLibre: '',
  staffAnterior: 'no' as 'si' | 'no',
  asignacionAnterior: '',
  genero: '' as 'H' | 'M' | '',
  disponibilidad: '' as 'si' | 'no_creo' | 'no_se' | '',
};

export default function RegistroWizard() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [dup, setDup] = useState<DuplicateCheck>({ telefono: false, correo: false, nombre: false });
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const barrios = form.estaca ? ESTACAS_DATA[form.estaca] : null;
  const isBarrioLibre = !!form.estaca && barrios === null;

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
      validatePhone(form.telefono) &&
      validateEmail(form.correo) &&
      !dup.telefono &&
      !dup.correo &&
      !dup.nombre &&
      !checking,
    [form, dup, checking]
  );
  const step2Valid = !!form.estaca && ((isBarrioLibre && !!form.barrioLibre.trim()) || (!isBarrioLibre && !!form.barrio));
  const step3Valid = !!form.genero && !!form.disponibilidad && (form.staffAnterior !== 'si' || !!form.asignacionAnterior);

  async function submit() {
    if (!step1Valid || !step2Valid || !step3Valid) return;
    setSubmitting(true);
    setError('');
    const res = await registrarParticipante({
      nombres: normalizeName(form.nombres),
      apellidos: normalizeName(form.apellidos),
      telefono: normalizePhone(form.telefono),
      correo: normalizeEmail(form.correo),
      estaca: form.estaca,
      barrio: isBarrioLibre ? form.barrioLibre.trim() : form.barrio,
      genero: form.genero as 'H' | 'M',
      staffAnterior: form.staffAnterior,
      asignacionAnterior: form.asignacionAnterior,
      disponibilidad: form.disponibilidad as 'si' | 'no_creo' | 'no_se',
    });
    setSubmitting(false);
    if (res.ok) return setSubmitted(true);
    setError(res.message);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
          <h1 className="text-xl font-extrabold text-primary mb-2">¡Registro exitoso!</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            Gracias por prepararte como consejero para FSY 2027. Pronto recibirás información sobre las próximas
            capacitaciones.
          </p>
          <button
            onClick={() => {
              setForm(EMPTY);
              setSubmitted(false);
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
            <p className="text-xs text-white/70 mt-1">Preparación previa al evento — 3 pasos rápidos</p>
            <StepIndicator step={step} />
          </div>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {step === 1 && (
            <>
              <Field label="Nombres" required>
                <input className="input" value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} />
              </Field>
              <Field label="Apellidos" required>
                <input className="input" value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
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
              <Field label="Estaca" required>
                <select
                  className="input"
                  value={form.estaca}
                  onChange={(e) => setForm({ ...form, estaca: e.target.value, barrio: '', barrioLibre: '' })}
                >
                  <option value="">— Selecciona tu estaca —</option>
                  {TODAS_LAS_ESTACAS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
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
              <Field label="¿Has servido antes en una conferencia de jóvenes?">
                <RadioRow
                  value={form.staffAnterior}
                  onChange={(v) => setForm({ ...form, staffAnterior: v as 'si' | 'no', asignacionAnterior: v === 'si' ? form.asignacionAnterior : '' })}
                  options={[{ value: 'no', label: 'No' }, { value: 'si', label: 'Sí' }]}
                />
              </Field>
              {form.staffAnterior === 'si' && (
                <Field label="Asignación anterior" required>
                  <select className="input" value={form.asignacionAnterior} onChange={(e) => setForm({ ...form, asignacionAnterior: e.target.value })}>
                    <option value="">— Selecciona —</option>
                    {ASIGNACIONES_PREVIAS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Género" required>
                <RadioRow
                  value={form.genero}
                  onChange={(v) => setForm({ ...form, genero: v as 'H' | 'M' })}
                  options={[{ value: 'H', label: 'Hombre' }, { value: 'M', label: 'Mujer' }]}
                />
              </Field>
              <Field label="Disponibilidad para servir" required>
                <RadioRow
                  value={form.disponibilidad}
                  onChange={(v) => setForm({ ...form, disponibilidad: v as 'si' | 'no_creo' | 'no_se' })}
                  vertical
                  options={[
                    { value: 'si', label: '✅ Sí, puedo' },
                    { value: 'no_creo', label: '🤔 No creo' },
                    { value: 'no_se', label: '❓ Aún no lo sé' },
                  ]}
                />
              </Field>
            </>
          )}

          {error && <Helper error>{error}</Helper>}

          <div className="flex gap-2 mt-2">
            {step > 1 && (
              <button onClick={() => setStep((s) => s - 1)} className="flex-1 border-2 border-primary text-primary font-bold rounded-xl py-3">
                Atrás
              </button>
            )}
            {step < 3 ? (
              <button
                disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                onClick={() => setStep((s) => s + 1)}
                className="flex-1 bg-primary text-white font-bold rounded-xl py-3 disabled:opacity-40"
              >
                {checking && step === 1 ? 'Verificando…' : 'Siguiente →'}
              </button>
            ) : (
              <button
                disabled={!step3Valid || submitting}
                onClick={submit}
                className="flex-1 bg-primary text-white font-bold rounded-xl py-3 disabled:opacity-40"
              >
                {submitting ? 'Enviando…' : '📤 Enviar registro'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-4">
      {['Datos', 'Ubicación', 'Adicional'].map((label, i) => {
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
  options: { value: string; label: string }[];
  vertical?: boolean;
}) {
  return (
    <div className={vertical ? 'flex flex-col gap-2' : 'flex gap-2'}>
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 text-sm font-semibold rounded-xl border-1.5 px-3 py-2.5 transition ${
            value === opt.value ? 'bg-primary/10 border-primary text-primary' : 'border-slate-200 text-slate-600'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
