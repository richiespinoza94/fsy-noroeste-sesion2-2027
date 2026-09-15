// Apellidos peruanos compuestos con partícula ("De La Cruz", "Del Castillo",
// "De Los Santos") son comunes — cortar por la primera palabra a secas daría
// "De" solo, perdiendo el apellido real. Se arrastran las partículas hasta
// la primera palabra que no lo sea, y esa es la unidad completa del primer
// apellido.
const PARTICULAS_APELLIDO = new Set(['de', 'del', 'la', 'las', 'los']);

export function primerNombre(nombres: string): string {
  return nombres.trim().split(/\s+/)[0] || '';
}

export function primerApellido(apellidos: string): string {
  const palabras = apellidos.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '';
  const resultado: string[] = [];
  let i = 0;
  while (i < palabras.length && PARTICULAS_APELLIDO.has(palabras[i].toLowerCase())) {
    resultado.push(palabras[i]);
    i++;
  }
  if (i < palabras.length) resultado.push(palabras[i]);
  return resultado.join(' ');
}

/** "Benjamin Cesar" + "Gamarra Dioses" → "Benjamin Gamarra" — para filas de lista compactas, no reemplaza el nombre completo en fichas/CSV. */
export function nombreCorto(nombres: string, apellidos: string): string {
  return `${primerNombre(nombres)} ${primerApellido(apellidos)}`.trim();
}
