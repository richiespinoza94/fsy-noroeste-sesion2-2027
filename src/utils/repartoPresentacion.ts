import plantillaHtml from '../assets/reparto-presentacion.html?raw';
import audioUrl from '../assets/reparto-fondo.mp3';
import type { Companerismo, Familia, Participante } from '../types';

/**
 * Presentación oficial "Reparto de Compañías" — sigue al detalle
 * ESPECIFICACION-PRESENTACION-FSY.md (entregada aparte). Regla de oro del
 * spec: "no tocar CSS, funciones, textos fijos, paleta ni animaciones" —
 * `reparto-presentacion.html` es una copia byte a byte de la plantilla de
 * referencia, con UN solo cambio deliberado: el `src` del audio es un
 * placeholder (`__AUDIO_SRC__`) en vez de `audio/fondo.mp3`, porque esta
 * app entrega un único archivo .html descargable (no una carpeta con
 * `audio/` al lado) — así que el mp3 va embebido como base64, no aparte.
 * Todo lo demás del HTML (CSS, animaciones, paleta, textos) es intocado.
 *
 * El bloque de datos se reemplaza tal como indica el spec: TODO lo que
 * está entre "const EVENTO = {" y el "};" de "const COMPANIAS = [...]",
 * dentro de los comentarios DATOS:INICIO / DATOS:FIN que ya trae la
 * plantilla.
 *
 * No se pasa `color` por compañía a propósito — el spec dice "OPCIONAL;
 * si falta se asigna por orden" vía `PALETA_COMPANIAS` (ya en el HTML,
 * cálida: Yellow 10/20, Red 10, Yellow 30). Como las familias ya llegan
 * ordenadas (ver ordenarFamilias en familiasService.ts), la asignación
 * automática por orden coincide con "Compañía 1, 2, 3, 4" tal cual.
 */

// EVENTO — valores fijos de ESTA sesión, tal como los da el spec (sección 2).
// Si "Lima Noroeste" no es el nombre oficial de la zona, es el único lugar que hay que tocar.
const EVENTO = {
  anio: '2027',
  zona: 'Lima Noroeste',
  sesion: 'Sesión 2',
  lema: 'Regocíjate en Cristo',
  cita: 'Filipenses 4:4',
};

export interface FamiliaParaPresentacion {
  familia: Familia;
  companerismo: Companerismo[];
  participantes: Participante[]; // integrantes de esta familia
}

function jsStringify(companias: { nombre: string; coords: [string, string][]; integrantes: [string, string][] }[]): string {
  // JSON.stringify produce sintaxis JS válida (comillas dobles escapadas
  // incluidas) — el spec pide "O'Neil válido tal cual" y JSON.stringify
  // ya escapa cualquier comilla doble interna sin romper el string.
  return JSON.stringify(companias, null, 2);
}

async function audioComoBase64(): Promise<string> {
  const res = await fetch(audioUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string); // ya viene como "data:audio/mpeg;base64,...."
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generarPresentacionHtml(datos: FamiliaParaPresentacion[], todosParticipantes: Participante[]): Promise<string> {
  const companias = datos.map(({ familia, companerismo, participantes }) => {
    const coords = companerismo
      .flatMap((c) => [c.p1Id, c.p2Id])
      .filter(Boolean)
      .map((id) => todosParticipantes.find((p) => p.id === id))
      .filter((p): p is Participante => !!p)
      .map((p): [string, string] => [p.nombres, p.apellidos]);
    return {
      nombre: familia.customName || familia.nombre,
      coords,
      integrantes: participantes.map((p): [string, string] => [p.nombres, p.apellidos]),
    };
  });

  const datosJs = `const EVENTO = ${JSON.stringify(EVENTO, null, 2)};\nconst COMPANIAS = ${jsStringify(companias)};`;
  const audioBase64 = await audioComoBase64();

  return plantillaHtml
    .replace(/const EVENTO = \{[\s\S]*?\};\s*const COMPANIAS = \[[\s\S]*?\];/, datosJs)
    .replace('__AUDIO_SRC__', audioBase64);
}
