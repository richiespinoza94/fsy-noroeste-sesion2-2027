import { FieldPath, collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
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

/** Varias marcas de una vez (ej. "Todos presentes" y su deshacer): un solo guardado y una sola línea en el historial. */
export async function marcarVariosNocheHogar(noche: NocheHogar, cambios: Record<string, EstadoAsistencia>, adminCorreo: string) {
  const ids = Object.keys(cambios);
  if (!ids.length) return;
  if (!db) {
    localStore = localStore.map((n) => (n.id === noche.id ? { ...n, asistencia: { ...n.asistencia, ...cambios } } : n));
    notifyLocal();
  } else {
    const [primero, ...resto] = ids;
    await updateDoc(
      doc(db, COL, noche.id),
      new FieldPath('asistencia', primero),
      cambios[primero],
      ...resto.flatMap((id) => [new FieldPath('asistencia', id), cambios[id]])
    );
  }
  const estados = new Set(Object.values(cambios));
  await logAction(adminCorreo, 'ASISTENCIA_MASIVA_NOCHE_HOGAR', '', {
    nocheId: noche.id,
    familiaId: noche.familiaId,
    cantidad: ids.length,
    estado: estados.size === 1 ? [...estados][0] : 'varios',
  });
}

export async function editarNocheHogar(noche: NocheHogar, fecha: string, titulo: string, adminCorreo: string) {
  const nuevoTitulo = titulo.trim() || 'Noche de Hogar';
  if (!db) {
    localStore = localStore.map((n) => (n.id === noche.id ? { ...n, fecha, titulo: nuevoTitulo } : n));
    notifyLocal();
  } else {
    await updateDoc(doc(db, COL, noche.id), { fecha, titulo: nuevoTitulo });
  }
  await logAction(adminCorreo, 'EDITAR_NOCHE_HOGAR', '', { nocheId: noche.id, familiaId: noche.familiaId, fecha, titulo: nuevoTitulo });
}

export async function eliminarNocheHogar(noche: NocheHogar, adminCorreo: string) {
  if (!db) {
    localStore = localStore.filter((n) => n.id !== noche.id);
    notifyLocal();
  } else {
    await deleteDoc(doc(db, COL, noche.id));
  }
  await logAction(adminCorreo, 'ELIMINAR_NOCHE_HOGAR', '', { nocheId: noche.id, familiaId: noche.familiaId, fecha: noche.fecha, titulo: noche.titulo });
}

/** Deshacer de eliminar: vuelve a guardar la noche tal como estaba (con su asistencia). */
export async function restaurarNocheHogar(noche: NocheHogar, adminCorreo: string) {
  if (!db) {
    if (!localStore.some((n) => n.id === noche.id)) localStore = [...localStore, noche];
    notifyLocal();
  } else {
    await setDoc(doc(db, COL, noche.id), noche);
  }
  await logAction(adminCorreo, 'RESTAURAR_NOCHE_HOGAR', '', { nocheId: noche.id, familiaId: noche.familiaId, fecha: noche.fecha });
}
