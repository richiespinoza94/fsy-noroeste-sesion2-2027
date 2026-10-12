import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Aviso inferior con "Deshacer" (5 s). Para acciones que se hacen de un toque
 * (quitar a alguien, separar un compañerismo): en vez de pedir confirmación
 * antes, se actúa y se ofrece volver atrás.
 */
export function useAvisoDeshacer(): { mostrar: (texto: string, deshacer: () => void) => void; nodo: ReactNode } {
  const [aviso, setAviso] = useState<{ texto: string; deshacer: () => void } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  const mostrar = useCallback((texto: string, deshacer: () => void) => {
    clearTimeout(temporizador.current);
    setAviso({
      texto,
      deshacer: () => {
        clearTimeout(temporizador.current);
        setAviso(null);
        deshacer();
      },
    });
    temporizador.current = setTimeout(() => setAviso(null), 5000);
  }, []);

  const nodo = aviso && (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-4 right-4 bottom-20 z-30 mx-auto max-w-md bg-slate-900 text-white rounded-xl pl-4 pr-1 flex items-center gap-2 shadow-lg"
    >
      <span className="flex-1 text-sm py-2.5 truncate">{aviso.texto}</span>
      <button onClick={aviso.deshacer} className="min-h-[44px] px-4 text-sm font-extrabold text-accent">
        Deshacer
      </button>
    </div>
  );
  return { mostrar, nodo };
}
