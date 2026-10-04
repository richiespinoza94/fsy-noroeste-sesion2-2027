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

/**
 * El estado ACTUAL de una compañía — de dónde viene no importa (reparto
 * automático anterior, asignación manual, o ambos mezclados): lo único que
 * le importa al algoritmo es cuánta gente/sexo/estaca tiene AHORA MISMO.
 * Se recalcula siempre desde los datos reales (familia.consejeros →
 * participantes), nunca se guarda — así cada corrida del reparto ve el
 * estado verdadero del momento, venga de donde venga.
 */
export interface EstadoFamilia {
  id: string;
  total: number;
  hombres: number;
  mujeres: number;
  porEstaca: Record<GrupoEstacaReparto, number>;
}

export function calcularEstadoFamilia(familiaId: string, miembrosActuales: Participante[]): EstadoFamilia {
  const porEstaca: Record<GrupoEstacaReparto, number> = { Ventanilla: 0, 'Puente Piedra': 0, 'Pro Lima': 0, Otros: 0 };
  miembrosActuales.forEach((p) => {
    porEstaca[grupoEstacaReparto(p.estaca)] += 1;
  });
  return {
    id: familiaId,
    total: miembrosActuales.length,
    hombres: miembrosActuales.filter((p) => p.genero === 'H').length,
    mujeres: miembrosActuales.filter((p) => p.genero === 'M').length,
    porEstaca,
  };
}

function conteoDeSexo(e: EstadoFamilia, genero: 'H' | 'M'): number {
  return genero === 'H' ? e.hombres : e.mujeres;
}

/**
 * El algoritmo: a diferencia de un reparto "desde cero" (serpentina ciega,
 * como funcionaba antes), este SÍ mira el estado actual de cada compañía
 * para decidir — imprescindible porque el reparto se corre varias veces a
 * lo largo de las semanas según va llegando gente, y cada corrida nueva
 * tiene que seguir pareja con lo que YA existe (de corridas anteriores o
 * de asignaciones a mano), no ignorarlo.
 *
 * Los candidatos se ordenan primero por (sexo → grupo de estaca → edad) —
 * el mismo orden de prioridad de siempre — y se reparten uno por uno: cada
 * persona va a la compañía que, en ESE momento, más la necesita, en este
 * orden exacto:
 * 1) la que tenga MENOS personas de su mismo sexo
 * 2) empate → la que tenga MENOS personas de su misma estaca
 * 3) empate → la más chica en total
 * El estado se actualiza en memoria a medida que se asigna cada persona,
 * así la decisión de la persona #2 ya ve el efecto de haber ubicado a la
 * persona #1.
 *
 * La edad no entra en la fórmula de desempate (no tiene un "conteo" simple
 * como sexo/estaca) — se maneja ordenando a los candidatos por edad ANTES
 * de repartir, dentro de cada grupo sexo+estaca, para que se entrelacen.
 *
 * Nota honesta sobre la MODA de edad: con grupos chicos y edades reales,
 * forzar que la moda quede idéntica en las 4 compañías no es una meta
 * alcanzable de forma confiable (es una estadística frágil en muestras
 * pequeñas). Este algoritmo prioriza sexo y estaca parejos — la moda se
 * reporta junto a las demás para que el admin la revise, no se fuerza.
 */
export function repartirConBalance(
  candidatos: CandidatoReparto[],
  estadosIniciales: EstadoFamilia[]
): { porFamilia: Record<string, CandidatoReparto[]>; estadosFinales: EstadoFamilia[] } {
  const estados = estadosIniciales.map((e) => ({ ...e, porEstaca: { ...e.porEstaca } }));
  const porFamilia: Record<string, CandidatoReparto[]> = {};
  estados.forEach((e) => (porFamilia[e.id] = []));
  if (!estados.length) return { porFamilia, estadosFinales: estados };

  const ordenados = [...candidatos].sort((a, b) => {
    if (a.participante.genero !== b.participante.genero) return a.participante.genero.localeCompare(b.participante.genero);
    const ea = grupoEstacaReparto(a.participante.estaca);
    const eb = grupoEstacaReparto(b.participante.estaca);
    if (ea !== eb) return ea.localeCompare(eb);
    return a.edad - b.edad;
  });

  for (const c of ordenados) {
    const genero = c.participante.genero;
    const grupo = grupoEstacaReparto(c.participante.estaca);
    let mejor = estados[0];
    for (const e of estados) {
      const gana =
        conteoDeSexo(e, genero) < conteoDeSexo(mejor, genero) ||
        (conteoDeSexo(e, genero) === conteoDeSexo(mejor, genero) &&
          (e.porEstaca[grupo] < mejor.porEstaca[grupo] ||
            (e.porEstaca[grupo] === mejor.porEstaca[grupo] && e.total < mejor.total)));
      if (gana) mejor = e;
    }
    porFamilia[mejor.id].push(c);
    mejor.total += 1;
    if (genero === 'H') mejor.hombres += 1;
    else mejor.mujeres += 1;
    mejor.porEstaca[grupo] += 1;
  }

  return { porFamilia, estadosFinales: estados };
}

/**
 * La orquestación completa: Consejeros primero (su propia pasada), y los
 * Logísticos después como relleno — usando los `estadosFinales` que dejó
 * la pasada de Consejeros (no los iniciales), para que los Logísticos
 * también sepan dónde quedaron los Consejeros recién ubicados en esta
 * misma corrida, no solo lo que había antes de empezar.
 */
export function repartoCompleto(
  consejeros: CandidatoReparto[],
  logisticos: CandidatoReparto[],
  estadosIniciales: EstadoFamilia[]
): Record<string, CandidatoReparto[]> {
  const combinado: Record<string, CandidatoReparto[]> = {};
  estadosIniciales.forEach((e) => (combinado[e.id] = []));
  if (!estadosIniciales.length) return combinado;

  const pasoConsejeros = repartirConBalance(consejeros, estadosIniciales);
  const pasoLogisticos = repartirConBalance(logisticos, pasoConsejeros.estadosFinales);
  estadosIniciales.forEach((e) => {
    combinado[e.id] = [...pasoConsejeros.porFamilia[e.id], ...(pasoLogisticos.porFamilia[e.id] || [])];
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
