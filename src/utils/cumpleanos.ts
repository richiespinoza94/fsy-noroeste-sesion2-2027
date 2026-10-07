import type { Participante } from '../types';

/**
 * Cumpleaños próximos — Home.
 *
 * Objetivo explícito del usuario: que el staff (coordinadores, consejeros,
 * logísticos, etc.) vea sin buscarlo quién cumple años hoy o esta semana,
 * para poder saludar/dar seguimiento de forma más cercana. No es una
 * funcionalidad "a demanda" (no va en Búsqueda, que es reactiva) ni
 * administrativa (no va en Gestión, que se abre a propósito a configurar
 * algo) — va en Home porque es la única pantalla que todos ven siempre al
 * entrar, sin tener que pensar en buscarla.
 *
 * No se agrega ningún campo nuevo: `Participante.fechaNacimiento` ya existe
 * y ya se usa para `calcularEdad` en repartoFamilias.ts — este archivo solo
 * resuelve "cuántos días faltan para el próximo cumpleaños", que es un
 * cálculo distinto (cíclico anual, no edad).
 */

/**
 * `fechaNacimiento` es "yyyy-MM-dd" — `new Date(string)` la interpreta como
 * UTC medianoche, que en una zona horaria con offset negativo (Lima,
 * UTC-5) cae en el día anterior al convertir a local. Se parsean los
 * componentes a mano para que "15" siempre sea el día 15, sin importar en
 * qué zona horaria corra el servidor/navegador.
 */
function parseFechaLocal(fecha: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Días hasta el próximo cumpleaños de `fechaNacimiento`, contando desde
 * `referencia` (0 = es hoy). Si ya pasó este año, calcula contra el del
 * año que viene. Devuelve null si la fecha es inválida o está vacía (dato
 * faltante — pasa con registros viejos/incompletos) para que el llamador
 * decida cómo tratarlo, en vez de ensuciar la lista con un "0 días" falso.
 *
 * 29 de febrero: en un año no bisiesto se corre al 1 de marzo (no "no
 * tiene cumpleaños esa vuelta") — mismo criterio que usan calendarios y
 * apps de contactos.
 */
export function diasHastaProximoCumple(fechaNacimiento: string, referencia: Date): number | null {
  const nacimiento = parseFechaLocal(fechaNacimiento);
  if (!nacimiento) return null;

  const hoy = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  const mes = nacimiento.getMonth();
  const dia = nacimiento.getDate();

  function cumpleEn(anio: number): Date {
    const d = new Date(anio, mes, dia);
    if (d.getMonth() !== mes) return new Date(anio, 2, 1); // 29-feb en año no bisiesto → 1-mar
    return d;
  }

  let proximo = cumpleEn(hoy.getFullYear());
  if (proximo.getTime() < hoy.getTime()) proximo = cumpleEn(hoy.getFullYear() + 1);

  const MS_DIA = 24 * 60 * 60 * 1000;
  return Math.round((proximo.getTime() - hoy.getTime()) / MS_DIA);
}

export interface CumpleanosProximo {
  participante: Participante;
  diasFaltantes: number; // 0 = hoy
  edadQueCumple: number;
}

/**
 * Participantes con cumpleaños hoy o dentro de `diasVentana` días, ordenados
 * del más próximo al más lejano (hoy primero). `diasVentana` es inclusive:
 * 7 significa "hoy + los próximos 7 días".
 */
export function calcularCumpleanosProximos(
  participantes: Participante[],
  referencia: Date,
  diasVentana: number
): CumpleanosProximo[] {
  const hoy = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  const resultado: CumpleanosProximo[] = [];
  for (const p of participantes) {
    const dias = diasHastaProximoCumple(p.fechaNacimiento, referencia);
    if (dias === null || dias > diasVentana) continue;
    const nacimiento = parseFechaLocal(p.fechaNacimiento);
    if (!nacimiento) continue;
    // El próximo cumpleaños cae este mismo año si todavía no pasó (o es
    // hoy); si ya pasó, cae el año que viene.
    const proximoCumpleEsEsteAnio =
      hoy.getMonth() < nacimiento.getMonth() ||
      (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() <= nacimiento.getDate());
    const edadQueCumple = (proximoCumpleEsEsteAnio ? hoy.getFullYear() : hoy.getFullYear() + 1) - nacimiento.getFullYear();
    resultado.push({ participante: p, diasFaltantes: dias, edadQueCumple: Math.max(edadQueCumple, 0) });
  }
  resultado.sort((a, b) => a.diasFaltantes - b.diasFaltantes);
  return resultado;
}
