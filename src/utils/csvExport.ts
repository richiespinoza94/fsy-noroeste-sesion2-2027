import type { Asistencia, Capacitacion, Participante } from '../types';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const ESTADO_LABEL: Record<string, string> = {
  presente: 'Presente',
  ausente: 'Ausente',
  justificado: 'Justificado',
};

/**
 * Una fila por participante, una columna por capacitación (en orden
 * cronológico) con su estado de asistencia — para abrir en Excel/Sheets y
 * ver de un vistazo quién fue a qué.
 */
export function buildAsistenciaCsv(
  participantes: Participante[],
  capsOrdenadas: Capacitacion[],
  asistencia: Asistencia[]
): string {
  const porPersonaYCap = new Map<string, string>();
  for (const a of asistencia) porPersonaYCap.set(`${a.participanteId}::${a.capacitacionId}`, a.estado);

  const headers = ['Nombres', 'Apellidos', 'Estaca', 'Barrio', 'Teléfono', 'Correo', ...capsOrdenadas.map((c) => `${c.label} (${c.fecha})`)];
  const rows = participantes.map((p) => {
    const base = [p.nombres, p.apellidos, p.estaca, p.barrio, p.telefono, p.correo];
    const asistencias = capsOrdenadas.map((c) => {
      const estado = porPersonaYCap.get(`${p.id}::${c.id}`);
      return estado ? ESTADO_LABEL[estado] || estado : 'Sin marca';
    });
    return [...base, ...asistencias];
  });

  return [headers, ...rows].map((row) => row.map((v) => csvEscape(String(v))).join(',')).join('\r\n');
}

export function downloadCsv(csv: string, filename: string) {
  // BOM (\uFEFF) al inicio: sin esto, Excel en Windows a veces interpreta
  // mal los acentos/ñ del CSV como caracteres sueltos en vez de UTF-8.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Mismo motivo que en QrAsistenciaModal: Firefox y algunos navegadores
  // móviles ignoran .click() en un elemento que no está insertado en el DOM.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
