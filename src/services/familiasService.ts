import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Companerismo, Familia, Participante } from '../types';
import { logAction } from './auditService';
import { updateParticipante } from './participantsService';

const FAM_COL = 'familias';
const CP_COL = 'companerismo';

// ── Modo local ───────────────────────────────────────────────────────────
let localFamilias: Familia[] = [];
let localCompanerismo: Companerismo[] = [];
const famListeners = new Set<(items: Familia[]) => void>();
const cpListeners = new Set<(items: Companerismo[]) => void>();
const notifyFam = () => famListeners.forEach((fn) => fn([...localFamilias]));
const notifyCp = () => cpListeners.forEach((fn) => fn([...localCompanerismo]));

export function subscribeFamilias(cb: (items: Familia[]) => void): () => void {
  if (!db) {
    famListeners.add(cb);
    cb(ordenarFamilias([...localFamilias]));
    return () => famListeners.delete(cb);
  }
  return onSnapshot(collection(db, FAM_COL), (snap) => cb(ordenarFamilias(snap.docs.map((d) => d.data() as Familia))));
}

/**
 * Firestore no garantiza ningún orden sin un `orderBy` explícito — el id de
 * cada familia es un UUID al azar (ver addFamilia), así que sin esto las 4
 * compañías podían aparecer en cualquier orden (ej. "1, 2, 4, 3") en TODOS
 * lados a la vez: el selector acá, la grilla de Reparto, el PDF y la
 * presentación de burbujas — los 4 leen `familias` desde este mismo punto.
 * Se ordena por el número al final de `nombre` ("Familia 1"→1), el mismo
 * patrón que ya usa addFamilia para calcular el siguiente número.
 */
