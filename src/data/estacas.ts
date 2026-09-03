// Misma lista y mismos barrios confirmados que en el backend de CONFEJAS 2026.
// `null` = estaca sin barrios confirmados todavía → el formulario cae a un
// input libre de texto en vez de un <select>.
export const ESTACAS_DATA: Record<string, string[] | null> = {
  Ventanilla: ['Ventanilla', 'Los Álamos', 'Naval', 'Angamos', 'Pedro Beltrán', 'Mi Perú'],
  'Puente Piedra': ['Zapallal 1', 'Zapallal 2', 'Las Lomas', 'Arenas', 'Puente Piedra'],
  Miramar: ['Pachacutec', 'Villas de Ancón', 'Los Cedros', 'Santa Rosa', 'Los Rosales'],
  Naranjal: ['Canta Callao', 'Huandoy', 'Los Próceres', 'Márquez', 'Naranjal', 'Oquendo'],
  Barranca: null,
  'El Olivar': null,
  Huacho: null,
  Huaral: null,
  'Las Palmeras': null,
  'Los Olivos': null,
  'Pro Lima': null,
};

export const TODAS_LAS_ESTACAS = Object.keys(ESTACAS_DATA).sort();
