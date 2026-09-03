import { useState } from 'react';
import { formatAuditDetails, getLogsForParticipante } from '../services/auditService';
import type { AuditLog } from '../types';

export default function AuditTimeline({ participanteId }: { participanteId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (logs.length === 0) {
      setLoading(true);
      setLogs(await getLogsForParticipante(participanteId));
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={toggle} className="w-full border-2 border-primary text-primary font-bold rounded-xl py-2.5 text-sm">
        {loading ? '⏳ Cargando historial…' : open ? 'Ocultar historial' : '🕘 Ver historial de cambios'}
      </button>
      {open && !loading && (
        <div className="mt-3 flex flex-col gap-2">
          {logs.length === 0 && (
            <div className="text-xs text-slate-400 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl py-3">
              No hay cambios auditados para este participante todavía.
            </div>
          )}
          {logs.map((log) => (
            <div key={log.id} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
              <div className="flex justify-between items-start gap-2 mb-1">
                <strong className="text-[11px] text-primary uppercase tracking-wide">{log.accion}</strong>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                  {log.timestamp ? new Date(log.timestamp).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-semibold mb-1">{log.admin || 'sistema'}</div>
              <div className="text-xs text-slate-700">{formatAuditDetails(log.detalles)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
