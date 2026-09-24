import { deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Familia, Participante, RepartoFamiliasActivo } from '../types';
import { logAction } from './auditService';
import { updateParticipante } from './participantsService';

const COL = 'repartosFamilias';
const DOC_ID = 'activo'; // solo puede existir UN reparto sin deshacer a la vez — ver repartoFamilias.ts

let localActivo: RepartoFamiliasActivo | null = null;
const listeners = new Set<(r: RepartoFamiliasActivo | null) => void>();
const notify = () => listeners.forEach((fn) => fn(localActivo));

export function subscribeRepartoActivo(cb: (r: RepartoFamiliasActivo | null) => void): () => void {
  if (!db) {
    listeners.add(cb);
    cb(localActivo);
    return () => listeners.delete(cb);
  }
  return onSnapshot(doc(db, COL, DOC_ID), (snap) => cb(snap.exists() ? (snap.data() as RepartoFamiliasActivo) : null));
}

/**
 * Persiste un reparto ya calculado (el algoritmo puro corre antes, en la UI,
 * sin escribir nada — esto es lo que se llama recién al tocar "Confirmar").
 * Guarda de dónde venía cada persona (`anterior`) para poder deshacer.
 */
export async function ejecutarReparto(
  porFamilia: Record<string, Participante[]>,
  familias: Familia[],
  capacitacionId: string,
  adminCorreo: string
): Promise<void> {
  const anterior: RepartoFamiliasActivo['anterior'] = [];
  const asignados: RepartoFamiliasActivo['asignados'] = [];

  for (const [familiaId, miembros] of Object.entries(porFamilia)) {
    for (const p of miembros) {
      anterior.push({ participanteId: p.id, familiaIdAnterior: p.familiaId || '' });
      asignados.push({ participanteId: p.id, familiaId });
    }
  }

  // Actualiza cada participante — ponytail: secuencial, no batch; el
  // volumen de este proyecto (decenas de personas, no miles) no lo
  // justifica, mismo criterio que el resto del proyecto (ver
  // familiasService.ts, deleteFamilia).
  for (const { participanteId, familiaId } of asignados) {
    await updateParticipante(participanteId, { familiaId }, adminCorreo);
  }

  for (const [familiaId, miembros] of Object.entries(porFamilia)) {
    const familia = familias.find((f) => f.id === familiaId);
    if (!familia || !miembros.length) continue;
    const nuevosIds = miembros.map((p) => p.id);
    await saveFamilia({ ...familia, consejeros: [...familia.consejeros, ...nuevosIds] });
  }

  const activo: RepartoFamiliasActivo = { timestamp: new Date().toISOString(), capacitacionId, adminCorreo, anterior, asignados };
  if (!db) {
    localActivo = activo;
    notify();
  } else {
    await setDoc(doc(db, COL, DOC_ID), activo);
  }
  await logAction(adminCorreo, 'REPARTO_FAMILIAS_EJECUTADO', '', { capacitacionId, personas: asignados.length });
}

export async function deshacerReparto(familias: Familia[], adminCorreo: string): Promise<void> {
  const activo = await getRepartoActivo();
  if (!activo) return;

  for (const { participanteId, familiaIdAnterior } of activo.anterior) {
    await updateParticipante(participanteId, { familiaId: familiaIdAnterior }, adminCorreo);
  }

  const porFamilia = new Map<string, string[]>();
  activo.asignados.forEach(({ familiaId, participanteId }) => {
    porFamilia.set(familiaId, [...(porFamilia.get(familiaId) || []), participanteId]);
  });
  for (const [familiaId, ids] of porFamilia) {
    const familia = familias.find((f) => f.id === familiaId);
    if (!familia) continue;
    await saveFamilia({ ...familia, consejeros: familia.consejeros.filter((id) => !ids.includes(id)) });
  }

  if (!db) {
    localActivo = null;
    notify();
  } else {
    await deleteDoc(doc(db, COL, DOC_ID));
  }
  await logAction(adminCorreo, 'REPARTO_FAMILIAS_DESHECHO', '', { personas: activo.anterior.length });
}

async function getRepartoActivo(): Promise<RepartoFamiliasActivo | null> {
  if (!db) return localActivo;
  const snap = await getDoc(doc(db, COL, DOC_ID));
  return snap.exists() ? (snap.data() as RepartoFamiliasActivo) : null;
}

async function saveFamilia(f: Familia) {
  if (!db) return; // en modo local, familiasService.ts es dueño del array — no lo duplicamos acá
  await setDoc(doc(db, 'familias', f.id), f);
}
