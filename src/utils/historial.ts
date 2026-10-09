import type { AuditLog, Capacitacion, Familia, Participante } from '../types';
import { nombreCorto } from './nombreCorto';
import { normalizeEmail } from './validation';

/**
 * Convierte el log crudo de `auditoria` (códigos + JSON) en frases legibles
 * para la pestaña Historial. Todo es puro: recibe los catálogos ya cargados
 * (personas, familias, eventos) para traducir ids a nombres.
 */
export type GrupoHistorial = 'personas' | 'asistencia' | 'familias' | 'eventos' | 'usuarios' | 'accesos';

export const GRUPOS_HISTORIAL: { id: GrupoHistorial | 'cambios'; label: string }[] = [
  { id: 'cambios', label: 'Cambios' }, // todo menos accesos (ruido)
  { id: 'personas', label: 'Personas' },
  { id: 'asistencia', label: 'Asistencia' },
  { id: 'familias', label: 'Familias' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'accesos', label: 'Accesos' },
];

export interface ContextoHistorial {
  participantes: Participante[];
  familias: Familia[];
  capacitaciones: Capacitacion[];
}

export interface EntradaHistorial {
  log: AuditLog;
  grupo: GrupoHistorial;
  icon: string;
  actor: string;
  texto: string; // frase completa: "Ana marcó presente a Juan en Capacitación 1"
}

const ETIQUETA_CAMPO: Record<string, string> = {
  asignacion: 'rol',
  familiaId: 'familia',
  telefono: 'teléfono',
  correo: 'correo',
  estaca: 'estaca',
  barrio: 'barrio',
  disponibilidad: 'disponibilidad',
  nombres: 'nombres',
  apellidos: 'apellidos',
  fechaNacimiento: 'fecha de nacimiento',
  genero: 'género',
};

