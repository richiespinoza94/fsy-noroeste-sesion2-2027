import { stripAccents } from './validation';

/** Búsqueda difusa simple: substring en cualquier parte, o inicio de alguna palabra. */
export function fuzzyIncludes(haystack: string, query: string): boolean {
  const q = stripAccents(query.trim());
  if (!q) return true;
  const h = stripAccents(haystack);
  return h.includes(q) || h.split(' ').some((w) => w.startsWith(q));
}
