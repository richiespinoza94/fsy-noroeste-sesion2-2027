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

/** Nombre para mostrar: el alias si lo tiene; si no, "Familia 2" (nombre guardado) se ve como "Compañía 2". */
export function nombreCompania(f: Pick<Familia, 'customName' | 'nombre'>): string {
  return f.customName || f.nombre.replace(/^Familia\b/i, 'Compañía');
}

export function infoCompanias(familias: Familia[]): Map<string, InfoCompania> {
  const m = new Map<string, InfoCompania>();
  familias.forEach((f, i) => {
    const n = parseInt(/(\d+)\s*$/.exec(f.nombre)?.[1] ?? '', 10);
    const numero = isNaN(n) ? i + 1 : n;
    m.set(f.id, {
      id: f.id,
      numero,
      nombre: nombreCompania(f),
      hex: FAMILY_COLORS.find((c) => c.id === f.colorId)?.hex ?? '#94A3B8',
    });
  });
  return m;
}

/**
 * '' = todas · 'sin' = sin compañía y con rol de Consejero o Logístico (a quienes se les asigna una) ·
 * 'otros' = sin compañía y con cualquier otro rol (coordinadores, audiovisuales…) · cualquier otro valor = id de una compañía.
 * "Sin compañía" incluye a quien apunta a una compañía ya eliminada.
 */
export type FiltroCompania = string;

/** Los roles que se reparten en compañías; el resto del equipo no pertenece a una. */
export function esDeReparto(p: Pick<Participante, 'asignacion'>): boolean {
  return p.asignacion === 'Consejero' || p.asignacion === 'Logístico';
}

export function filtrarPorCompania(participantes: Participante[], filtro: FiltroCompania, companias: Map<string, InfoCompania>): Participante[] {
  if (!filtro) return participantes;
  if (filtro === 'sin') return participantes.filter((p) => !companias.has(p.familiaId) && esDeReparto(p));
  if (filtro === 'otros') return participantes.filter((p) => !companias.has(p.familiaId) && !esDeReparto(p));
  return participantes.filter((p) => p.familiaId === filtro);
}

/** Cuántos hay en "Sin compañía" y en "Otros roles" (para mostrar u ocultar cada chip). */
export function contarSinCompania(participantes: Participante[], companias: Map<string, InfoCompania>): { sin: number; otros: number } {
  let sin = 0;
  let otros = 0;
  for (const p of participantes) {
    if (companias.has(p.familiaId)) continue;
    if (esDeReparto(p)) sin++;
    else otros++;
  }
  return { sin, otros };
}

/** '' = todos · 'por_marcar' = aún sin llegar (sin marca o con "ausente") · 'presentes'. Quien está justificado no es ni lo uno ni lo otro. */
export type FiltroEstado = '' | 'por_marcar' | 'presentes';

export function filtrarPorEstado<T extends { id: string }>(grupo: T[], asistencia: Record<string, { estado: string }>, filtro: FiltroEstado): T[] {
  if (!filtro) return grupo;
  return grupo.filter((p) => {
    const e = asistencia[p.id]?.estado;
    return filtro === 'presentes' ? e === 'presente' : e !== 'presente' && e !== 'justificado';
  });
}

export function contarEstados(grupo: { id: string }[], asistencia: Record<string, { estado: string }>): { presentes: number; porMarcar: number } {
  let presentes = 0;
  let justificados = 0;
  for (const p of grupo) {
    const e = asistencia[p.id]?.estado;
    if (e === 'presente') presentes++;
    else if (e === 'justificado') justificados++;
  }
  return { presentes, porMarcar: grupo.length - presentes - justificados };
}

/** Avance de un grupo: cuántos de `grupo` figuran presentes según el mapa de asistencia de un evento. */
export function resumenGrupo(grupo: Participante[], asistencia: Record<string, { estado: string }>): { presentes: number; total: number; pct: number } {
  let presentes = 0;
  for (const p of grupo) if (asistencia[p.id]?.estado === 'presente') presentes++;
  const total = grupo.length;
  return { presentes, total, pct: total ? Math.round((presentes / total) * 100) : 0 };
}
