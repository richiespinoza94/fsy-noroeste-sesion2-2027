import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Familia, Participante, RepartoFamiliasRegistro } from '../types';
import { logAction } from './auditService';
import { updateParticipante } from './participantsService';

const COL = 'repartosFamilias';

let localHistorial: RepartoFamiliasRegistro[] = [];
const listeners = new Set<(items: RepartoFamiliasRegistro[]) => void>();
const notify = () => listeners.forEach((fn) => fn([...localHistorial]));

/** Todo el historial de corridas, más reciente primero — para el log visible y para saber cuál es "la última" a deshacer. */
export function subscribeHistorialReparto(cb: (items: RepartoFamiliasRegistro[]) => void): () => void {
  if (!db) {
    listeners.add(cb);
    cb([...localHistorial]);
    return () => listeners.delete(cb);
  }
  const q = query(collection(db, COL), orderBy('timestamp', 'desc'), limit(20));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RepartoFamiliasRegistro)));
}

/**
 * Persiste un reparto ya calculado (el algoritmo puro corre antes, en la UI,
 * sin escribir nada — esto es lo que se llama recién al tocar "Confirmar").
 * Guarda de dónde venía cada persona (`anterior`) para poder deshacer esta
 * corrida puntual más adelante.
 *
 * A diferencia de antes, NO bloquea si ya hay corridas previas sin deshacer
 * — correr el reparto varias veces a lo largo de las semanas, a medida que
 * llega gente nueva, es el uso normal esperado. Cada corrida solo puede
 * tocar a quien todavía no tiene compañía (ver calcularCandidatosPorRol),
 * así que corridas distintas nunca se pisan entre sí.
 */
export async function ejecutarReparto(
  porFamilia: Record<string, Participante[]>,
  familias: Familia[],
  capacitacionId: string,
  adminCorreo: string
): Promise<void> {
  const anterior: RepartoFamiliasRegistro['anterior'] = [];
  const asignados: RepartoFamiliasRegistro['asignados'] = [];

  for (const [familiaId, miembros] of Object.entries(porFamilia)) {
    for (const p of miembros) {
      anterior.push({ participanteId: p.id, familiaIdAnterior: p.familiaId || '' });
      asignados.push({ participanteId: p.id, familiaId });
    }
  }
  if (!asignados.length) return; // nada que repartir — no vale la pena dejar un registro vacío en el historial

  // En paralelo: cada update es independiente, así que repartir a 100 personas
  // tarda lo de UNA ida y vuelta, no 100 una tras otra (async-parallel).
  await Promise.all(asignados.map(({ participanteId, familiaId }) => updateParticipante(participanteId, { familiaId }, adminCorreo)));

  await Promise.all(
    Object.entries(porFamilia).flatMap(([familiaId, miembros]) => {
      const familia = familias.find((f) => f.id === familiaId);
      return familia && miembros.length ? [saveFamilia({ ...familia, consejeros: [...familia.consejeros, ...miembros.map((p) => p.id)] })] : [];
    })
  );

  const registro: Omit<RepartoFamiliasRegistro, 'id'> = {
    timestamp: new Date().toISOString(),
    capacitacionId,
    adminCorreo,
    anterior,
    asignados,
  };
  if (!db) {
    localHistorial = [{ id: crypto.randomUUID(), ...registro }, ...localHistorial];
    notify();
  } else {
    await addDoc(collection(db, COL), registro);
  }
  await logAction(adminCorreo, 'REPARTO_FAMILIAS_EJECUTADO', '', { capacitacionId, personas: asignados.length });
}

/** Deshace SOLO la corrida que se le pasa (normalmente la más reciente) — las demás del historial quedan intactas. */
export async function deshacerReparto(registro: RepartoFamiliasRegistro, familias: Familia[], adminCorreo: string): Promise<void> {
  await Promise.all(registro.anterior.map(({ participanteId, familiaIdAnterior }) => updateParticipante(participanteId, { familiaId: familiaIdAnterior }, adminCorreo)));

  const porFamilia = new Map<string, string[]>();
  registro.asignados.forEach(({ familiaId, participanteId }) => {
    porFamilia.set(familiaId, [...(porFamilia.get(familiaId) || []), participanteId]);
  });
  await Promise.all(
    [...porFamilia].flatMap(([familiaId, ids]) => {
      const familia = familias.find((f) => f.id === familiaId);
      return familia ? [saveFamilia({ ...familia, consejeros: familia.consejeros.filter((id) => !ids.includes(id)) })] : [];
    })
  );

  if (!db) {
    localHistorial = localHistorial.filter((r) => r.id !== registro.id);
    notify();
  } else {
    await deleteDoc(doc(db, COL, registro.id));
  }
  await logAction(adminCorreo, 'REPARTO_FAMILIAS_DESHECHO', '', { personas: registro.anterior.length });
}

async function saveFamilia(f: Familia) {
  if (!db) return; // en modo local, familiasService.ts es dueño del array — no lo duplicamos acá
  await setDoc(doc(db, 'familias', f.id), f);
}
