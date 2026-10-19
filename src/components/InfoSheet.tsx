import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Hoja de información que se abre sobre la pantalla (desde un botón ⓘ).
 * Sirve para explicar una lista o un cálculo sin dejar el texto fijo en la
 * pantalla principal. Se cierra con el botón, tocando afuera o con Escape.
 */
export function BotonInfo({ onClick, etiqueta }: { onClick: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="shrink-0 w-11 h-11 -m-2 flex items-center justify-center rounded-full text-slate-500"
    >
      <span className="w-6 h-6 rounded-full border-2 border-current text-sm font-extrabold leading-none flex items-center justify-center" aria-hidden="true">
        i
      </span>
    </button>
  );
}

export default function InfoSheet({ titulo, onClose, children, cerrar: etiquetaCerrar = 'Entendido' }: { titulo: string; onClose: () => void; children: ReactNode; cerrar?: string }) {
  const cerrar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cerrar.current?.focus();
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="bg-white rounded-t-3xl w-full max-w-[850px] mx-auto p-5 max-h-[85vh] overflow-y-auto">
        <div className="font-extrabold text-lg mb-3">{titulo}</div>
        {children}
        <button ref={cerrar} onClick={onClose} className="w-full mt-4 min-h-[44px] bg-slate-100 text-slate-700 font-bold rounded-xl text-sm">
          {etiquetaCerrar}
        </button>
      </div>
    </div>
  );
}
