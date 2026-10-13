import { FieldPath, collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { EstadoAsistencia, NocheHogar } from '../types';
import { logAction } from './auditService';

const COL = 'nochesHogar';

let localStore: NocheHogar[] = [];
const localListeners = new Set<() => void>();
const notifyLocal = () => localListeners.forEach((fn) => fn());

/** Más reciente primero. Firestore devuelve por id (al azar), así que el orden se pone acá. */
export function ordenarNoches(noches: NocheHogar[]): NocheHogar[] {
  return [...noches].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
}

export function subscribeNochesHogar(familiaId: string, cb: (items: NocheHogar[]) => void): () => void {
  if (!familiaId) {
    cb([]);
    return () => {};
  }
  if (!db) {
    const fn = () => cb(ordenarNoches(localStore.filter((n) => n.familiaId === familiaId)));
    localListeners.add(fn);
    fn();
    return () => localListeners.delete(fn);
  }
  return onSnapshot(query(collection(db, COL), where('familiaId', '==', familiaId)), (snap) => {
    cb(ordenarNoches(snap.docs.map((d) => d.data() as NocheHogar)));
  });
}

export async function crearNocheHogar(familiaId: string, fecha: string, titulo: string, adminCorreo: string) {
  const item: NocheHogar = { id: crypto.randomUUID(), familiaId, fecha, titulo: titulo || 'Noche de Hogar', creadoPor: adminCorreo, asistencia: {} };
  if (!db) {
    localStore = [...localStore, item];
    notifyLocal();
  } else {
    await setDoc(doc(db, COL, item.id), item);
  }
  await logAction(adminCorreo, 'CREAR_NOCHE_HOGAR', '', { nocheId: item.id, familiaId, fecha, titulo });
  return item;
}

export async function marcarAsistenciaNocheHogar(noche: NocheHogar, participanteId: string, estado: EstadoAsistencia, adminCorreo: string) {
  const updated: NocheHogar = { ...noche, asistencia: { ...noche.asistencia, [participanteId]: estado } };
  if (!db) {
    localStore = localStore.map((n) => (n.id === noche.id ? updated : n));
    notifyLocal();
  } else {
    // Solo la marca de esa persona: reescribir la noche entera pisaba lo que otro coordinador marcó al mismo tiempo.
    await updateDoc(doc(db, COL, noche.id), new FieldPath('asistencia', participanteId), estado);
  }
  await logAction(adminCorreo, 'ASISTENCIA_NOCHE_HOGAR', participanteId, { nocheId: noche.id, familiaId: noche.familiaId, estado });
}
