import { useEffect, useMemo, useState } from 'react';
import { TODAS_LAS_ESTACAS } from '../data/estacas';
import { subscribeAllAsistencia } from '../services/asistenciaService';
import { ASIGNACIONES, type Asistencia, type Capacitacion, type Participante } from '../types';

export default function ReportesScreen({
  participantes,
  capacitaciones,
}: {
  participantes: Participante[];
  capacitaciones: Capacitacion[];
}) {
  const [asistencia, setAsistencia] = useState<Asistencia[]>([]);
  const [filterEstaca, setFilterEstaca] = useState('');

  useEffect(() => subscribeAllAsistencia(setAsistencia), []);

  const segmento = filterEstaca ? participantes.filter((p) => p.estaca === filterEstaca) : participantes;
  const confirmados = segmento.filter((p) => p.disponibilidad === 'si').length;

  const capsOrdenadas = useMemo(
    () => [...capacitaciones].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`)),
    [capacitaciones]
  );

  const segmentoIds = new Set(segmento.map((p) => p.id));
  const attByCap = capsOrdenadas.map((c) => {
    const rows = asistencia.filter((a) => a.capacitacionId === c.id && segmentoIds.has(a.participanteId));
    const presentes = rows.filter((a) => a.estado === 'presente').length;
    const ausentes = rows.filter((a) => a.estado === 'ausente').length;
    const justificados = rows.filter((a) => a.estado === 'justificado').length;
    const pct = segmento.length ? Math.round((presentes / segmento.length) * 100) : 0;
    return { cap: c, presentes, ausentes, justificados, sinMarca: Math.max(segmento.length - rows.length, 0), pct, registros: rows.length };
  });
  const conRegistros = attByCap.filter((c) => c.registros > 0);
  const avgAtt = conRegistros.length ? Math.round(conRegistros.reduce((s, c) => s + c.pct, 0) / conRegistros.length) : 0;

  const byEstaca = TODAS_LAS_ESTACAS.map((e) => ({ estaca: e, n: participantes.filter((p) => p.estaca === e).length })).filter((x) => x.n > 0);
  const byRol = ASIGNACIONES.map((r) => ({ rol: r, n: segmento.filter((p) => p.asignacion === r).length })).filter((x) => x.n > 0);

  const BAR_W = 44, GAP = 16, H = 100;
  const chartWidth = Math.max(attByCap.length * (BAR_W + GAP) + GAP, 280);

  return (
    <div className="p-4 flex flex-col gap-4 pb-24">
      <select className="input" value={filterEstaca} onChange={(e) => setFilterEstaca(e.target.value)}>
        <option value="">Todas las estacas</option>
        {TODAS_LAS_ESTACAS.map((e) => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Consejeros del segmento" value={segmento.length} color="#0E2954" icon="👥" />
        <Metric label="Confirmados" value={confirmados} color="#4CAF50" icon="✅" />
        <Metric label="Asistencia promedio" value={`${avgAtt}%`} color="#E8863A" icon="📈" />
        <Metric label="Capacitaciones" value={capacitaciones.length} color="#9C27B0" icon="📅" />
      </div>

      {attByCap.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Tendencia de asistencia</div>
          <div className="overflow-x-auto">
            <svg width={chartWidth} height={H + 34}>
              {[0, 50, 100].map((v) => {
                const y = 10 + H - (v / 100) * H;
                return (
                  <g key={v}>
                    <line x1={0} x2={chartWidth} y1={y} y2={y} stroke="#F0F4F8" />
                    <text x={2} y={y - 2} fontSize={8} fill="#8899B0">{v}%</text>
                  </g>
                );
              })}
              {attByCap.map((d, i) => {
                const x = GAP + i * (BAR_W + GAP);
                const barH = (d.pct / 100) * H;
                const y = 10 + H - barH;
                const muted = d.registros === 0;
                return (
                  <g key={d.cap.id}>
                    <rect x={x} y={y} width={BAR_W} height={Math.max(barH, 2)} rx={5} fill={muted ? '#D5D9E0' : '#0E2954'} opacity={muted ? 0.5 : 0.9} />
                    <text x={x + BAR_W / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#0E2954">{d.pct}%</text>
                    <text x={x + BAR_W / 2} y={H + 24} textAnchor="middle" fontSize={8} fill="#8899B0">{d.cap.fecha.slice(5)}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide px-1">Detalle por capacitación</div>
      <div className="flex flex-col gap-2">
        {attByCap.map((d) => (
          <div key={d.cap.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold">{d.cap.label}</div>
              <div className="text-[11px] text-slate-500">{d.cap.fecha} · {d.registros} registros</div>
            </div>
            <div className="flex gap-1.5 text-[11px]">
              <Mark label={`✓ ${d.presentes}`} bg="#E8F5E9" fg="#2E7D32" />
              <Mark label={`✕ ${d.ausentes}`} bg="#FFEBEE" fg="#C62828" />
              <Mark label={`J ${d.justificados}`} bg="#FFF3E0" fg="#EF6C00" />
              <Mark label={`○ ${d.sinMarca}`} bg="#F5F5F5" fg="#757575" />
            </div>
          </div>
        ))}
        {attByCap.length === 0 && <div className="text-xs text-slate-500 text-center py-4">Sin capacitaciones todavía.</div>}
      </div>

      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide px-1">Por estaca</div>
      <div className="flex flex-col gap-1.5">
        {byEstaca.map(({ estaca, n }) => {
          const pct = participantes.length ? Math.round((n / participantes.length) * 100) : 0;
          return (
            <div key={estaca} className="bg-white rounded-xl px-3.5 py-2.5 shadow-sm">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold">{estaca}</span>
                <span className="text-slate-500">{n} ({pct}%)</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide px-1">Por rol</div>
      <div className="grid grid-cols-2 gap-2">
        {byRol.map(({ rol, n }) => (
          <div key={rol} className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
            <div className="text-lg font-extrabold text-primary">{n}</div>
            <div className="text-[11px] text-slate-500 font-semibold">{rol}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: string }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm border-l-[4px]" style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <div>
          <div className="text-lg font-extrabold" style={{ color }}>{value}</div>
          <div className="text-[10px] text-slate-500 font-semibold">{label}</div>
        </div>
      </div>
    </div>
  );
}

function Mark({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span className="rounded-full px-1.5 py-0.5 font-bold" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}
