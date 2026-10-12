import { collection, deleteDoc, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Familia, ParejaTrabajo } from '../types';
import { planearGuardado, planearLote } from '../utils/parejasTrabajo';
import { suscripcionCompartida } from '../utils/suscripcionCompartida';
import { logAction } from './auditService';

const COL = 'parejasTrabajo';

// ── Modo local (sin Firebase) ─────────────────────────────────────────────
let local: ParejaTrabajo[] = [];
const listeners = new Set<(items: ParejaTrabajo[]) => void>();
const notify = () => listeners.forEach((fn) => fn([...local]));

// Una sola conexión compartida (con 30 s de gracia): la lista de compañías, el
// detalle de familia y Búsqueda leen lo mismo sin descargar la colección de nuevo.
const compartida = suscripcionCompartida<ParejaTrabajo[]>((emitir) =>
  onSnapshot(collection(db!, COL), (snap) => emitir(snap.docs.map((d) => d.data() as ParejaTrabajo)))
);

export function subscribeParejas(cb: (items: ParejaTrabajo[]) => void): () => void {
  if (!db) {
    listeners.add(cb);
    cb([...local]);
    return () => listeners.delete(cb);
  }
  return compartida(cb);
}

/**
 * Arma (id = null) o cambia un compañerismo de trabajo. Todo en un solo
 * batch: o se guarda completo o no se guarda nada.
 */
export async function guardarPareja(
  familia: Familia,
  id: string | null,
  miembros: string[],
  existentes: ParejaTrabajo[],
  adminCorreo: string
): Promise<ParejaTrabajo> {
  const fuera = miembros.filter((m) => !familia.consejeros.includes(m));
  if (fuera.length) throw new Error('Solo pueden emparejarse integrantes de esta compañía.');
  const plan = planearGuardado({ familiaId: familia.id, id, miembros, existentes, nuevoId: crypto.randomUUID() });
  if (!db) {
    const quitar = new Set([plan.guardar.id, ...plan.borrar, ...plan.actualizar.map((a) => a.id)]);
    local = [...local.filter((x) => !quitar.has(x.id)), plan.guardar, ...plan.actualizar];
    notify();
  } else {
    const batch = writeBatch(db);
    batch.set(doc(db, COL, plan.guardar.id), plan.guardar);
    plan.actualizar.forEach((a) => batch.set(doc(db!, COL, a.id), a));
    plan.borrar.forEach((b) => batch.delete(doc(db!, COL, b)));
    await batch.commit();
  }
  void logAction(adminCorreo, id ? 'CAMBIAR_COMPANERISMO_FAMILIA' : 'ARMAR_COMPANERISMO_FAMILIA', '', {
    familiaId: familia.id,
    miembros: plan.guardar.miembros,
  });
  return plan.guardar;
}

export async function deshacerPareja(pareja: ParejaTrabajo, adminCorreo: string) {
  if (!db) {
    local = local.filter((x) => x.id !== pareja.id);
    notify();
  } else {
    await deleteDoc(doc(db, COL, pareja.id));
  }
  void logAction(adminCorreo, 'DESHACER_COMPANERISMO_FAMILIA', '', { familiaId: pareja.familiaId, miembros: pareja.miembros });
}

/**
 * Guarda de una vez todos los compañerismos de una propuesta (un solo batch:
 * o se arman todos o ninguno). Devuelve los creados para poder deshacerlos.
 */
export async function guardarParejasLote(
  familia: Familia,
  grupos: string[][],
  existentes: ParejaTrabajo[],
  adminCorreo: string
): Promise<ParejaTrabajo[]> {
  const nuevas = planearLote({ familia, grupos, existentes, nuevoId: () => crypto.randomUUID() });
  if (!db) {
    local = [...local, ...nuevas];
    notify();
  } else {
    const batch = writeBatch(db);
    nuevas.forEach((n) => batch.set(doc(db!, COL, n.id), n));
    await batch.commit();
  }
  void logAction(adminCorreo, 'SUGERIR_COMPANERISMOS_FAMILIA', '', { familiaId: familia.id, grupos: nuevas.map((n) => n.miembros) });
  return nuevas;
}

/** Deshace una propuesta aplicada: borra todos sus compañerismos en un solo batch. */
export async function deshacerParejasLote(parejas: ParejaTrabajo[], adminCorreo: string) {
  if (!parejas.length) return;
  if (!db) {
    const quitar = new Set(parejas.map((x) => x.id));
    local = local.filter((x) => !quitar.has(x.id));
    notify();
  } else {
    const batch = writeBatch(db);
    parejas.forEach((x) => batch.delete(doc(db!, COL, x.id)));
    await batch.commit();
  }
  void logAction(adminCorreo, 'DESHACER_SUGERENCIA_COMPANERISMOS', '', {
    familiaId: parejas[0].familiaId,
    grupos: parejas.map((x) => x.miembros),
  });
}
