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

/** Promedio de asistencia SOLO sobre capacitaciones que ya tienen algún registro — una capacitación sin marcar todavía no debe bajar el promedio a 0%. */
export function promedioAsistencia(porCap: AsistenciaPorCapacitacion[]): number {
  const conRegistros = porCap.filter((c) => c.registros > 0);
  if (!conRegistros.length) return 0;
  return Math.round(conRegistros.reduce((s, c) => s + c.pct, 0) / conRegistros.length);
}
