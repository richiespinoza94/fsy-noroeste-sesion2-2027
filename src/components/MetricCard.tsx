export default function MetricCard({
  label,
  value,
  color,
  icon,
  cargando,
  sub,
  badge,
}: {
  label: string;
  value: number | string;
  color: string;
  icon: string;
  cargando?: boolean;
  sub?: string; // línea secundaria chica debajo del valor — ej. nombre/fecha de la capacitación
  badge?: string; // pill pequeño arriba a la derecha — ej. "🔴 En vivo"
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border-t-[3px] relative" style={{ borderTopColor: color }}>
      {badge && (
        <span className="absolute top-2 right-2 text-[9px] font-bold bg-red-50 text-red-600 rounded-full px-1.5 py-0.5">
          {badge}
        </span>
      )}
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-2xl font-extrabold" style={{ color }}>{cargando ? '—' : value}</div>
      <div className="text-[11px] text-slate-500 font-semibold mt-0.5">{label}</div>
      {sub && !cargando && <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
