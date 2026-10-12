import type { Asistencia, Capacitacion, Participante } from '../types';

export interface AsistenciaPorCapacitacion {
  cap: Capacitacion;
  presentes: number;
  ausentes: number;
  justificados: number;
  sinMarca: number;
  registros: number; // presentes + ausentes + justificados (cuántos tienen ALGUNA marca)
  pct: number; // presentes / segmento.length, redondeado
}

/**
 * Antes vivía inline dentro de ReportesScreen.tsx (`attByCap`) — se extrajo
 * acá para poder reusarla también en HomeScreen (tarjeta de "asistencia en
 * vivo / última capacitación") sin duplicar el cálculo en 2 componentes.
 */
export function calcularAsistenciaPorCapacitacion(
  segmento: Participante[],
  capsOrdenadas: Capacitacion[],
  asistencia: Asistencia[]
): AsistenciaPorCapacitacion[] {
  const segmentoIds = new Set(segmento.map((p) => p.id));
  return capsOrdenadas.map((c) => {
    const rows = asistencia.filter((a) => a.capacitacionId === c.id && segmentoIds.has(a.participanteId));
    const presentes = rows.filter((a) => a.estado === 'presente').length;
    const ausentes = rows.filter((a) => a.estado === 'ausente').length;
    const justificados = rows.filter((a) => a.estado === 'justificado').length;
    const pct = segmento.length ? Math.round((presentes / segmento.length) * 100) : 0;
    return { cap: c, presentes, ausentes, justificados, sinMarca: Math.max(segmento.length - rows.length, 0), pct, registros: rows.length };
  });
}

/**
 * Eventos que ya pasaron (fecha de hoy o anterior) o que ya tienen alguna
 * marca. Deja fuera los programados a futuro sin marcas: no aportan datos y
 * con muchos eventos creados por adelantado llenarían de ruido el detalle y
 * el gráfico. `hoy` es "yyyy-MM-dd" local.
 */
export function soloOcurridas(porCap: AsistenciaPorCapacitacion[], hoy: string): AsistenciaPorCapacitacion[] {
  return porCap.filter((d) => d.cap.fecha <= hoy || d.registros > 0);
}

/** Promedio de asistencia SOLO sobre capacitaciones que ya tienen algún registro — una capacitación sin marcar todavía no debe bajar el promedio a 0%. */
export function promedioAsistencia(porCap: AsistenciaPorCapacitacion[]): number {
  const conRegistros = porCap.filter((c) => c.registros > 0);
  if (!conRegistros.length) return 0;
  return Math.round(conRegistros.reduce((s, c) => s + c.pct, 0) / conRegistros.length);
}

/** Mediana de asistencia sobre los mismos eventos que `promedioAsistencia` (con registros). Se muestra junto al promedio: un evento muy flojo o muy lleno mueve el promedio, la mediana no. */
export function medianaAsistencia(porCap: AsistenciaPorCapacitacion[]): number {
  const pcts = porCap.filter((c) => c.registros > 0).map((c) => c.pct).sort((a, b) => a - b);
  if (!pcts.length) return 0;
  const m = pcts.length >> 1;
  return Math.round(pcts.length % 2 ? pcts[m] : (pcts[m - 1] + pcts[m]) / 2);
}

/**
 * Cambio en puntos de % de cada evento frente al anterior CON marcas (la lista viene en orden cronológico).
 * `null` si el evento no tiene marcas o si no hay un evento anterior con qué compararlo.
 */
export function variacionesPorEvento(cronologico: AsistenciaPorCapacitacion[]): (number | null)[] {
  let anterior: number | null = null;
  return cronologico.map((d) => {
    if (d.registros === 0) return null;
    const delta = anterior === null ? null : d.pct - anterior;
    anterior = d.pct;
    return delta;
  });
}
