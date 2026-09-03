// ── Modelo de datos — Gestión FSY 2027 ──────────────────────────────────────
// Gestión de la etapa de PREPARACIÓN de consejeros antes del evento (no el
// evento en sí). Es el equivalente en Firestore del backend Apps Script
// "JAS Conference Staff" que ya existía para CONFEJAS — misma lógica de
// negocio, estacas y barrios, migrado a React + Vite + Firestore + Vercel.

export type Genero = 'H' | 'M';
export type Disponibilidad = 'si' | 'no_creo' | 'no_se';
export type ExperienciaPrevia = 'ninguna' | 'fsy' | 'jas' | 'ambos';

export const EXPERIENCIA_PREVIA_LABEL: Record<ExperienciaPrevia, string> = {
  ninguna: 'No he participado',
  fsy: 'Sí, en FSY / PFJ',
  jas: 'Sí, en Conferencia JAS',
  ambos: 'Sí, en ambos',
};

export const ASIGNACIONES = [
  'Coordinador General',
  'Coordinador Auxiliar',
  'Coordinador Logístico',
  'Matrimonio Logístico',
  'Logístico',
  'Audiovisuales',
  'Comité de Bienvenida',
  'Consejero',
] as const;
export type Asignacion = (typeof ASIGNACIONES)[number];

/** Asignaciones que un participante ya pudo haber tenido en una conferencia anterior. */
export const ASIGNACIONES_PREVIAS = [
  'Coordinador General',
  'Coordinador Auxiliar',
  'Consejero',
  'Logística',
  'Audiovisuales',
] as const;

export interface Participante {
  id: string;
  timestamp: string; // ISO
  nombres: string;
  apellidos: string;
  fechaNacimiento: string; // yyyy-MM-dd
  telefono: string;
  correo: string;
  estaca: string;
  barrio: string;
  genero: Genero;
  experienciaPrevia: ExperienciaPrevia;
  asignacionAnterior: string; // solo relevante si experienciaPrevia !== 'ninguna'
  disponibilidad: Disponibilidad; // disponibilidad para las fechas específicas del evento
  asignacion: Asignacion | '';
  familiaId: string;
}

export interface Familia {
  id: string;
  nombre: string; // "Familia 1" — autogenerado, nunca editable
  customName: string; // alias visible, editable
  colorId: string;
  consejeros: string[]; // IDs de Participante con asignacion === 'Consejero'
}

export interface Companerismo {
  id: string;
  familiaId: string;
  p1Id: string;
  p2Id: string;
}

export interface Capacitacion {
  id: string;
  label: string;
  fecha: string; // yyyy-MM-dd
  hora: string; // HH:mm
  lugar: string;
  oficial: boolean;
}

export type EstadoAsistencia = 'presente' | 'ausente' | 'justificado';

export interface Asistencia {
  capacitacionId: string;
  participanteId: string;
  estado: EstadoAsistencia;
  timestamp: string;
}

export interface NocheHogar {
  id: string;
  familiaId: string;
  fecha: string; // yyyy-MM-dd
  titulo: string;
  creadoPor: string;
  asistencia: Record<string, EstadoAsistencia>; // participanteId -> estado
}

export type Rol = 'staff' | 'admin';

export interface Usuario {
  correo: string;
  passwordHash: string;
  rol: string; // 'Data Master' | 'Coordinador General' | 'Logística' | 'Coordinador Auxiliar' | ...
  estaca: string;
  activo: boolean;
  fechaCreacion: string;
}

export interface SessionUser {
  correo: string;
  rol: string;
  estaca: string;
  participantId?: string;
  familiaId?: string;
  canEditAll: boolean;
  canViewReports: boolean;
  isAuxiliar: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  admin: string;
  accion: string;
  participanteId: string;
  detalles: string;
}
