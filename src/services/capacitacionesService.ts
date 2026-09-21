import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Capacitacion } from '../types';
import { logAction } from './auditService';

const COL = 'capacitaciones';

let localStore: Capacitacion[] = [];
const localListeners = new Set<(items: Capacitacion[]) => void>();
function notifyLocal() {
  localListeners.forEach((fn) => fn([...localStore]));
}

export function subscribeCapacitaciones(cb: (items: Capacitacion[]) => void): () => void {
  if (!db) {
    localListeners.add(cb);
    cb([...localStore]);
    return () => localListeners.delete(cb);
  }
  return onSnapshot(collection(db, COL), (snap) => {
    cb(snap.docs.map((d) => d.data() as Capacitacion));
  });
}

export async function addCapacitacion(input: Omit<Capacitacion, 'id'>, adminCorreo: string) {
  const id = crypto.randomUUID();
  const item: Capacitacion = { id, ...input };
  if (!db) {
    localStore = [...localStore, item];
    notifyLocal();
  } else {
    await setDoc(doc(db, COL, id), item);
  }
  await logAction(adminCorreo, 'CREAR_CAPACITACION', '', item);
  return item;
}

export async function deleteCapacitacion(id: string, adminCorreo: string) {
  if (!db) {
    localStore = localStore.filter((c) => c.id !== id);
    notifyLocal();
  } else {
    await deleteDoc(doc(db, COL, id));
  }
  await logAction(adminCorreo, 'ELIMINAR_CAPACITACION', '', { capacitacionId: id });
}

export type VentanaCheckIn = 'sin_fecha' | 'muy_temprano' | 'abierta' | 'cerrada';

const VENTANA_ANTES_MS = 60 * 60 * 1000; // 1 hora antes del inicio
const VENTANA_DESPUES_MS = 3 * 60 * 60 * 1000; // 3 horas después del inicio

/**
 * Ventana de check-in automático (público, sin login) para una capacitación:
 * abre 1h antes de la hora programada, cierra 3h después de que empieza.
 * Usa datetime completo (fecha+hora), no solo comparar el string de fecha —
 * así una capacitación que arranca a las 23:30 y se extiende pasada la
 * medianoche se evalúa bien, sin depender de en qué día calendario cae "ahora".
 */
export function estadoVentanaCheckIn(cap: Capacitacion | null, ahora: Date = new Date()): VentanaCheckIn {
  if (!cap || !cap.fecha) return 'sin_fecha';
  const inicio = new Date(`${cap.fecha}T${cap.hora || '00:00'}`);
  if (isNaN(inicio.getTime())) return 'sin_fecha';
  const nowMs = ahora.getTime();
  if (nowMs < inicio.getTime() - VENTANA_ANTES_MS) return 'muy_temprano';
  if (nowMs > inicio.getTime() + VENTANA_DESPUES_MS) return 'cerrada';
  return 'abierta';
}

/**
 * Elige QUÉ capacitación mostrar en el check-in público — a propósito
 * DISTINTA de getNextCapacitacion(), que siempre prefiere cualquier futura
 * sobre una pasada (correcto para el Home/Asistencia de staff, donde "la
 * próxima" tiene sentido aunque sea dentro de varios días).
 *
 * Para el check-in automático eso es un bug real: si la capacitación de HOY
 * ya pasó su ventana pero la siguiente oficial es la próxima semana,
 * getNextCapacitacion saltaba a esa lejana y mostraba "muy temprano" sobre
 * algo a días de distancia — confuso y engañoso. Esta función en cambio:
 * 1) si alguna capacitación tiene la ventana abierta AHORA, esa gana;
 * 2) si no, la más cercana en el tiempo (pasada o futura), para que el
 *    aviso ("muy temprano"/"cerrada") sea sobre la sesión realmente
 *    relevante en este momento.
 */
export function getCapacitacionParaCheckIn(caps: Capacitacion[], ahora: Date = new Date()): Capacitacion | null {
  if (!caps.length) return null;
  const parsed = caps
    .map((c) => ({ c, d: new Date(`${c.fecha}T${c.hora || '00:00'}`) }))
    .filter((x) => !isNaN(x.d.getTime()));
  if (!parsed.length) return caps[0];

  const abiertas = parsed.filter((x) => estadoVentanaCheckIn(x.c, ahora) === 'abierta');
  const candidatas = abiertas.length ? abiertas : parsed;
  candidatas.sort((a, b) => Math.abs(a.d.getTime() - ahora.getTime()) - Math.abs(b.d.getTime() - ahora.getTime()));
  return candidatas[0].c;
}

