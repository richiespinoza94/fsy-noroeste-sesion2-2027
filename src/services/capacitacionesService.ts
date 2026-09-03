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
