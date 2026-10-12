import { stripAccents } from './validation';

/** Búsqueda difusa simple: substring en cualquier parte, o inicio de alguna palabra. */
export function fuzzyIncludes(haystack: string, query: string): boolean {
  const q = stripAccents(query.trim());
  if (!q) return true;
  const h = stripAccents(haystack);
  return h.includes(q) || h.split(' ').some((w) => w.startsWith(q));
}

const claves = (q: string): string[] => stripAccents(q).split(/\s+/).filter(Boolean);

/**
 * Búsqueda por varias palabras, en cualquier orden y sin tildes ni mayúsculas:
 * "pérez ventanilla" encuentra a "Juan Pérez Gómez · Ventanilla", y "prolima"
 * (sin espacio) encuentra "Pro Lima". Cada palabra escrita debe aparecer en algún lado.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const palabras = claves(query);
  if (!palabras.length) return true;
  const h = stripAccents(haystack);
  const junto = h.replace(/\s+/g, '');
  return palabras.every((w) => h.includes(w) || junto.includes(w));
}

/** ¿`palabra` (ya sin tildes) es el comienzo del nombre, de alguna de sus palabras, o del nombre sin espacios? */
function empiezaEstaca(estaca: string, palabra: string): boolean {
  const e = stripAccents(estaca);
  return e.split(' ').some((w) => w.startsWith(palabra)) || e.replace(/\s+/g, '').startsWith(palabra);
}

/**
 * Estacas que sugiere lo que se está escribiendo: alguna palabra de al menos 3 letras
 * que sea el comienzo de la estaca ("pro" → Pro Lima, "ola" → ninguna, "oli" → El Olivar y Los Olivos).
 */
export function estacasSugeridas(query: string, estacas: string[], max = 4): string[] {
  const palabras = claves(query).filter((w) => w.length >= 3);
  if (!palabras.length) return [];
  return estacas.filter((e) => palabras.some((w) => empiezaEstaca(e, w))).slice(0, max);
}

/** Lo que queda de lo escrito cuando una estaca ya se eligió: se quitan las palabras que hablaban de ella. */
export function quitarPalabrasDeEstaca(query: string, estaca: string): string {
  return claves(query).filter((w) => w.length < 3 || !empiezaEstaca(estaca, w)).join(' ');
}
