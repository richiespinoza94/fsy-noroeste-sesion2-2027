import { ESTACAS_PRINCIPALES } from '../data/estacas';
import type { Asistencia, Participante } from '../types';

/**
 * Reparto automático de Compañías (familias) — usado en Gestión → Reparto.
 *
 * Se hace en 2 PASADAS, a propósito, no en una sola mezclada:
 * 1) Se reparten los CONSEJEROS primero, priorizando en este orden exacto:
 *    sexo parejo → estaca no concentrada (Ventanilla/Puente Piedra/Pro Lima,
 *    "Otros" como comodín) → edad distribuida.
 * 2) Los LOGÍSTICOS se reparten después, como relleno/comodín, sobre las
 *    mismas 4 compañías — no reinician el conteo, siguen repartiéndose
 *    desde donde quedó el paso 1, para que el TOTAL final de cada compañía
 *    también quede parejo.
 */

function esConsejero(p: Participante): boolean {
  return p.asignacion === 'Consejero';
}
function esLogistico(p: Participante): boolean {
  return p.asignacion === 'Logístico';
}
/** Conveniencia para un conteo rápido en la UI ("cuántos elegibles hay en total") — la distribución real usa los 2 roles por separado, no esto. */
export function esElegibleReparto(p: Participante): boolean {
  return esConsejero(p) || esLogistico(p);
}

export type GrupoEstacaReparto = 'Ventanilla' | 'Puente Piedra' | 'Pro Lima' | 'Otros';

export function grupoEstacaReparto(estaca: string): GrupoEstacaReparto {
  return (ESTACAS_PRINCIPALES as string[]).includes(estaca) ? (estaca as GrupoEstacaReparto) : 'Otros';
}

/** Edad en años cumplidos a una fecha de referencia (la fecha de la capacitación usada como fuente, o "hoy" en el modo "todos los registrados" — así el resultado no cambia si se revisa después). */
export function calcularEdad(fechaNacimiento: string, referencia: Date): number {
  const nacimiento = new Date(fechaNacimiento);
  if (isNaN(nacimiento.getTime())) return 0;
  let edad = referencia.getFullYear() - nacimiento.getFullYear();
  const antesDeCumplir =
    referencia.getMonth() < nacimiento.getMonth() ||
    (referencia.getMonth() === nacimiento.getMonth() && referencia.getDate() < nacimiento.getDate());
  if (antesDeCumplir) edad -= 1;
  return Math.max(edad, 0);
}

export interface CandidatoReparto {
  participante: Participante;
  edad: number;
}

/**
 * De dónde sale la lista de "quién entra al reparto":
 * - `capacitacion`: solo quienes marcaron presente en esa capacitación (ej. la 1ra convocatoria/capacitación).
 * - `todos`: todos los registrados con ese rol, sin filtrar por asistencia — para repartir a todo el roster de una vez, sin esperar a una capacitación específica.
 */
export type FuenteReparto = { modo: 'capacitacion'; capacitacionId: string } | { modo: 'todos' };

function pasaFuente(p: Participante, fuente: FuenteReparto, asistencia: Asistencia[]): boolean {
  if (fuente.modo === 'todos') return true;
  return asistencia.some((a) => a.capacitacionId === fuente.capacitacionId && a.participanteId === p.id && a.estado === 'presente');
}

/**
 * Candidatos de UN rol (Consejero o Logístico) — elegibles según la fuente
 * elegida, y que todavía NO tienen compañía asignada (lo asignado a mano
 * se respeta siempre, queda fuera del reparto).
 */
export function calcularCandidatosPorRol(
  participantes: Participante[],
  asistencia: Asistencia[],
  fuente: FuenteReparto,
  rol: 'Consejero' | 'Logístico',
  referenciaEdad: Date
): CandidatoReparto[] {
  const esDelRol = rol === 'Consejero' ? esConsejero : esLogistico;
  return participantes
    .filter((p) => esDelRol(p) && !p.familiaId && pasaFuente(p, fuente, asistencia))
    .map((p) => ({ participante: p, edad: calcularEdad(p.fechaNacimiento, referenciaEdad) }));
}

export interface CursorSnake {
  idx: number;
  direction: 1 | -1;
}

/**
 * El algoritmo base: ordena por (sexo → grupo de estaca → edad, en ESE
 * orden de prioridad) y reparte en "serpentina" (0,1,2,3,3,2,1,0,…) sin
 * reiniciar el contador entre grupos. El conteo total nunca queda
 * desbalanceado en más de 1 persona, y como la lista está agrupada por
 * sexo primero y estaca segundo antes de serpentear, cada compañía recibe
 * una porción proporcional de cada sexo (la prioridad más alta) y de cada
 * estaca. Ordenar por edad dentro de cada grupo antes de serpentear
 * entrelaza las edades (evita que una compañía se lleve "a todos los
 * mayores").
 *
 * Recibe un cursor opcional para poder ENCADENAR una segunda pasada (ver
 * repartoCompleto) sin reiniciar el conteo — así el total combinado
 * (Consejeros + Logísticos) también queda parejo, no solo cada pasada por
 * separado.
 *
 * Nota honesta sobre la MODA de edad: con grupos chicos y edades reales,
 * forzar que la moda quede idéntica en las 4 compañías no es una meta
 * alcanzable de forma confiable (es una estadística frágil en muestras
 * pequeñas). Este algoritmo optimiza promedio/mediana parejos — la moda se
 * reporta junto a las demás para que el admin la revise, no se fuerza.
 */