function parse(detalles: string): Record<string, unknown> {
  try {
    const o = JSON.parse(detalles);
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export function grupoDeAccion(accion: string): GrupoHistorial {
  if (accion.startsWith('LOGIN') || accion === 'SETUP_PASSWORD_FIRST_TIME') return 'accesos';
  if (accion.includes('USUARIO')) return 'usuarios';
  if (accion === 'MARCAR_ASISTENCIA' || accion === 'ASISTENCIA_NOCHE_HOGAR') return 'asistencia';
  if (accion.includes('FAMILIA') || accion.includes('COMPANERISMO') || accion.startsWith('REPARTO')) return 'familias';
  if (accion.includes('CAPACITACION') || accion.includes('NOCHE_HOGAR')) return 'eventos';
  return 'personas';
}

const ICONO: Record<GrupoHistorial, string> = {
  personas: '👤', asistencia: '✅', familias: '👥', eventos: '📅', usuarios: '🔑', accesos: '🚪',
};

/** Índices por id/correo, armados UNA vez: con 300 movimientos x cientos de personas, buscar con `find` en cada frase sería O(n·m) (js-index-maps). */
export interface IndiceHistorial {
  personaPorId: Map<string, string>;
  personaPorCorreo: Map<string, string>;
  familiaPorId: Map<string, string>;
  eventoPorId: Map<string, string>;
}

export function indexarContexto(ctx: ContextoHistorial): IndiceHistorial {
  const personaPorId = new Map<string, string>();
  const personaPorCorreo = new Map<string, string>();
  for (const p of ctx.participantes) {
    const nombre = nombreCorto(p.nombres, p.apellidos);
    personaPorId.set(p.id, nombre);
    const c = normalizeEmail(p.correo || '');
    if (c && !personaPorCorreo.has(c)) personaPorCorreo.set(c, nombre);
  }
  return {
    personaPorId,
    personaPorCorreo,
    familiaPorId: new Map(ctx.familias.map((f) => [f.id, f.customName || f.nombre])),
    eventoPorId: new Map(ctx.capacitaciones.map((c) => [c.id, c.label])),
  };
}

/** Describe muchos logs indexando el contexto una sola vez. */
export function describirEntradas(logs: AuditLog[], ctx: ContextoHistorial): EntradaHistorial[] {
  const idx = indexarContexto(ctx);
  return logs.map((l) => describirEntrada(l, idx));
}

export function describirEntrada(log: AuditLog, ctxOIndice: ContextoHistorial | IndiceHistorial): EntradaHistorial {
  const idx = 'personaPorId' in ctxOIndice ? ctxOIndice : indexarContexto(ctxOIndice);
  const d = parse(log.detalles);
  const grupo = grupoDeAccion(log.accion);

  const persona = (id: unknown) => idx.personaPorId.get(s(id)) ?? 'una persona';
  const familia = (id: unknown) => (s(id) ? idx.familiaPorId.get(s(id)) ?? 'una familia' : 'sin familia');
  const evento = (id: unknown) => idx.eventoPorId.get(s(id)) ?? 'un evento';
  const valor = (campo: string, v: unknown) => (campo === 'familiaId' ? familia(v) : s(v) || '—');

  // Quién lo hizo: si el correo es de una persona registrada, su nombre; si no, el correo/etiqueta tal cual.
  const correo = normalizeEmail(log.admin || '');
  const actor = (correo && idx.personaPorCorreo.get(correo)) || log.admin || 'sistema';

  const sujeto = log.participanteId ? persona(log.participanteId) : '';
  let texto: string;

  switch (log.accion) {
    case 'MARCAR_ASISTENCIA':
      texto = `marcó ${s(d.estado)} a ${sujeto} en ${evento(d.capacitacionId)}`;
      break;
    case 'ASISTENCIA_NOCHE_HOGAR':
      texto = `marcó ${s(d.estado)} a ${sujeto} en una Noche de Hogar`;
      break;
    case 'ACTUALIZAR_PARTICIPANTE': {
      const antes = (d._antes && typeof d._antes === 'object' ? d._antes : {}) as Record<string, unknown>;
      const cambios = Object.keys(d).filter((k) => k !== '_antes');
      const partes = cambios.map((k) => {
        const et = ETIQUETA_CAMPO[k] ?? k;
        return k in antes ? `${et}: ${valor(k, antes[k])} → ${valor(k, d[k])}` : `${et}: ${valor(k, d[k])}`;
      });
      texto = `editó a ${sujeto}${partes.length ? ` (${partes.join(' · ')})` : ''}`;
      break;
    }
    case 'CREAR_PARTICIPANTE':
      texto = `${sujeto || 'una persona'} se registró`;
      break;
    case 'AÑADIR_MIEMBRO_FAMILIA':
      texto = `añadió a ${sujeto} a ${familia(d.familiaId)}`;
      break;
    case 'QUITAR_MIEMBRO_FAMILIA':
      texto = `quitó a ${sujeto} de ${familia(d.familiaId)}`;
      break;
    case 'CREAR_FAMILIA':
      texto = `creó ${s(d.customName) || s(d.nombre) || 'una familia'}`;
      break;
    case 'ACTUALIZAR_FAMILIA':
      texto = `editó ${familia(d.familiaId)}`;
      break;
    case 'ELIMINAR_FAMILIA':
      texto = `eliminó ${s(d.nombre) || 'una familia'}`;
      break;
    case 'AÑADIR_COMPANERISMO':
      texto = `armó un compañerismo en ${familia(d.familiaId)}: ${[d.p1Id, d.p2Id].filter((x) => s(x)).map(persona).join(' y ')}`;
      break;
    case 'ELIMINAR_COMPANERISMO':
      texto = 'quitó un compañerismo';
      break;
    case 'REPARTO_FAMILIAS_EJECUTADO':
      texto = `ejecutó el reparto automático de compañías (${s(d.personas)} personas)`;
      break;
    case 'REPARTO_FAMILIAS_DESHECHO':
      texto = `deshizo un reparto automático (${s(d.personas)} personas)`;
      break;
    case 'CREAR_CAPACITACION':
      texto = `creó el evento ${s(d.label) || ''}`.trim();
      break;
    case 'ACTUALIZAR_CAPACITACION':
      texto = `cambió el tipo de ${evento(d.capacitacionId)} a ${s(d.tipo)}`;
      break;
    case 'ELIMINAR_CAPACITACION':
      texto = `eliminó ${evento(d.capacitacionId)}`;
      break;
    case 'CREAR_NOCHE_HOGAR':
      texto = `creó una Noche de Hogar para ${familia(d.familiaId)} (${s(d.fecha)})`;
      break;
    case 'CREAR_USUARIO':
      texto = `creó la cuenta de ${s(d.correo)} (${s(d.rol)})`;
      break;
    case 'ACTIVAR_USUARIO':
      texto = `activó la cuenta de ${s(d.correo)}`;
      break;
    case 'DESACTIVAR_USUARIO':
      texto = `desactivó la cuenta de ${s(d.correo)}`;
      break;
    case 'LOGIN_EXITOSO':
      texto = 'inició sesión';
      break;
    case 'LOGIN_FALLIDO':
      texto = `intento fallido de ingreso (${s(d.correo)})`;
      break;
    case 'LOGIN_ATTEMPT':
      texto = `intento de ingreso con un correo no registrado (${s(d.correo)})`;
      break;
    case 'SETUP_PASSWORD_FIRST_TIME':
      texto = 'creó su contraseña por primera vez';
      break;
    default:
      texto = log.accion.toLowerCase().replace(/_/g, ' ');
  }
  return { log, grupo, icon: ICONO[grupo], actor, texto };
}

export type RangoHistorial = 'hoy' | '7d' | 'todo';

/** Filtra por grupo, rango de fechas (relativo a `ahora`) y texto libre (actor + frase). */
export function filtrarHistorial(
  entradas: EntradaHistorial[],
  opciones: { grupo: GrupoHistorial | 'cambios'; rango: RangoHistorial; texto: string },
  ahora: Date = new Date()
): EntradaHistorial[] {
  const q = opciones.texto.trim().toLowerCase();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  const desde = opciones.rango === 'hoy' ? inicioHoy : opciones.rango === '7d' ? inicioHoy - 6 * 86400000 : -Infinity;
  return entradas.filter((e) => {
    if (opciones.grupo === 'cambios' ? e.grupo === 'accesos' : e.grupo !== opciones.grupo) return false;
    const t = new Date(e.log.timestamp).getTime();
    if (!isNaN(t) && t < desde) return false;
    if (q && !`${e.actor} ${e.texto}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** "Hoy" / "Ayer" / "mié 7 oct" — para separar la lista por día. */
export function etiquetaDia(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Sin fecha';
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((dia(ahora) - dia(d)) / 86400000);
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Ayer';
  return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
}
