import type { Asistencia, Capacitacion, Participante } from '../types';

export interface Compromiso {
  participanteId: string;
  elegibles: number; // capacitaciones YA OCURRIDAS desde que se registró (inclusive)
  totalCapacitaciones: number; // TODAS las creadas, incluidas las futuras — responde "de cuántas planeadas", no "de cuántas ya pasaron"
  asistencias: number; // "presente" de las elegibles
  inasistencias: number; // elegibles - asistencias (ausente, justificado o sin marca)
  tasaAsistencia: number | null; // asistencias/elegibles (0-1), null si no tuvo ninguna elegible todavía
  cobertura: number; // elegibles/total (0-1) — antigüedad en el programa, NO es una medida de compromiso por sí sola
  rachaPerfecta: boolean; // asistió a TODAS sus elegibles, sin faltar ninguna
}

/**
 * "Elegible" = cualquier capacitación cuya fecha/hora es igual o posterior
 * al momento en que la persona se registró Y que YA OCURRIÓ (no es en el
 * futuro) — las que sí pudo haber ido, ni una más. Sin el límite superior,
 * crear capacitaciones futuras (todavía no ocurridas) inflaba el
 * denominador y hacía bajar la tasa de asistencia de todos — ej. alguien
 * que fue a su única capacitación real (1/1 = 100%) aparecía como 1/2 (50%)
 * solo porque ya existía una segunda capacitación programada para la
 * semana siguiente.
 *
 * EXCEPCIÓN: si hay un registro de asistencia `presente` real para una
 * capacitación, esa capacitación SIEMPRE cuenta como elegible para esa
 * persona, sin importar cuándo se marcó ni qué tan lejos esté de su fecha
 * de registro. La evidencia real de que sí asistió le gana a la regla de
 * fechas — si un admin la marcó (aunque sea fuera de la ventana normal, a
 * mano, desde Asistencia), el cálculo de compromiso confía en eso. (Una
 * versión anterior de esta función limitaba la excepción a "dentro de 3h
 * del inicio", pensando que protegía contra datos anómalos — pero eso
 * excluía casos reales, como asistencias marcadas fuera de tiempo desde la
 * pestaña Asistencia. Si algún día se marca a la persona equivocada por
 * error, la corrección es desmarcarla ahí — no que este cálculo la ignore
 * en silencio.)
 *
 * Se comparan como Date (no como string) porque `participante.timestamp`
 * es ISO en UTC (`new Date().toISOString()`) y `cap.fecha+hora` es local
 * sin sufijo de zona horaria — compararlos como texto directamente daría
 * resultados incorrectos.
 */
export function calcularCompromiso(
  participante: Participante,
  capsOrdenadas: Capacitacion[],
  asistencia: Asistencia[],
  ahora: Date = new Date()
): Compromiso {
  const regMs = new Date(participante.timestamp).getTime();
  const nowMs = ahora.getTime();
  const asistioIds = new Set(
    asistencia.filter((a) => a.participanteId === participante.id && a.estado === 'presente').map((a) => a.capacitacionId)
  );
  const elegibles = capsOrdenadas.filter((c) => {
    const capMs = new Date(`${c.fecha}T${c.hora || '00:00'}`).getTime();
    if (isNaN(capMs) || isNaN(regMs)) return false;
    if (capMs > nowMs) return false; // nunca una capacitación que todavía no ocurre
    return capMs >= regMs || asistioIds.has(c.id); // posterior al registro, o evidencia real de que sí fue
  });
  const elegibleIds = new Set(elegibles.map((c) => c.id));
  const asistencias = asistencia.filter(
    (a) => a.participanteId === participante.id && elegibleIds.has(a.capacitacionId) && a.estado === 'presente'
  ).length;

  return {
    participanteId: participante.id,
    elegibles: elegibles.length,
    totalCapacitaciones: capsOrdenadas.length,
    asistencias,
    inasistencias: elegibles.length - asistencias,
    tasaAsistencia: elegibles.length > 0 ? asistencias / elegibles.length : null,
    cobertura: capsOrdenadas.length > 0 ? elegibles.length / capsOrdenadas.length : 0,
    rachaPerfecta: elegibles.length > 0 && asistencias === elegibles.length,
  };
}
