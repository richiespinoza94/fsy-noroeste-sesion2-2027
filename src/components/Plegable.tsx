import type { ReactNode } from 'react';

/**
 * Tarjeta plegable de Gestión → Compañías: cabecera de 56 px con título, un
 * resumen de una línea (lo que hay que saber sin abrirla) y la flecha. El
 * contenido solo se dibuja abierta, así la pantalla no se hace larguísima.
 * Las acciones de cada sección van DENTRO del contenido, no en la cabecera:
 * en un celular de 360 px no caben junto al título.
 */
export default function Plegable({
  icono,
  titulo,
  resumen,
  abierto,
  onToggle,
  children,
}: {
  icono: string;
  titulo: string;
  resumen?: ReactNode;
  abierto: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm">
      <button onClick={onToggle} aria-expanded={abierto} className="w-full min-h-[56px] px-4 py-2 flex items-center gap-3 text-left">
        <span className="text-xl shrink-0" aria-hidden="true">{icono}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wide">{titulo}</span>
          {resumen && <span className="block text-sm font-semibold text-slate-800 truncate">{resumen}</span>}
        </span>
        <span className={`shrink-0 text-slate-500 transition-transform motion-reduce:transition-none ${abierto ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
      </button>
      {abierto && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
