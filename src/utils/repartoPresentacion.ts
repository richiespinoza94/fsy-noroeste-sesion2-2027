import plantillaHtml from '../assets/reparto-presentacion.html?raw';
import type { Companerismo, Familia, Participante } from '../types';

/**
 * La presentación de burbujas para proyectar en el cierre de la
 * capacitación — mismo diseño ya validado contra la guía de marca FSY 2027
 * (ver src/assets/reparto-presentacion.html), acá solo se inyectan los
 * datos reales en los 2 puntos marcados con comentarios placeholder.
 *
 * Colores de identidad: 4 tonos FIJOS de la paleta secundaria oficial
 * (Blue20→Blue25, Green20, Yellow20, Yellow30) — evitan Rojo/Rosa por
 * completo a propósito, para que nunca puedan chocar con el Verde (la
 * combinación que la guía de marca prohíbe). Es una excepción documentada
 * y aprobada al límite de "máximo 3 colores por pieza": son 4 identidades
 * de marca permanentes, no colores decorativos sueltos. Si algún día hay
 * más de 4 compañías, las que sobren repiten el último color — caso raro,
 * no vale la pena una 5ta identidad de marca para eso.
 */
const COLORES_OFICIALES: { color: string; dark: string }[] = [
  { color: '#01B6D1', dark: '#007DA5' }, // Blue 20 → Blue 25 (ambos oficiales)
  { color: '#6DB344', dark: '#4E8030' }, // Green 20 oficial + oscuro calculado
  { color: '#F68D2E', dark: '#B16521' }, // Yellow 20 oficial + oscuro calculado
  { color: '#D45311', dark: '#983B0C' }, // Yellow 30 oficial + oscuro calculado
];

export interface FamiliaParaPresentacion {
  familia: Familia;
  companerismo: Companerismo[];
  participantes: Participante[]; // miembros de esta familia, en el orden a mostrar
}

export function generarPresentacionHtml(datos: FamiliaParaPresentacion[], todosParticipantes: Participante[], nombreEvento: string, lema: string): string {
  const companias = datos.map(({ familia, companerismo, participantes }, i) => {
    const colorPar = COLORES_OFICIALES[Math.min(i, COLORES_OFICIALES.length - 1)];
    const coords = companerismo
      .flatMap((c) => [c.p1Id, c.p2Id])
      .filter(Boolean)
      .map((id) => todosParticipantes.find((p) => p.id === id))
      .filter((p): p is Participante => !!p)
      .map((p) => [p.nombres, p.apellidos]);
    return {
      nombre: familia.customName || familia.nombre,
      color: colorPar.color,
      dark: colorPar.dark,
      coords,
      integrantes: participantes.map((p) => [p.nombres, p.apellidos]),
    };
  });

  const eventoJson = JSON.stringify({ nombre: nombreEvento, sesion: '', lema });
  const companiasJson = JSON.stringify(companias);

  return plantillaHtml
    .replace(/\/\*__EVENTO_JSON__\*\/.*?\/\*__FIN_EVENTO__\*\//s, eventoJson)
    .replace(/\/\*__COMPANIAS_JSON__\*\/.*?\/\*__FIN_COMPANIAS__\*\//s, companiasJson);
}
