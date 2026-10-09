import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { AuditLog } from '../types';

/**
 * Registra la acción SIN esperar la respuesta del servidor: el log no debe
 * sumar una ida y vuelta a cada marca de asistencia o edición (antes se
 * esperaba con await, duplicando la latencia de las acciones más usadas).
 * Los errores se tragan: la auditoría nunca bloquea la acción principal.
 */
export function logAction(admin: string, accion: string, participanteId: string, detalles: unknown): Promise<void> {
  if (!db) return Promise.resolve(); // modo local: no hay nada que auditar
  void addDoc(collection(db, 'auditoria'), {
    timestamp: serverTimestamp(),
    admin: admin || 'sistema',
    accion,
    participanteId: participanteId || '',
    detalles: typeof detalles === 'string' ? detalles : JSON.stringify(detalles ?? {}),
  }).catch((e) => console.warn('logAction error', e));
  return Promise.resolve();
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

/** Los últimos `n` cambios de TODO el sistema (más reciente primero) — alimenta la pestaña Historial. */
export async function getRecentLogs(n = 300): Promise<AuditLog[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, 'auditoria'), orderBy('timestamp', 'desc'), limit(n)));
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : String(data.timestamp || '');
    return { id: d.id, timestamp: ts, admin: data.admin || '', accion: data.accion || '', participanteId: data.participanteId || '', detalles: data.detalles || '' };
  });
}

/** Interpreta el JSON guardado en Detalles como una línea legible. */
export function formatAuditDetails(detalles: string): string {
  try {
    const obj = JSON.parse(detalles);
    if (obj && typeof obj === 'object') {
      // `_antes` guarda el valor previo de lo editado: se muestra como "campo: antes → ahora".
      const { _antes, ...resto } = obj as Record<string, unknown>;
      const antes = (_antes && typeof _antes === 'object' ? _antes : {}) as Record<string, unknown>;
      const txt = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v ?? '') || '—');
      return Object.entries(resto)
        .map(([k, v]) => (k in antes ? `${k}: ${txt(antes[k])} → ${txt(v)}` : `${k}: ${txt(v)}`))
        .join(' · ');
    }
  } catch {
    /* no era JSON, se muestra tal cual */
  }
  return detalles || 'Sin detalles adicionales.';
}
