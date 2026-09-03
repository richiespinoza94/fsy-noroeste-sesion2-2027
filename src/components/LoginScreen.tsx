import { useState } from 'react';
import { loginStaff, setupPasswordFirstTime } from '../services/authService';
import type { SessionUser } from '../types';

export default function LoginScreen({ onSuccess }: { onSuccess: (u: SessionUser) => void }) {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!correo.trim() || !password.trim()) return setError('Completa todos los campos.');
    setLoading(true);
    setError('');
    try {
      const res = await loginStaff(correo.trim(), password);
      if (res.ok) return onSuccess(res.user);
      if (res.code === 'NEEDS_SETUP') return setNeedsSetup(true);
      setError(res.message);
    } catch (err) {
      // Nunca dejar el botón colgado en "Un momento..." — siempre mostrar el error real.
      setError(err instanceof Error ? `Error: ${err.message}` : 'Error de conexión inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Mínimo 8 caracteres.');
    if (password !== password2) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    setError('');
    try {
      const res = await setupPasswordFirstTime(correo.trim(), password);
      if (res.ok) return onSuccess(res.user);
      setError(res.message);
    } catch (err) {
      setError(err instanceof Error ? `Error: ${err.message}` : 'Error de conexión inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-br from-primary to-primary-dark px-7 py-8 text-center text-white relative overflow-hidden">
          <div className="absolute -top-10 -right-12 w-44 h-44 rounded-full bg-accent/10" />
          <div className="relative">
            <div className="inline-block bg-accent/20 text-accent text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full border border-accent/30 mb-3">
              Gestión FSY 2027
            </div>
            <h1 className="text-xl font-extrabold">Acceso de Equipo</h1>
            <p className="text-sm text-white/75 mt-1">Preparación de consejeros antes del evento</p>
          </div>
        </div>

        <form onSubmit={needsSetup ? handleSetup : handleLogin} className="p-7 flex flex-col gap-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-3 py-2 animate-slide-down">
              ❌ {error}
            </div>
          )}

          <Field label="Correo" required>
            <input
              type="email"
              value={correo}
              disabled={needsSetup || loading}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="tu@correo.com"
              className="input"
            />
          </Field>

          {needsSetup && (
            <div className="bg-sky-50 border border-sky-200 text-sky-800 text-xs rounded-xl px-3 py-2">
              ✨ Primer acceso — crea una contraseña de al menos 8 caracteres.
            </div>
          )}

          <Field label={needsSetup ? 'Nueva contraseña' : 'Contraseña'} required>
            <input
              type="password"
              value={password}
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
            />
          </Field>

          {needsSetup && (
            <Field label="Confirmar contraseña" required>
              <input
                type="password"
                value={password2}
                disabled={loading}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </Field>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-primary text-white font-bold rounded-xl py-3.5 shadow-lg shadow-primary/30 disabled:opacity-50 mt-1"
          >
            {loading ? 'Un momento…' : needsSetup ? '✅ Crear contraseña y entrar' : '🔓 Ingresar'}
          </button>

          {needsSetup && (
            <button
              type="button"
              onClick={() => {
                setNeedsSetup(false);
                setPassword('');
                setPassword2('');
                setError('');
              }}
              className="text-sm text-primary font-semibold"
            >
              ← Volver
            </button>
          )}
        </form>
      </div>
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
