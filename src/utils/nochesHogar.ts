import type { EstadoAsistencia, NocheHogar } from '../types';

/** Primero lo que viene (hoy y adelante, de la más cercana a la más lejana); después lo pasado, de la más reciente a la más vieja. */
export function ordenarParaVista(noches: NocheHogar[], hoy: string): NocheHogar[] {
  const proximas = noches.filter((n) => n.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  const pasadas = noches.filter((n) => n.fecha < hoy).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  return [...proximas, ...pasadas];
}

export interface ResumenNoche {
  presentes: number;
  justificados: number;
  porMarcar: number; // sin marca o "ausente": aún no llegó
  total: number;
  pct: number; // presentes ÷ integrantes actuales, redondeado
}

/** Cuenta SOLO a los integrantes actuales de la compañía: quien ya salió no suma ni resta. */
export function resumenNoche(asistencia: Record<string, EstadoAsistencia>, miembros: { id: string }[]): ResumenNoche {
  let presentes = 0;
  let justificados = 0;
  for (const m of miembros) {
    const e = asistencia[m.id];
    if (e === 'presente') presentes++;
    else if (e === 'justificado') justificados++;
  }
  const total = miembros.length;
  return { presentes, justificados, porMarcar: total - presentes - justificados, total, pct: total ? Math.round((presentes / total) * 100) : 0 };
}

/** Suma días a un "yyyy-MM-dd" sin pasar por la zona horaria. */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
