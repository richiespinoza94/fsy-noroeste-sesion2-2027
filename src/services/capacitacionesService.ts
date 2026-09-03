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

/** Elige la capacitación más relevante: la de hoy pendiente, si no la futura más próxima, si no la pasada más reciente. */
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
