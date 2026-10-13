// Fechas "yyyy-MM-dd" y horas "HH:mm" para mostrar. Se parsean a mano (no con
// `new Date('yyyy-MM-dd')`, que se corre un día en Lima por el UTC).
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function partes(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** "Hoy", "Mañana" o "dom 11 oct" (con el año solo si no es el de hoy). Si no se entiende la fecha, la devuelve tal cual. */
export function fechaAmigable(fecha: string, hoy: string): string {
  const f = partes(fecha);
  const h = partes(hoy);
  if (!f || !h) return fecha;
  const dias = Math.round((Date.UTC(f[0], f[1] - 1, f[2]) - Date.UTC(h[0], h[1] - 1, h[2])) / 86_400_000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  const dia = DIAS[new Date(Date.UTC(f[0], f[1] - 1, f[2])).getUTCDay()];
  return `${dia} ${f[2]} ${MESES[f[1] - 1]}${f[0] !== h[0] ? ` ${f[0]}` : ''}`;
}

function hora12(hhmm: string): { texto: string; sufijo: string } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  return { texto: `${h % 12 || 12}:${m[2]}`, sufijo: h >= 12 ? 'pm' : 'am' };
}

/** "17:00","19:00" → "5:00–7:00 pm"; "11:00","13:00" → "11:00 am–1:00 pm"; sin hora fin → "5:00 pm". */
export function rangoHora(hora: string, horaFin?: string): string {
  const a = hora12(hora);
  if (!a) return '';
  const b = horaFin ? hora12(horaFin) : null;
  if (!b) return `${a.texto} ${a.sufijo}`;
  return a.sufijo === b.sufijo ? `${a.texto}–${b.texto} ${b.sufijo}` : `${a.texto} ${a.sufijo}–${b.texto} ${b.sufijo}`;
}

/** Piezas para dibujar una fecha tipo calendario: { dia: 'jue', num: 15, mes: 'oct' }. */
export function partesFecha(iso: string): { dia: string; num: number; mes: string } | null {
  const f = partes(iso);
  if (!f) return null;
  return { dia: DIAS[new Date(Date.UTC(f[0], f[1] - 1, f[2])).getUTCDay()], num: f[2], mes: MESES[f[1] - 1] };
}
