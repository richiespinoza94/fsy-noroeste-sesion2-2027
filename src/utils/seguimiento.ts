import { estadoVentanaCheckIn } from '../services/capacitacionesService';
import type { Asistencia, Capacitacion, Participante } from '../types';

/**
 * Seguimiento / retención: a quién conviene escribirle por lo que pasó en los
 * eventos más recientes. Cada persona cae en UN solo grupo (el primero que
 * cumpla, en este orden de prioridad), para no repetirla en varias listas:
 *
 *  1. primera_vez_falto      — vino una sola vez y faltó al evento siguiente.
 *  2. solo_una_vez           — vino una sola vez y no volvió en 2+ eventos seguidos.
 *  3. dos_faltas             — faltó a los dos últimos eventos.
 *  4. siempre_asiste_falto   — venía muy seguido y faltó al último.
 *
 * Reglas comunes:
 *  - Solo cuentan eventos TERMINADOS (misma regla de cierre que el check-in:
 *    hora final, o 3h desde el inicio). Uno en curso o programado no cuenta,
 *    así nadie aparece como "faltó" mientras todavía están llegando.
 *  - Un evento solo cuenta para quien ya estaba registrado cuando ocurrió
 *    (o ya tiene `presente` en él) — nadie "falta" a algo anterior a su registro.
 *  - "Faltó" = marcado ausente O sin marca. Una falta justificada NO dispara
 *    seguimiento: ya se sabe qué pasó.
 *  - Quien nunca vino (0 asistencias) solo aparece si encaja en "dos faltas".
 */
export type CategoriaSeguimiento = 'siempre_asiste_falto' | 'primera_vez_falto' | 'dos_faltas' | 'solo_una_vez';

/** Orden en que se muestran los grupos: del más urgente (aún se puede retener) al menos. */
export const CATEGORIAS_SEGUIMIENTO: { id: CategoriaSeguimiento; titulo: string; icon: string; regla: string; color: string }[] = [
  { id: 'primera_vez_falto', titulo: 'Vino por primera vez y faltó al siguiente', icon: '🌱', color: '#9C27B0', regla: 'Asistió a un solo evento y no fue al que vino después. Es el momento de retenerlo.' },
  { id: 'dos_faltas', titulo: 'Faltó dos veces seguidas', icon: '⚠️', color: '#C62828', regla: 'Faltó a los dos eventos más recientes. Que sienta que es importante.' },
  { id: 'siempre_asiste_falto', titulo: 'Siempre asiste, pero faltó al último', icon: '⭐', color: '#E8863A', regla: 'Venía con 75% o más de asistencia y faltó al último evento. Conviene saber qué pasó.' },
  { id: 'solo_una_vez', titulo: 'Vino una vez y no volvió', icon: '👋', color: '#0E2954', regla: 'Asistió a un solo evento y faltó a los 2 o más siguientes.' },
];

/** % mínimo de asistencia previa para considerar que "siempre asiste". */
export const UMBRAL_SIEMPRE_ASISTE = 0.75;
/** Eventos previos mínimos para poder decir "siempre" (con menos historia no hay patrón). */
export const MIN_EVENTOS_PREVIOS = 2;

export interface ItemSeguimiento {
  participante: Participante;
  categoria: CategoriaSeguimiento;
  asistencias: number;
  elegibles: number;
  detalle: string;
}

type Marca = 'P' | 'J' | 'F';

function fechaCorta(c: Capacitacion): string {
  const [, m, d] = c.fecha.split('-');
  return `${d}/${m}`;
}
function ref(c: Capacitacion): string {
  return `${c.label} (${fechaCorta(c)})`;
}

export function calcularSeguimiento(
  participantes: Participante[],
  caps: Capacitacion[],
  asistencia: Asistencia[],
  ahora: Date = new Date()
): ItemSeguimiento[] {
  const terminados = caps
    .filter((c) => estadoVentanaCheckIn(c, ahora) === 'cerrada')
    .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
  if (terminados.length === 0) return [];

  const estadoPorPersona = new Map<string, Map<string, string>>();
  for (const a of asistencia) {
    let m = estadoPorPersona.get(a.participanteId);
    if (!m) estadoPorPersona.set(a.participanteId, (m = new Map()));
    m.set(a.capacitacionId, a.estado);
  }

  const items: ItemSeguimiento[] = [];
  for (const p of participantes) {
    const estados = estadoPorPersona.get(p.id) ?? new Map<string, string>();
    const regMs = new Date(p.timestamp).getTime();
    const elegibles = terminados.filter((c) => {
      if (estados.get(c.id) === 'presente') return true; // la evidencia real le gana a la fecha de registro
      const capMs = new Date(`${c.fecha}T${c.hora || '00:00'}`).getTime();
      return !isNaN(regMs) && !isNaN(capMs) && capMs >= regMs;
    });
    const n = elegibles.length;
    if (n === 0) continue;

    const marcas: Marca[] = elegibles.map((c) => {
      const e = estados.get(c.id);
      return e === 'presente' ? 'P' : e === 'justificado' ? 'J' : 'F';
    });
    if (marcas[n - 1] !== 'F') continue; // todo grupo parte de "faltó al último"

    const asistencias = marcas.filter((m) => m === 'P').length;
    const ultimo = elegibles[n - 1];
    let categoria: CategoriaSeguimiento | null = null;
    let detalle = '';

    if (asistencias === 1) {
      const idx = marcas.indexOf('P');
      const despues = n - 1 - idx;
      if (despues === 1) {
        categoria = 'primera_vez_falto';
        detalle = `Vino a ${ref(elegibles[idx])} y faltó a ${ref(ultimo)}`;
      } else if (despues >= 2) {
        categoria = 'solo_una_vez';
        detalle = `Solo vino a ${ref(elegibles[idx])} · no fue a los ${despues} siguientes`;
      }
    }
    if (!categoria && n >= 2 && marcas[n - 2] === 'F') {
      categoria = 'dos_faltas';
      detalle = `Faltó a ${ref(elegibles[n - 2])} y a ${ref(ultimo)} · asistió ${asistencias} de ${n}`;
    }
    if (!categoria) {
      const previos = n - 1;
      const asistioPrevios = marcas.slice(0, n - 1).filter((m) => m === 'P').length;
      if (previos >= MIN_EVENTOS_PREVIOS && asistioPrevios / previos >= UMBRAL_SIEMPRE_ASISTE) {
        categoria = 'siempre_asiste_falto';
        detalle = `Asistió a ${asistioPrevios} de ${previos} antes · faltó a ${ref(ultimo)}`;
      }
    }
    if (categoria) items.push({ participante: p, categoria, asistencias, elegibles: n, detalle });
  }

  // Dentro de cada grupo: primero quien más venía (la caída más notable), luego por nombre.
  return items.sort(
    (a, b) =>
      b.asistencias - a.asistencias ||
      `${a.participante.nombres} ${a.participante.apellidos}`.localeCompare(`${b.participante.nombres} ${b.participante.apellidos}`)
  );
}