export function repartirEnFamilias(
  candidatos: CandidatoReparto[],
  familiaIds: string[],
  cursorInicial: CursorSnake = { idx: 0, direction: 1 }
): { porFamilia: Record<string, CandidatoReparto[]>; cursorFinal: CursorSnake } {
  const resultado: Record<string, CandidatoReparto[]> = {};
  familiaIds.forEach((id) => (resultado[id] = []));
  if (!familiaIds.length) return { porFamilia: resultado, cursorFinal: cursorInicial };

  const ordenados = [...candidatos].sort((a, b) => {
    if (a.participante.genero !== b.participante.genero) return a.participante.genero.localeCompare(b.participante.genero);
    const ea = grupoEstacaReparto(a.participante.estaca);
    const eb = grupoEstacaReparto(b.participante.estaca);
    if (ea !== eb) return ea.localeCompare(eb);
    return a.edad - b.edad;
  });

  let { idx, direction } = cursorInicial;
  for (const c of ordenados) {
    resultado[familiaIds[idx]].push(c);
    idx += direction;
    if (idx === familiaIds.length) {
      idx = familiaIds.length - 1;
      direction = -1;
    } else if (idx === -1) {
      idx = 0;
      direction = 1;
    }
  }
  return { porFamilia: resultado, cursorFinal: { idx, direction } };
}

/**
 * La orquestación completa: Consejeros primero (su propia pasada,
 * prioridad sexo→estaca→edad), Logísticos después como relleno,
 * CONTINUANDO el mismo cursor de la serpentina — así quedan distribuidos
 * en las 4 compañías y, de paso, el total combinado por compañía también
 * queda parejo.
 */
export function repartoCompleto(
  consejeros: CandidatoReparto[],
  logisticos: CandidatoReparto[],
  familiaIds: string[]
): Record<string, CandidatoReparto[]> {
  const combinado: Record<string, CandidatoReparto[]> = {};
  familiaIds.forEach((id) => (combinado[id] = []));
  if (!familiaIds.length) return combinado;

  const paso1 = repartirEnFamilias(consejeros, familiaIds);
  const paso2 = repartirEnFamilias(logisticos, familiaIds, paso1.cursorFinal);
  familiaIds.forEach((id) => {
    combinado[id] = [...paso1.porFamilia[id], ...paso2.porFamilia[id]];
  });
  return combinado;
}

export interface EstadisticasFamilia {
  total: number;
  hombres: number;
  mujeres: number;
  edadPromedio: number;
  edadMediana: number;
  edadModa: number | null; // null si no hay una moda clara (todas las edades aparecen la misma cantidad de veces)
  porEstaca: Record<GrupoEstacaReparto, number>;
}

export function calcularEstadisticas(miembros: CandidatoReparto[]): EstadisticasFamilia {
  const edades = miembros.map((m) => m.edad).sort((a, b) => a - b);
  const n = edades.length;
  const edadPromedio = n ? Math.round((edades.reduce((s, e) => s + e, 0) / n) * 10) / 10 : 0;
  const edadMediana = n ? (n % 2 ? edades[(n - 1) / 2] : (edades[n / 2 - 1] + edades[n / 2]) / 2) : 0;

  const conteoEdad = new Map<number, number>();
  edades.forEach((e) => conteoEdad.set(e, (conteoEdad.get(e) || 0) + 1));
  const maxFrecuencia = Math.max(0, ...conteoEdad.values());
  const modas = [...conteoEdad.entries()].filter(([, c]) => c === maxFrecuencia).map(([e]) => e);
  const edadModa = maxFrecuencia > 1 && modas.length === 1 ? modas[0] : null;

  const porEstaca: Record<GrupoEstacaReparto, number> = { Ventanilla: 0, 'Puente Piedra': 0, 'Pro Lima': 0, Otros: 0 };
  miembros.forEach((m) => {
    porEstaca[grupoEstacaReparto(m.participante.estaca)] += 1;
  });

  return {
    total: n,
    hombres: miembros.filter((m) => m.participante.genero === 'H').length,
    mujeres: miembros.filter((m) => m.participante.genero === 'M').length,
    edadPromedio,
    edadMediana,
    edadModa,
    porEstaca,
  };
}
