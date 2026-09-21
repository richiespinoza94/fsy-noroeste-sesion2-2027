import { DISPONIBILIDAD_LABEL, EXPERIENCIA_PREVIA_LABEL, type Asistencia, type Capacitacion, type Participante } from '../types';
import { habilidadesParaMostrar } from './audiovisual';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const ESTADO_LABEL: Record<string, string> = {
  presente: 'Presente',
  ausente: 'Ausente',
  justificado: 'Justificado',
};

const GENERO_LABEL: Record<string, string> = { H: 'Hombre', M: 'Mujer' };

const EQUIPO_AV_LABEL: Record<string, string> = {
  si: 'Sí, tiene equipo',
  algo: 'Tiene algo',
  no: 'No tiene equipo',
  '': 'No contestado',
};

/**
 * Una fila por participante con TODOS los campos del formulario de
 * registro — para la pestaña General de Informes, donde lo que se quiere
 * es la base completa del segmento filtrado (ej. solo audiovisuales de
 * Ventanilla), no un cruce contra capacitaciones.
 */
export function buildRegistroCsv(participantes: Participante[]): string {
  const headers = [
    'Nombres', 'Apellidos', 'Fecha de nacimiento', 'Género', 'Teléfono', 'Correo',
    'Estaca', 'Barrio', 'Experiencia previa', 'Asignación anterior', 'Disponibilidad',
    'Asignación', 'Habilidades audiovisuales', 'Equipo audiovisual', 'Consentimiento de datos',
    'Fecha de registro',
  ];
  const rows = participantes.map((p) => [
    p.nombres,
    p.apellidos,
    p.fechaNacimiento,
    GENERO_LABEL[p.genero] || p.genero,
    p.telefono,
    p.correo,
    p.estaca,
    p.barrio,
    EXPERIENCIA_PREVIA_LABEL[p.experienciaPrevia] || p.experienciaPrevia,
    p.asignacionAnterior,
    DISPONIBILIDAD_LABEL[p.disponibilidad] || p.disponibilidad,
    p.asignacion,
    habilidadesParaMostrar(p.audiovisualHabilidades).join(' / '),
    EQUIPO_AV_LABEL[p.audiovisualEquipo] || p.audiovisualEquipo,
    p.consentimientoDatosFecha ? 'Sí' : 'No',
    p.timestamp,
  ]);
  return [headers, ...rows].map((row) => row.map((v) => csvEscape(String(v))).join(',')).join('\r\n');
}

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
