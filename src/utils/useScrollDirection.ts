import { useCallback, useRef } from 'react';

/**
 * Detecta la dirección del scroll DENTRO de un contenedor — cada pantalla
 * tiene su propio scroll interno, no hay un scroll único de página — y
 * avisa solo cuando cambia, en vez de en cada pixel.
 *
 * Umbral de 8px: evita que un scroll de 1-2px (rebote de trackpad, ajuste
 * del navegador al entrar) dispare el cambio. Solo esconde si está bajando
 * Y ya se alejó un poco del top (`y > 40`) — así el menú no desaparece
 * apenas se empieza a mover la lista un pixel.
 */
export function useScrollDirection(onChange: (bajando: boolean) => void) {
  const lastY = useRef(0);
  return useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      const y = e.currentTarget.scrollTop;
      const delta = y - lastY.current;
      if (Math.abs(delta) > 8) {
        onChange(delta > 0 && y > 40);
        lastY.current = y;
      }
    },
    [onChange]
  );
}