/**
 * Decide si un registro nuevo (RegistroWizard) debe marcar asistencia
 * automática — y a cuál capacitación — separado de `submit()` a propósito
 * para poder probarlo solo, sin tener que simular todo el flujo del
 * formulario. Devuelve la capacitación a marcar si su ventana de check-in
 * está abierta AHORA MISMO, o `null` si no hay ninguna (sea porque no hay
 * capacitaciones, o porque la más cercana todavía no abre o ya cerró).
 */
export function getCapacitacionParaAutoMarcar(caps: Capacitacion[], ahora: Date = new Date()): Capacitacion | null {
  const cap = getCapacitacionParaCheckIn(caps, ahora);
  return cap && estadoVentanaCheckIn(cap, ahora) === 'abierta' ? cap : null;
}

/**
 * Elige QUÉ capacitación mostrar en la tarjeta de asistencia del Home —
 * distinta de getNextCapacitacion() (que mira hacia ADELANTE, la próxima) y
 * de getCapacitacionParaCheckIn() (pensada para el check-in público). Esta
 * mira hacia el momento actual y hacia ATRÁS:
 *
 * 1) si hay una capacitación EN CURSO ahora mismo (entre su hora de inicio
 *    y su hora de fin), esa gana y se marca `enCurso: true` — el admin ve
 *    la asistencia de HOY en vivo, no la de la sesión pasada.
 * 2) si dos quedaran en curso al mismo tiempo (dos sesiones programadas el
 *    mismo día que se solapan), gana la que empezó más tarde — la más
 *    específica de las dos en ese momento.
 * 3) si ninguna está en curso, la más reciente que YA TERMINÓ — "última
 *    capacitación".
 * 4) si el evento ni siquiera ha empezado (todas son futuras), no hay nada
 *    que mostrar todavía → null.
 *
 * `horaFin` es opcional (capacitaciones creadas antes de este campo, o
 * dejado en blanco a propósito) — sin ella, se asume la misma duración por
 * defecto que ya usa la ventana de check-in público (3h), para no dejar
 * capacitaciones viejas sin clasificar. Si horaFin quedara antes que hora
 * (dato mal cargado), también se cae al valor por defecto en vez de
 * producir un rango invertido.
 */
export function getCapacitacionParaHome(
  caps: Capacitacion[],
  ahora: Date = new Date()
): { cap: Capacitacion; enCurso: boolean } | null {
  const parsed = caps
    .map((c) => {
      const inicio = new Date(`${c.fecha}T${c.hora || '00:00'}`);
      let fin = c.horaFin ? new Date(`${c.fecha}T${c.horaFin}`) : null;
      if (!fin || isNaN(fin.getTime()) || fin.getTime() <= inicio.getTime()) {
        fin = new Date(inicio.getTime() + VENTANA_DESPUES_MS);
      }
      return { c, inicio, fin };
    })
    .filter((x) => !isNaN(x.inicio.getTime()));
  if (!parsed.length) return null;

  const nowMs = ahora.getTime();
  const enCurso = parsed.filter((x) => nowMs >= x.inicio.getTime() && nowMs <= x.fin.getTime());
  if (enCurso.length) {
    enCurso.sort((a, b) => b.inicio.getTime() - a.inicio.getTime());
    return { cap: enCurso[0].c, enCurso: true };
  }

  const pasadas = parsed.filter((x) => x.fin.getTime() < nowMs).sort((a, b) => b.inicio.getTime() - a.inicio.getTime());
  if (pasadas.length) return { cap: pasadas[0].c, enCurso: false };

  return null;
}

/** Elige la capacitación más relevante para el Home/Asistencia de staff: la futura más próxima, si no la pasada más reciente. */
export function getNextCapacitacion(caps: Capacitacion[]): Capacitacion | null {
  if (!caps.length) return null;
  const now = new Date();
  const parsed = caps
    .map((c) => ({ c, d: new Date(`${c.fecha}T${c.hora || '00:00'}`) }))
    .filter((x) => !isNaN(x.d.getTime()));
  if (!parsed.length) return caps[0];

  const futuras = parsed.filter((x) => x.d >= now).sort((a, b) => a.d.getTime() - b.d.getTime());
  if (futuras.length) return futuras[0].c;

  const pasadas = parsed.sort((a, b) => b.d.getTime() - a.d.getTime());
  return pasadas[0].c;
}
