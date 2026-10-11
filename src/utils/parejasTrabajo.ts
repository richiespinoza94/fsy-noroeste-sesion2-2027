import type { Familia, ParejaTrabajo, Participante } from '../types';

/** Mínimo y máximo de personas por compañerismo de trabajo (dupla; trío si el número es impar). */
export const MIN_PAREJA = 2;
export const MAX_PAREJA = 3;

export interface GrupoVista {
  id: string;
  personas: Participante[];
}

export interface VistaFamilia {
  grupos: GrupoVista[];
  sinCompanero: Participante[];
}

/**
 * Lo que se ve en una familia. Solo cuenta gente que HOY integra la familia
 * (`miembros`): si alguien salió o se mudó de compañía, sale solo del
 * compañerismo sin tener que limpiar la base; si quedan menos de 2, el grupo
 * deja de mostrarse y la persona que queda aparece en "sin compañero".
 * Una persona solo aparece en un grupo (el primero que la reclama).
 */
export function vistaFamilia(fam: Pick<Familia, 'id'>, parejas: ParejaTrabajo[], miembros: Participante[]): VistaFamilia {
  const porId = new Map(miembros.map((p) => [p.id, p]));
  const usados = new Set<string>();
  const grupos: GrupoVista[] = [];
  for (const g of parejas) {
    if (g.familiaId !== fam.id) continue;
    const personas: Participante[] = [];
    for (const id of g.miembros) {
      const p = porId.get(id);
      if (p && !usados.has(id)) personas.push(p);
    }
    if (personas.length < MIN_PAREJA) continue;
    personas.forEach((p) => usados.add(p.id));
    grupos.push({ id: g.id, personas });
  }
  grupos.sort((a, b) => `${a.personas[0].nombres} ${a.personas[0].apellidos}`.localeCompare(`${b.personas[0].nombres} ${b.personas[0].apellidos}`));
  return { grupos, sinCompanero: miembros.filter((p) => !usados.has(p.id)) };
}

/** Números para el resumen de la lista de compañías. */
export function resumenCompaneros(fam: Pick<Familia, 'id'>, parejas: ParejaTrabajo[], miembros: Participante[]) {
  const v = vistaFamilia(fam, parejas, miembros);
  return { grupos: v.grupos.length, sinCompanero: v.sinCompanero.length };
}

/** Con quién trabaja una persona (vacío si no tiene compañero o ya no son de la misma familia). */
export function companerosDe(persona: Participante, parejas: ParejaTrabajo[], todos: Map<string, Participante>): Participante[] {
  if (!persona.familiaId) return [];
  const g = parejas.find((x) => x.familiaId === persona.familiaId && x.miembros.includes(persona.id));
  if (!g) return [];
  const otros: Participante[] = [];
  for (const id of g.miembros) {
    const p = todos.get(id);
    if (p && p.id !== persona.id && p.familiaId === persona.familiaId) otros.push(p);
  }
  return otros;
}

export interface PlanGuardado {
  guardar: ParejaTrabajo;
  actualizar: ParejaTrabajo[];
  borrar: string[];
}

/**
 * Qué escribir al armar o cambiar un compañerismo. Si alguien del nuevo grupo
 * ya estaba en otro (p. ej. dos auxiliares editando a la vez), se le saca de
 * ahí: ese grupo se achica, y si queda con menos de 2 se deshace. Así una
 * persona nunca queda en dos compañerismos.
 */
export function planearGuardado(args: {
  familiaId: string;
  id: string | null;
  miembros: string[];
  existentes: ParejaTrabajo[];
  nuevoId: string;
}): PlanGuardado {
  const miembros = [...new Set(args.miembros)];
  if (miembros.length < MIN_PAREJA) throw new Error('Elige al menos 2 personas.');
  if (miembros.length > MAX_PAREJA) throw new Error('Un compañerismo puede tener 3 personas como máximo.');
  const guardar: ParejaTrabajo = { id: args.id ?? args.nuevoId, familiaId: args.familiaId, miembros };
  const nuevos = new Set(miembros);
  const actualizar: ParejaTrabajo[] = [];
  const borrar: string[] = [];
  for (const o of args.existentes) {
    if (o.familiaId !== args.familiaId || o.id === guardar.id) continue;
    const resto = o.miembros.filter((id) => !nuevos.has(id));
    if (resto.length === o.miembros.length) continue;
    if (resto.length < MIN_PAREJA) borrar.push(o.id);
    else actualizar.push({ ...o, miembros: resto });
  }
  return { guardar, actualizar, borrar };
}
