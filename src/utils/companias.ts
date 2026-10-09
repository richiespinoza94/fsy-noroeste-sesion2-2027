import { FAMILY_COLORS } from '../data/colors';
import type { Familia, Participante } from '../types';

/**
 * Número y color de cada compañía, indexados por id — se arma UNA vez cuando
 * cambian las familias, para que cada fila de Asistencia resuelva su "(2)" con
 * una consulta directa (sin recorrer la lista) y sin ninguna lectura nueva.
 */
export interface InfoCompania {
  id: string;
  numero: number;
  nombre: string; // "Compañía 2" o el nombre personalizado
  hex: string;
}

export function infoCompanias(familias: Familia[]): Map<string, InfoCompania> {
  const m = new Map<string, InfoCompania>();
  familias.forEach((f, i) => {
    const n = parseInt(/(\d+)\s*$/.exec(f.nombre)?.[1] ?? '', 10);
    const numero = isNaN(n) ? i + 1 : n;
    m.set(f.id, {
      id: f.id,
      numero,
      nombre: f.customName || f.nombre,
      hex: FAMILY_COLORS.find((c) => c.id === f.colorId)?.hex ?? '#94A3B8',
    });
  });
  return m;
}

/** '' = todas · 'sin' = sin compañía (o con una ya eliminada) · cualquier otro valor = id de una compañía. */
export type FiltroCompania = string;

export function filtrarPorCompania(participantes: Participante[], filtro: FiltroCompania, companias: Map<string, InfoCompania>): Participante[] {
  if (!filtro) return participantes;
  if (filtro === 'sin') return participantes.filter((p) => !companias.has(p.familiaId));
  return participantes.filter((p) => p.familiaId === filtro);
}

/** Avance de un grupo: cuántos de `grupo` figuran presentes según el mapa de asistencia de un evento. */
export function resumenGrupo(grupo: Participante[], asistencia: Record<string, { estado: string }>): { presentes: number; total: number; pct: number } {
  let presentes = 0;
  for (const p of grupo) if (asistencia[p.id]?.estado === 'presente') presentes++;
  const total = grupo.length;
  return { presentes, total, pct: total ? Math.round((presentes / total) * 100) : 0 };
}
