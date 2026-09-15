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
 * EXCEPCIÓN real encontrada: alguien que se registra DURANTE una
 * capacitación en curso (vía el auto-marcado del registro) queda con un
 * `timestamp` unos minutos DESPUÉS de la hora de inicio de esa misma
 * capacitación — con la regla de arriba a secas, esa capacitación (a la
 * que sí fue, literalmente en ese momento) quedaba excluida de su propio
 * conteo de elegibles, y su asistencia real desaparecía del cálculo. Por
 * eso: si hay un registro de asistencia `presente` Y el registro de la
 * persona cayó dentro de las 3 horas siguientes al inicio de esa
 * capacitación (la misma ventana de check-in que usa el resto de la app),
 * esa capacitación cuenta como elegible igual. Acotado a propósito a esas
 * 3 horas — sin el límite, una asistencia mal marcada en una capacitación
 * de hace semanas también "colaría" como elegible, lo cual no tiene
 * sentido (ver prueba #58 en tests/qa.test.ts).
 *
 * Se comparan como Date (no como string) porque `participante.timestamp`
 * es ISO en UTC (`new Date().toISOString()`) y `cap.fecha+hora` es local
 * sin sufijo de zona horaria — compararlos como texto directamente daría
 * resultados incorrectos.
 */
const TOLERANCIA_REGISTRO_DURANTE_MS = 3 * 60 * 60 * 1000; // misma ventana de 3h que estadoVentanaCheckIn

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
    if (capMs >= regMs) return true; // caso normal: la capacitación es posterior al registro
    // Caso especial: se registró DURANTE esta capacitación (dentro de sus
    // primeras 3h) y sí fue — no "cualquier capacitación pasada con una
    // asistencia marcada", solo la que coincide en el tiempo.
    return asistioIds.has(c.id) && regMs - capMs <= TOLERANCIA_REGISTRO_DURANTE_MS;
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
