import { useCallback, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';

const BORDE = 24; // px de degradado en cada borde

/**
 * Tira que se desliza de lado SIN barra de scroll: en su lugar, un degradado en el
 * borde donde todavía hay más contenido (avisa "hay más por acá"). Si hay un hijo
 * activo (aria-pressed / aria-selected / aria-current), arranca centrado en él, así
 * una pestaña elegida nunca queda escondida fuera de pantalla.
 * `seguir` = valor que, al cambiar, vuelve a centrar el activo (ej. la pestaña elegida).
 */
export default function ScrollX({ seguir, className = '', style, children, ...rest }: HTMLAttributes<HTMLDivElement> & { seguir?: string | number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bordes, setBordes] = useState({ izq: false, der: false });

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const izq = el.scrollLeft > 2;
    const der = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setBordes((b) => (b.izq === izq && b.der === der ? b : { izq, der }));
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const activo = el?.querySelector<HTMLElement>('[aria-pressed="true"],[aria-selected="true"],[aria-current="true"]');
    if (el && activo) el.scrollLeft = activo.offsetLeft - (el.clientWidth - activo.offsetWidth) / 2;
    medir();
  }, [seguir, medir]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [medir]);

  const mascara = `linear-gradient(to right, ${bordes.izq ? 'transparent' : '#000'} 0, #000 ${BORDE}px, #000 calc(100% - ${BORDE}px), ${bordes.der ? 'transparent' : '#000'} 100%)`;
  return (
    <div
      {...rest}
      ref={ref}
      onScroll={medir}
      className={`overflow-x-auto scrollbar-none ${className}`}
      style={{ ...style, maskImage: mascara, WebkitMaskImage: mascara }}
    >
      {children}
    </div>
  );
}
