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

// ── Sugerir compañerismos ───────────────────────────────────────────────────
// La propuesta busca la combinación de menor "costo": cada par del mismo sexo
// pesa mucho (así se arma hombre + mujer siempre que se puede y los sobrantes
// del mismo sexo quedan entre sí) y cada par de la misma estaca pesa poco (a
// igualdad de sexo, se prefiere juntar estacas distintas). Si la cantidad es
// impar sale un solo trío. El cálculo es exacto, no una aproximación.

const PESO_MISMO_SEXO = 100;
const PESO_MISMA_ESTACA = 1;
/** El cálculo exacto crece como 2^n: con más gente se propone por tandas (el resto queda para la siguiente). */
export const MAX_SUGERIR = 18;

export interface PropuestaParejas {
  grupos: Participante[][];
  /** Quienes quedan sin grupo: una persona sola, o el excedente de MAX_SUGERIR. */
  sobrantes: Participante[];
  semilla: number;
}

const estacaClave = (p: Participante) => p.estaca.trim().toLowerCase();
const porNombre = (a: Participante, b: Participante) =>
  `${a.nombres} ${a.apellidos}`.localeCompare(`${b.nombres} ${b.apellidos}`) || a.id.localeCompare(b.id);

function costoPar(a: Participante, b: Participante): number {
  const ea = estacaClave(a);
  return (a.genero === b.genero ? PESO_MISMO_SEXO : 0) + (ea && ea === estacaClave(b) ? PESO_MISMA_ESTACA : 0);
}

/** Generador pseudoaleatorio con semilla (mulberry32): misma semilla, mismo orden. */
function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un grupo "con estacas distintas" no repite estaca entre sus integrantes (sin estaca no cuenta como repetida). */
export function estacasDistintas(personas: Participante[]): boolean {
  const claves = personas.map(estacaClave).filter(Boolean);
  return new Set(claves).size === claves.length;
}

/**
 * Propone compañerismos para quienes aún no tienen compañero (`libres`).
 * `semilla` 0 es la primera propuesta (orden alfabético); con otra semilla se
 * desempata de otra forma y sale otra combinación igual de buena.
 */
export function sugerirParejas(libres: Participante[], semilla = 0): PropuestaParejas {
  const base = [...libres].sort(porNombre);
  if (semilla > 0) {
    const r = azar(semilla);
    for (let i = base.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [base[i], base[j]] = [base[j], base[i]];
    }
  }
  const ps = base.slice(0, MAX_SUGERIR);
  const n = ps.length;
  if (n < MIN_PAREJA) return { grupos: [], sobrantes: base, semilla };

  const c = ps.map((a) => ps.map((b) => costoPar(a, b)));
  const memo = new Float64Array(1 << n).fill(-1);
  const bajo = (mask: number) => 31 - Math.clz32(mask & -mask); // índice del primer bit encendido
  const mejor = (mask: number): number => {
    if (!mask) return 0;
    if (memo[mask] >= 0) return memo[mask];
    const i = bajo(mask);
    let m = Infinity;
    for (let j = i + 1; j < n; j++) {
      if (mask & (1 << j)) m = Math.min(m, c[i][j] + mejor(mask & ~(1 << i) & ~(1 << j)));
    }
    return (memo[mask] = m);
  };
  const parear = (mask: number): number[][] => {
    const out: number[][] = [];
    while (mask) {
      const i = bajo(mask);
      for (let j = i + 1; j < n; j++) {
        if (!(mask & (1 << j))) continue;
        const resto = mask & ~(1 << i) & ~(1 << j);
        if (c[i][j] + mejor(resto) === mejor(mask)) {
          out.push([i, j]);
          mask = resto;
          break;
        }
      }
    }
    return out;
  };

  const todo = (1 << n) - 1;
  let indices: number[][];
  if (n % 2 === 0) {
    indices = parear(todo);
  } else {
    // Cantidad impar: se elige el mejor trío y el resto se junta de a dos.
    let menor = Infinity;
    let trio: number[] = [];
    let resto = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++) {
          const r = todo & ~((1 << i) | (1 << j) | (1 << k));
          const total = c[i][j] + c[i][k] + c[j][k] + mejor(r);
          if (total < menor) {
            menor = total;
            trio = [i, j, k];
            resto = r;
          }
        }
    indices = [trio, ...parear(resto)];
  }

  const grupos = indices.map((g) => g.map((i) => ps[i]).sort(porNombre)).sort((a, b) => porNombre(a[0], b[0]));
  return { grupos, sobrantes: base.slice(MAX_SUGERIR), semilla };
}

/** Identifica una propuesta por sus grupos (sin importar el orden), para saber si dos son la misma. */
export function firmaPropuesta(p: Pick<PropuestaParejas, 'grupos'>): string {
  return p.grupos.map((g) => g.map((x) => x.id).sort().join('+')).sort().join('|');
}

/** La siguiente propuesta distinta a `actual`, o null si no hay otra combinación igual de buena. */
export function otraPropuesta(libres: Participante[], actual: PropuestaParejas, intentos = 40): PropuestaParejas | null {
  const firma = firmaPropuesta(actual);
  for (let s = actual.semilla + 1; s <= actual.semilla + intentos; s++) {
    const p = sugerirParejas(libres, s);
    if (firmaPropuesta(p) !== firma) return p;
  }
  return null;
}

/**
 * Valida y arma lo que se guarda al aplicar una propuesta completa. Falla si
 * alguien ya tiene compañero (la compañía cambió mientras se miraba la
 * vista previa): nunca se pisa el trabajo de otro auxiliar.
 */
export function planearLote(args: {
  familia: Pick<Familia, 'id' | 'consejeros'>;
  grupos: string[][];
  existentes: ParejaTrabajo[];
  nuevoId: () => string;
}): ParejaTrabajo[] {
  const { familia, grupos, existentes } = args;
  if (!grupos.length) throw new Error('No hay compañerismos que guardar.');
  // Ocupado = integra un grupo que HOY se ve (misma regla que vistaFamilia: con menos de 2 vigentes, el grupo no cuenta).
  const ocupados = new Set<string>();
  for (const o of existentes) {
    if (o.familiaId !== familia.id) continue;
    const vivos = o.miembros.filter((id) => familia.consejeros.includes(id));
    if (vivos.length >= MIN_PAREJA) vivos.forEach((id) => ocupados.add(id));
  }
  const vistos = new Set<string>();
  for (const g of grupos) {
    if (g.length < MIN_PAREJA || g.length > MAX_PAREJA) throw new Error('Cada compañerismo debe tener 2 o 3 personas.');
    for (const id of g) {
      if (!familia.consejeros.includes(id)) throw new Error('Solo pueden emparejarse integrantes de esta compañía.');
      if (ocupados.has(id)) throw new Error('Alguien ya tiene compañero. Genera la propuesta de nuevo.');
      if (vistos.has(id)) throw new Error('Una persona aparece repetida en la propuesta.');
      vistos.add(id);
    }
  }
  return grupos.map((miembros) => ({ id: args.nuevoId(), familiaId: familia.id, miembros: [...miembros] }));
}
