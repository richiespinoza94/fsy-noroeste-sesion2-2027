import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Participante } from '../types';
import { nameKey, normalizeEmail, normalizePhone } from '../utils/validation';
import { logAction } from './auditService';

const COL = 'participantes';

// ── Modo local (sin Firebase configurado): array en memoria para poder
// probar el flujo completo sin credenciales todavía. ────────────────────────
let localStore: Participante[] = [];
const localListeners = new Set<(items: Participante[]) => void>();
function notifyLocal() {
  localListeners.forEach((fn) => fn([...localStore]));
}

export function subscribeParticipantes(cb: (items: Participante[]) => void): () => void {
  if (!db) {
    localListeners.add(cb);
    cb([...localStore]);
    return () => localListeners.delete(cb);
  }
  return onSnapshot(collection(db, COL), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Participante));
  });
}

export interface DuplicateCheck {
  telefono: boolean;
  correo: boolean;
  nombre: boolean;
}

/** Verifica los 3 tipos de duplicado en una sola pasada (igual que verificarDuplicado en el GAS, pero client-side). */
export async function checkDuplicates(
  telefono: string,
  correo: string,
  nombres: string,
  apellidos: string
): Promise<DuplicateCheck> {
  const existing = await fetchAllParticipantes();
  const phone = normalizePhone(telefono);
  const email = normalizeEmail(correo);
  const key = nameKey(nombres, apellidos);
  return {
    telefono: !!phone && existing.some((p) => normalizePhone(p.telefono) === phone),
    correo: !!email && existing.some((p) => normalizeEmail(p.correo) === email),
    nombre: !!key && existing.some((p) => nameKey(p.nombres, p.apellidos) === key),
  };
}

async function fetchAllParticipantes(): Promise<Participante[]> {
  if (!db) return localStore;
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Participante);
}

export interface RegistroInput {
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  telefono: string;
  correo: string;
  estaca: string;
  barrio: string;
  genero: 'H' | 'M';
  experienciaPrevia: 'ninguna' | 'fsy' | 'jas' | 'ambos';
  asignacionAnterior: string;
  disponibilidad: 'si' | 'no_creo' | 'no_se';
}

export type RegistroResult =
  | { ok: true; id: string }
  | { ok: false; field: string; message: string };

/** Registro público de un consejero — valida duplicados server-side antes de escribir. */
export async function registrarParticipante(input: RegistroInput): Promise<RegistroResult> {
  const dup = await checkDuplicates(input.telefono, input.correo, input.nombres, input.apellidos);
  if (dup.telefono) return { ok: false, field: 'telefono', message: 'Este teléfono ya está registrado.' };
  if (dup.correo) return { ok: false, field: 'correo', message: 'Este correo ya está registrado.' };
  if (dup.nombre) return { ok: false, field: 'nombre', message: 'Ya existe un participante con ese nombre y apellido.' };

  const id = crypto.randomUUID();
  const participante: Participante = {
    id,
    timestamp: new Date().toISOString(),
    nombres: input.nombres,
    apellidos: input.apellidos,
    fechaNacimiento: input.fechaNacimiento,
    telefono: normalizePhone(input.telefono),
    correo: normalizeEmail(input.correo),
    estaca: input.estaca,
    barrio: input.barrio,
    genero: input.genero,
    experienciaPrevia: input.experienciaPrevia,
    asignacionAnterior: input.experienciaPrevia === 'ninguna' ? '' : input.asignacionAnterior,
    disponibilidad: input.disponibilidad,
    asignacion: 'Consejero', // asignación inicial por defecto, igual que en el GAS
    familiaId: '',
  };

  if (!db) {
    localStore = [...localStore, participante];
    notifyLocal();
  } else {
    await setDoc(doc(db, COL, id), participante);
  }

  await logAction('sistema', 'CREAR_PARTICIPANTE', id, {
    origen: 'Registro público',
    nombres: participante.nombres,
    apellidos: participante.apellidos,
    estaca: participante.estaca,
  });

  return { ok: true, id };
}

export async function updateParticipante(id: string, changes: Partial<Participante>, adminCorreo: string) {
  if (!db) {
    localStore = localStore.map((p) => (p.id === id ? { ...p, ...changes } : p));
    notifyLocal();
  } else {
    await updateDoc(doc(db, COL, id), changes);
  }
  await logAction(adminCorreo, 'ACTUALIZAR_PARTICIPANTE', id, changes);
}

export async function findParticipanteByCorreo(correo: string): Promise<Participante | null> {
  const email = normalizeEmail(correo);
  if (!db) return localStore.find((p) => normalizeEmail(p.correo) === email) ?? null;
  const snap = await getDocs(query(collection(db, COL), where('correo', '==', email)));
  const d = snap.docs[0];
  return d ? ({ id: d.id, ...d.data() } as Participante) : null;
}
