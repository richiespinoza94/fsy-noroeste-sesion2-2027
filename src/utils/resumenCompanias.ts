import type { Asistencia, Capacitacion, Familia, Participante } from '../types';
import { calcularEdad, grupoEstacaReparto, participaRegular, type GrupoEstacaReparto } from './repartoFamilias';
import { nombreCompania } from './companias';
import { fechaAmigable } from './fechaAmigable';
import { hoyLocalISO } from './tiposEvento';

const ESTACAS: GrupoEstacaReparto[] = ['Ventanilla', 'Puente Piedra', 'Pro Lima', 'Otros'];
const EVENTOS_MAX = 6;

const hm = (l: Participante[]) => `${l.filter((p) => p.genero === 'H').length}H/${l.filter((p) => p.genero === 'M').length}M`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/** Edad en años enteros: promedio y mediana redondeados a la unidad (la edad es entera por naturaleza). */
function edades(l: Participante[], ahora: Date): string {
  const e = l.map((p) => calcularEdad(p.fechaNacimiento, ahora)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!e.length) return 'sin datos';
  const n = e.length;
  const mediana = n % 2 ? e[(n - 1) / 2] : (e[n / 2 - 1] + e[n / 2]) / 2;
  return `promedio ${Math.round(e.reduce((s, x) => s + x, 0) / n)} · mediana ${Math.round(mediana)} · de ${e[0]} a ${e[n - 1]}`;
}

/**
 * Texto con el estado actual de cada compañía, SOLO con números (ninguna
 * persona por su nombre): sirve para pegarlo en un chat y revisar el reparto.
 * "Participan" es lo que cuenta el algoritmo (ver participaRegular).
 */
export function resumenCompaniasTexto({
  familias,
  participantes,
  capacitaciones,
  asistencia,
  ahora = new Date(),
}: {
  familias: Familia[];
  participantes: Participante[];
  capacitaciones: Capacitacion[];
  asistencia: Asistencia[];
  ahora?: Date;
}): string {
  const hoy = hoyLocalISO(ahora);
  const eventos = [...capacitaciones]
    .filter((c) => c.fecha <= hoy)
    .sort((a, b) => `${b.fecha}${b.hora}`.localeCompare(`${a.fecha}${a.hora}`))
    .slice(0, EVENTOS_MAX);
  const estadoPor = new Map<string, string>();
  for (const a of asistencia) estadoPor.set(`${a.capacitacionId}|${a.participanteId}`, a.estado);

  const L: string[] = [`RESUMEN DE COMPAÑÍAS · ${fechaAmigable(hoy, hoy)} ${hoy} · sin nombres de personas`, ''];
  const conCompania = new Set<string>();

  for (const f of familias) {
    const miembros = participantes.filter((p) => f.consejeros.includes(p.id));
    miembros.forEach((p) => conCompania.add(p.id));
    const participan = miembros.filter(participaRegular);
    L.push(`${nombreCompania(f)}`);
    L.push(`  Inscritos: ${miembros.length} (${hm(miembros)}) · Participan: ${participan.length} (${hm(participan)}) · ${pct(participan.length, miembros.length)} de los inscritos`);
    L.push(`  Roles (inscritos): ${miembros.filter((p) => p.asignacion === 'Consejero').length} Consejeros · ${miembros.filter((p) => p.asignacion === 'Logístico').length} Logísticos`);
    L.push(`  Edad (participan): ${edades(participan, ahora)}`);
    L.push(`  Estaca (participan): ${ESTACAS.map((g) => `${g} ${participan.filter((p) => grupoEstacaReparto(p.estaca) === g).length}`).join(' · ')}`);
    if (eventos.length && miembros.length) {
      const partes = eventos.map((c) => {
        const est = miembros.map((p) => estadoPor.get(`${c.id}|${p.id}`));
        const pres = est.filter((e) => e === 'presente').length;
        const just = est.filter((e) => e === 'justificado').length;
        return `${c.label} (${fechaAmigable(c.fecha, hoy)}) ${pres}/${miembros.length}${just ? ` +${just}J` : ''}`;
      });
      L.push(`  Asistencia (presentes/inscritos): ${partes.join(' · ')}`);
    }
    L.push('');
  }

  const sueltos = participantes.filter((p) => !conCompania.has(p.id) && (p.asignacion === 'Consejero' || p.asignacion === 'Logístico'));
  L.push(`SIN COMPAÑÍA (próximos a repartir)`);
  for (const rol of ['Consejero', 'Logístico'] as const) {
    const l = sueltos.filter((p) => p.asignacion === rol);
    L.push(`  ${rol}s: ${l.length} (${hm(l)})`);
  }
  const ultimo = eventos[0];
  if (ultimo) {
    const presentes = sueltos.filter((p) => estadoPor.get(`${ultimo.id}|${p.id}`) === 'presente');
    L.push(`  Presentes sin compañía en "${ultimo.label}" (${fechaAmigable(ultimo.fecha, hoy)}): ${presentes.length} (${hm(presentes)})`);
  }
  return L.join('\n');
}
