import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Asistencia, EstadoAsistencia } from '../types';
import { logAction } from './auditService';

const COL = 'asistencia';

// ID determinístico: convierte "marcar asistencia" en un simple upsert.
// Esto reemplaza por completo el índice manual (_buildAttendanceIndex_ +
// PropertiesService particionado) que el backend Apps Script necesitaba
// para no recorrer toda la hoja buscando la fila de esa persona.
const docId = (capId: string, participanteId: string) => `${capId}_${participanteId}`;

// ── Modo local: un solo store + un solo set de listeners "cambió algo",
// cada suscriptor filtra lo que necesita. Más simple que mantener un mapa
// de listeners por capacitación. ───────────────────────────────────────────
let localStore: Record<string, Asistencia> = {};
const localListeners = new Set<() => void>();
const notifyLocal = () => localListeners.forEach((fn) => fn());

/** Suscripción en tiempo real a la asistencia de UNA capacitación — reemplaza el polling de 45s del GAS. */
export function subscribeAsistencia(capId: string, cb: (map: Record<string, Asistencia>) => void): () => void {
  if (!capId) {
    cb({});
    return () => {};
  }
  if (!db) {
    const fn = () => {
      const filtered: Record<string, Asistencia> = {};
      Object.values(localStore).forEach((a) => {
        if (a.capacitacionId === capId) filtered[a.participanteId] = a;
      });
      cb(filtered);
    };
    localListeners.add(fn);
    fn();
    return () => localListeners.delete(fn);
  }
  return onSnapshot(query(collection(db, COL), where('capacitacionId', '==', capId)), (snap) => {
    const map: Record<string, Asistencia> = {};
    snap.docs.forEach((d) => {
      const a = d.data() as Asistencia;
      map[a.participanteId] = a;
    });
    cb(map);
  });
}

/** Suscripción a TODA la asistencia (todas las capacitaciones) — usada en Reportes para calcular tendencias. */
export function subscribeAllAsistencia(cb: (items: Asistencia[]) => void): () => void {
  if (!db) {
    const fn = () => cb(Object.values(localStore));
    localListeners.add(fn);
    fn();
    return () => localListeners.delete(fn);
  }
  return onSnapshot(collection(db, COL), (snap) => cb(snap.docs.map((d) => d.data() as Asistencia)));
}

export async function marcarAsistencia(
  capId: string,
  participanteId: string,
  estado: EstadoAsistencia,
  adminCorreo: string
) {
  const item: Asistencia = {
    capacitacionId: capId,
    participanteId,
    estado,
    timestamp: new Date().toISOString(),
  };
  if (!db) {
    localStore = { ...localStore, [docId(capId, participanteId)]: item };
    notifyLocal();
  } else {
    await setDoc(doc(db, COL, docId(capId, participanteId)), item);
  }
  await logAction(adminCorreo, 'MARCAR_ASISTENCIA', participanteId, { capacitacionId: capId, estado });
}
