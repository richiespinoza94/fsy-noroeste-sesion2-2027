import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { AuditLog } from '../types';

export async function logAction(admin: string, accion: string, participanteId: string, detalles: unknown) {
  if (!db) return; // modo local: no hay nada que auditar
  try {
    await addDoc(collection(db, 'auditoria'), {
      timestamp: serverTimestamp(),
      admin: admin || 'sistema',
      accion,
      participanteId: participanteId || '',
      detalles: typeof detalles === 'string' ? detalles : JSON.stringify(detalles ?? {}),
    });
  } catch (e) {
    // La auditoría nunca debe bloquear la acción principal.
    console.warn('logAction error', e);
  }
}

/** Historial de cambios de un participante — se carga bajo demanda, no en cada render. */
export async function getLogsForParticipante(participanteId: string): Promise<AuditLog[]> {
  if (!db || !participanteId) return [];
  const snap = await getDocs(query(collection(db, 'auditoria'), where('participanteId', '==', participanteId)));
  return snap.docs
    .map((d) => {
      const data = d.data();
      const ts = data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : String(data.timestamp || '');
      return { id: d.id, timestamp: ts, admin: data.admin || '', accion: data.accion || '', participanteId: data.participanteId || '', detalles: data.detalles || '' };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Interpreta el JSON guardado en Detalles como una línea legible. */
export function formatAuditDetails(detalles: string): string {
  try {
    const obj = JSON.parse(detalles);
    if (obj && typeof obj === 'object') {
      return Object.entries(obj)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(' · ');
    }
  } catch {
    /* no era JSON, se muestra tal cual */
  }
  return detalles || 'Sin detalles adicionales.';
}
