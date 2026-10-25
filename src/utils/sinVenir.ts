import type { Asistencia, Capacitacion, Participante } from '../types';
import { participaRegular } from './repartoFamilias';
import { tipoDe } from './tiposEvento';

export const EVENTOS_REVISION = 3;

/**
 * Quiénes están marcados como "participa con regularidad" pero no vinieron
 * (ni justificaron) a NINGUNA de las últimas 3 capacitaciones. Es solo un aviso
 * para que el auxiliar decida: no cambia ninguna marca.
 *
 * Cuentan solo eventos de tipo Capacitación ya pasados (no Bailes, Noches de
 * Hogar ni otras actividades, ni el de hoy) en los que alguien llegó a marcar
 * presente: si todavía nadie pasó lista, no se usa para acusar a todos de faltar.
 * Quien se registró después de la más antigua de las 3 no se avisa (no pudo venir).
 * Con menos de 3 capacitaciones válidas no hay aviso. Dos pasadas sobre la
 * asistencia, sin consultas nuevas: los datos ya están en memoria.
 */
export function sinVenirRecientes(miembros: Participante[], capacitaciones: Capacitacion[], asistencia: Asistencia[], hoy: string): Set<string> {
  const pasadas = capacitaciones.filter((c) => tipoDe(c) === 'capacitacion' && c.fecha < hoy);
  if (pasadas.length < EVENTOS_REVISION) return new Set();

  const ids = new Set(pasadas.map((c) => c.id));
  const conLista = new Set<string>();
  for (const a of asistencia) if (a.estado === 'presente' && ids.has(a.capacitacionId)) conLista.add(a.capacitacionId);

  const ultimas = pasadas
    .filter((c) => conLista.has(c.id))
    .sort((a, b) => `${b.fecha}${b.hora}`.localeCompare(`${a.fecha}${a.hora}`))
    .slice(0, EVENTOS_REVISION);
  if (ultimas.length < EVENTOS_REVISION) return new Set();

  const enRevision = new Set(ultimas.map((c) => c.id));
  const vinieron = new Set<string>();
  for (const a of asistencia) if (enRevision.has(a.capacitacionId) && (a.estado === 'presente' || a.estado === 'justificado')) vinieron.add(a.participanteId);

  const masAntigua = ultimas[EVENTOS_REVISION - 1].fecha;
  return new Set(miembros.filter((p) => participaRegular(p) && !vinieron.has(p.id) && (p.timestamp || '').slice(0, 10) <= masAntigua).map((p) => p.id));
}
