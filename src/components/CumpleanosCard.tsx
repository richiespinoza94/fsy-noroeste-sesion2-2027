import type { Participante } from '../types';
import { nombreConInicialMaterna } from '../utils/nombreCorto';

/**
 * Tarjeta de cumpleaños en Home — ver análisis en cumpleanos.ts sobre por
 * qué Home (y no Búsqueda/Gestión) es el lugar correcto.
 *
 * Si no hay nadie hoy ni en la ventana de próximos días, la tarjeta no se
 * dibuja (devuelve null) — un cuadro vacío permanente es ruido, no ayuda
 * de seguimiento.
 */

function soloDigitos(telefono: string): string {
  return telefono.replace(/\D/g, '');
}

function Fila({ item, destacado }: { item: { participante: Participante; diasFaltantes: number; edadQueCumple: number }; destacado: boolean }) {
  const { participante: p, diasFaltantes, edadQueCumple } = item;
  const telDigits = soloDigitos(p.telefono);
  return (
    <div className={`flex items-center gap-2.5 py-2 ${destacado ? '' : 'opacity-90'}`}>
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 ${
          destacado ? 'bg-accent/25' : 'bg-primary/5'
        }`}
      >
        🎂
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">{nombreConInicialMaterna(p.nombres, p.apellidos)}</div>
        <div className="text-[11px] text-slate-500 truncate">
          {p.asignacion || 'Sin asignación'} · {p.estaca}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={`text-[10px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${
            destacado ? 'bg-accent/30 text-primary-dark' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {diasFaltantes === 0 ? `Cumple ${edadQueCumple}` : diasFaltantes === 1 ? 'Mañana' : `En ${diasFaltantes} días`}
        </span>
        {telDigits && (
          <a
            href={`https://wa.me/51${telDigits}`}
            target="_blank"
            rel="noopener"
            className="text-[10px] font-bold text-primary bg-primary/5 rounded-lg px-2 py-1.5 -mr-2"
          >
            💬 Saludar
          </a>
        )}
      </div>
    </div>
  );
}

export default function CumpleanosCard({
  items,
}: {
  items: { participante: Participante; diasFaltantes: number; edadQueCumple: number }[];
}) {
  if (items.length === 0) return null;
  const hoy = items.filter((i) => i.diasFaltantes === 0);
  const proximos = items.filter((i) => i.diasFaltantes > 0);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border-t-[3px]" style={{ borderTopColor: '#f5c038' }}>
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
        🎉 Cumpleaños {hoy.length > 0 ? 'de hoy y próximos' : 'próximos'}
      </div>
      <div className="divide-y divide-slate-100">
        {hoy.map((i) => (
          <Fila key={i.participante.id} item={i} destacado />
        ))}
        {proximos.map((i) => (
          <Fila key={i.participante.id} item={i} destacado={false} />
        ))}
      </div>
    </div>
  );
}
