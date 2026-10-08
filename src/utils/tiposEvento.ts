import { TIPOS_EVENTO, type Capacitacion, type TipoEvento } from '../types';

/** Tipo efectivo de un evento: los creados antes de existir `tipo` (o con un valor desconocido) cuentan como capacitación. */
export function tipoDe(cap: Capacitacion): TipoEvento {
  return TIPOS_EVENTO.some((t) => t.id === cap.tipo) ? (cap.tipo as TipoEvento) : 'capacitacion';
}

export function infoTipo(tipo: TipoEvento) {
  return TIPOS_EVENTO.find((t) => t.id === tipo) ?? TIPOS_EVENTO[0];
}

/** Sin tipos seleccionados deja pasar todo; con uno o más, solo los eventos de esos tipos. */
export function filtrarPorTipos(caps: Capacitacion[], tipos: TipoEvento[]): Capacitacion[] {
  return tipos.length === 0 ? caps : caps.filter((c) => tipos.includes(tipoDe(c)));
}

/** Cuántos eventos hay de cada tipo (solo los tipos que existen) — para los chips del filtro. */
export function contarPorTipo(caps: Capacitacion[]): { tipo: TipoEvento; n: number }[] {
  return TIPOS_EVENTO.map((t) => ({ tipo: t.id, n: caps.filter((c) => tipoDe(c) === t.id).length })).filter((x) => x.n > 0);
}

/** "yyyy-MM-dd" en hora LOCAL (toISOString da UTC y en Lima, después de las 7pm, ya sería "mañana"). */
export function hoyLocalISO(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
