/**
 * Convierte una suscripción en tiempo real (onSnapshot) en una COMPARTIDA:
 * todos los que se suscriben reciben el mismo flujo y Firestore abre UNA sola
 * conexión. Al irse el último suscriptor, la conexión se mantiene `graciaMs`
 * más: así, cambiar de pestaña y volver (Inicio → Reportes → Inicio) no vuelve
 * a descargar toda la colección, que es lo que cobra Firestore y lo que hace
 * lenta la pantalla. (Regla Vercel client-swr-dedup.)
 */
export function suscripcionCompartida<T>(
  abrir: (emitir: (valor: T) => void) => () => void,
  graciaMs = 30_000
): (cb: (valor: T) => void) => () => void {
  const oyentes = new Set<(valor: T) => void>();
  let ultimo: { valor: T } | undefined;
  let cerrar: (() => void) | undefined;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  return (cb) => {
    if (temporizador) clearTimeout(temporizador);
    oyentes.add(cb);
    if (!cerrar) {
      cerrar = abrir((valor) => {
        ultimo = { valor };
        oyentes.forEach((fn) => fn(valor));
      });
    } else if (ultimo) {
      cb(ultimo.valor); // ya hay datos en memoria: respuesta inmediata, cero lecturas
    }
    return () => {
      oyentes.delete(cb);
      if (oyentes.size === 0) {
        temporizador = setTimeout(() => {
          if (oyentes.size === 0) {
            cerrar?.();
            cerrar = undefined;
            ultimo = undefined;
          }
        }, graciaMs);
      }
    };
  };
}
