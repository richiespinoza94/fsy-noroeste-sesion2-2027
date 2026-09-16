// El campo de texto libre "¿Alguna otra habilidad?" a veces se usa mal —
// alguien sin ninguna habilidad de las 3 opciones escribe "No" o "Ninguna"
// ahí, pensando que responde "no tengo" en vez de dejarlo vacío. Eso deja
// un array NO vacío (`['No']`) que técnicamente "tiene algo adentro", pero
// no representa experiencia real — hay que filtrarlo aparte, no solo
// revisar si el array tiene longitud.
const RESPUESTAS_SIN_EXPERIENCIA = new Set([
  'no', 'no tengo', 'ninguna', 'ninguno', 'ningun', 'ningúna', 'nada', 'n/a', 'na', '-', 'no aplica', 'no tengo ninguna',
  'no tengo experiencia', // la opción explícita del checkbox — se guarda en el mismo array, se filtra igual
]);

function esRespuestaNegativa(texto: string): boolean {
  return RESPUESTAS_SIN_EXPERIENCIA.has(texto.trim().toLowerCase());
}

/** ¿Esta lista de habilidades representa experiencia audiovisual real? (no solo "algo escrito"). */
export function tieneExperienciaAudiovisual(habilidades: string[] | undefined): boolean {
  if (!habilidades?.length) return false;
  return habilidades.some((h) => !esRespuestaNegativa(h));
}

/** Para mostrar en una ficha — las habilidades reales, sin las respuestas negativas. */
export function habilidadesParaMostrar(habilidades: string[] | undefined): string[] {
  return (habilidades || []).filter((h) => !esRespuestaNegativa(h));
}