export function ordenarFamilias(familias: Familia[]): Familia[] {
  const num = (f: Familia) => parseInt(f.nombre.replace(/^Familia\s*/i, ''), 10);
  return [...familias].sort((a, b) => {
    const na = num(a), nb = num(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.nombre.localeCompare(b.nombre);
  });
}

/**
 * Familias que un Coordinador Auxiliar puede ver y editar: aquellas donde
 * figura en algún compañerismo (como P1 o P2). Un auxiliar NO es "integrante"
 * de la familia (`Familia.consejeros` solo admite Consejero/Logístico), así
 * que `participante.familiaId` nunca se llena para él — el vínculo real es
 * el compañerismo. Pueden ser varias. Se ignoran compañerismos huérfanos
 * (familia ya eliminada). Devuelve [] si no se conoce al participante.
 */
export function familiasDeAuxiliar(
  participanteId: string | undefined,
  companerismo: Companerismo[],
  familias: Familia[]
): Familia[] {
  if (!participanteId) return [];
  const ids = new Set(
    companerismo.filter((c) => c.p1Id === participanteId || c.p2Id === participanteId).map((c) => c.familiaId)
  );
  return ordenarFamilias(familias.filter((f) => ids.has(f.id)));
}

export function subscribeCompanerismo(cb: (items: Companerismo[]) => void): () => void {
  if (!db) {
    cpListeners.add(cb);
    cb([...localCompanerismo]);
    return () => cpListeners.delete(cb);
  }
  return onSnapshot(collection(db, CP_COL), (snap) => cb(snap.docs.map((d) => d.data() as Companerismo)));
}

async function saveFamilia(f: Familia) {
  if (!db) {
    localFamilias = [...localFamilias.filter((x) => x.id !== f.id), f];
    notifyFam();
  } else {
    await setDoc(doc(db, FAM_COL, f.id), f);
  }
}

export function isConsejero(p: Participante): boolean {
  return p.asignacion === 'Consejero';
}
export function isLogistico(p: Participante): boolean {
  return p.asignacion === 'Logístico';
}
export function isCoordAux(p: Participante): boolean {
  return p.asignacion === 'Coordinador Auxiliar';
}

export async function addFamilia(customName: string, colorId: string, existing: Familia[], adminCorreo: string) {
  const nums = existing.map((f) => parseInt(f.nombre.replace(/^Familia\s*/i, ''), 10)).filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  const familia: Familia = { id: crypto.randomUUID(), nombre: `Familia ${next}`, customName, colorId, consejeros: [] };
  await saveFamilia(familia);
  await logAction(adminCorreo, 'CREAR_FAMILIA', '', familia);
  return familia;
}

export async function updateFamiliaMeta(id: string, changes: Partial<Pick<Familia, 'customName' | 'colorId'>>, adminCorreo: string) {
  if (!db) {
    localFamilias = localFamilias.map((f) => (f.id === id ? { ...f, ...changes } : f));
    notifyFam();
  } else {
    await updateDoc(doc(db, FAM_COL, id), changes);
  }
  await logAction(adminCorreo, 'ACTUALIZAR_FAMILIA', '', { familiaId: id, ...changes });
}

export async function deleteFamilia(familia: Familia, adminCorreo: string) {
  if (!db) {
    localFamilias = localFamilias.filter((f) => f.id !== familia.id);
    localCompanerismo = localCompanerismo.filter((c) => c.familiaId !== familia.id);
    notifyFam();
    notifyCp();
  } else {
    await deleteDoc(doc(db, FAM_COL, familia.id));
    // Compañerismos huérfanos de esta familia se limpian desde la UI (ver GestionScreen) uno por uno,
    // ponytail: no hace falta batch/transacción para el volumen de este proyecto.
  }
  await Promise.all(
    familia.consejeros.map((pid) => updateParticipante(pid, { familiaId: '' }, adminCorreo))
  );
  await logAction(adminCorreo, 'ELIMINAR_FAMILIA', '', { familiaId: familia.id, nombre: familia.nombre });
}

/**
 * Añade un Consejero o Logístico a una familia — rechaza cualquier otra
 * asignación. Antes solo aceptaba Consejero exacto; se amplió a Logístico
 * porque el reparto automático (repartoFamilias.ts) ya los incluye como
 * relleno, así que la asignación manual (para quien llega después del
 * corte) debía poder hacer lo mismo — si no, un Logístico tardío se
 * quedaba sin forma de asignarlo a mano desde acá.
 */
export async function addConsejeroToFamilia(familia: Familia, p: Participante, adminCorreo: string) {
  if (!isConsejero(p) && !isLogistico(p)) {
    throw new Error('Solo Consejeros o Logísticos pueden integrar una familia.');
  }
  const updated = { ...familia, consejeros: [...familia.consejeros, p.id] };
  await saveFamilia(updated);
  await updateParticipante(p.id, { familiaId: familia.id }, adminCorreo);
  await logAction(adminCorreo, 'AÑADIR_MIEMBRO_FAMILIA', p.id, { familiaId: familia.id });
}

export async function removeConsejeroFromFamilia(familia: Familia, participanteId: string, adminCorreo: string) {
  const updated = { ...familia, consejeros: familia.consejeros.filter((id) => id !== participanteId) };
  await saveFamilia(updated);
  await updateParticipante(participanteId, { familiaId: '' }, adminCorreo);
  await logAction(adminCorreo, 'QUITAR_MIEMBRO_FAMILIA', participanteId, { familiaId: familia.id });
}

/** Crea un compañerismo — ambos slots son opcionales pero deben quedar vacíos o con un Coordinador Auxiliar. */
export async function addCompanerismo(familiaId: string, p1: Participante | null, p2: Participante | null, adminCorreo: string) {
  if (!p1 && !p2) throw new Error('Selecciona al menos un Coordinador Auxiliar.');
  if (p1 && p2 && p1.id === p2.id) throw new Error('Selecciona dos personas distintas.');
  [p1, p2].forEach((p) => {
    if (p && !isCoordAux(p)) throw new Error('El compañerismo solo puede asignarse a Coordinadores Auxiliares.');
  });
  const item: Companerismo = { id: crypto.randomUUID(), familiaId, p1Id: p1?.id || '', p2Id: p2?.id || '' };
  if (!db) {
    localCompanerismo = [...localCompanerismo, item];
    notifyCp();
  } else {
    await setDoc(doc(db, CP_COL, item.id), item);
  }
  await logAction(adminCorreo, 'AÑADIR_COMPANERISMO', '', item);
  return item;
}

export async function removeCompanerismo(id: string, adminCorreo: string) {
  if (!db) {
    localCompanerismo = localCompanerismo.filter((c) => c.id !== id);
    notifyCp();
  } else {
    await deleteDoc(doc(db, CP_COL, id));
  }
  await logAction(adminCorreo, 'ELIMINAR_COMPANERISMO', '', { companerismoId: id });
}
