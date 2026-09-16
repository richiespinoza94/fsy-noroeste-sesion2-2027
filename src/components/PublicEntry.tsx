import { useState } from 'react';
import AutoCheckInScreen from './AutoCheckInScreen';
import RegistroWizard from './RegistroWizard';
import { EVENTO_NOMBRE } from '../data/evento';

type Modo = 'elegir' | 'registro' | 'asistencia';

export default function PublicEntry() {
  const [modo, setModo] = useState<Modo>('elegir');

  if (modo === 'registro') return <RegistroWizard />;
  if (modo === 'asistencia') return <AutoCheckInScreen onBack={() => setModo('elegir')} />;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-br from-primary to-primary-dark px-6 py-8 text-white relative overflow-hidden text-center">
          <div className="absolute -top-10 -right-12 w-44 h-44 rounded-full bg-accent/10" />
          <div className="relative">
            <div className="inline-block bg-accent/20 text-accent text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full border border-accent/30 mb-3">
              Gestión FSY 2027
            </div>
            <h1 className="text-xl font-extrabold">¡Bienvenido!</h1>
            {/* Nombre de ESTA sesión, prominente — no solo "FSY 2027" a
                secas. Gente que ya asistió a Confe JAS o a otra sesión de
                FSY leía "¿es tu primera vez?" pensando en esa otra
                experiencia, no en esta. */}
            <p className="text-sm font-bold text-accent mt-1">{EVENTO_NOMBRE}</p>
            <p className="text-xs text-white/70 mt-0.5">Preparación de consejeros previa al evento</p>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm font-bold text-slate-700 text-center">
            ¿Es tu primera vez en la preparación de {EVENTO_NOMBRE}?
          </p>

          <button
            onClick={() => setModo('registro')}
            className="flex items-center gap-3 bg-primary/5 border-[1.5px] border-primary/20 rounded-2xl px-4 py-4 text-left"
          >
            <span className="text-2xl">🆕</span>
            <div className="flex-1">
              <div className="text-sm font-extrabold text-primary">Sí, es mi primera vez</div>
              <div className="text-xs text-slate-500 mt-0.5">Voy a registrarme (4 pasos rápidos)</div>
            </div>
            <span className="text-primary">›</span>
          </button>

          <button
            onClick={() => setModo('asistencia')}
            className="flex items-center gap-3 bg-emerald-50 border-[1.5px] border-emerald-200 rounded-2xl px-4 py-4 text-left"
          >
            <span className="text-2xl">🔁</span>
            <div className="flex-1">
              <div className="text-sm font-extrabold text-emerald-700">Ya me registré antes</div>
              <div className="text-xs text-slate-500 mt-0.5">Solo quiero marcar mi asistencia</div>
            </div>
            <span className="text-emerald-700">›</span>
          </button>
        </div>
      </div>
    </div>
  );
}
