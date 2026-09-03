// Misma lista y mismos barrios confirmados que en el backend de CONFEJAS 2026,
// más los barrios de Pro Lima (agregados para FSY 2027 — junto con Ventanilla
// y Puente Piedra, es una de las 3 estacas foco de esta sesión de preparación).
// `null` = estaca sin barrios confirmados todavía → el formulario cae a un
// input libre de texto en vez de un <select>.
export const ESTACAS_DATA: Record<string, string[] | null> = {
  Ventanilla: ['Ventanilla', 'Los Álamos', 'Naval', 'Angamos', 'Pedro Beltrán', 'Mi Perú'],
  'Puente Piedra': ['Zapallal 1', 'Zapallal 2', 'Las Lomas', 'Arenas', 'Puente Piedra'],
  'Pro Lima': ['Barrio Laderas', 'San Diego', 'Famesa 1', 'ProLima 1', 'ProLima 2', 'Ensenada', 'Santa Rosa'],
  Miramar: ['Pachacutec', 'Villas de Ancón', 'Los Cedros', 'Santa Rosa', 'Los Rosales'],
  Naranjal: ['Canta Callao', 'Huandoy', 'Los Próceres', 'Márquez', 'Naranjal', 'Oquendo'],
  Barranca: null,
  'El Olivar': null,
  Huacho: null,
  Huaral: null,
  'Las Palmeras': null,
  'Los Olivos': null,
};

export const TODAS_LAS_ESTACAS = Object.keys(ESTACAS_DATA).sort();

// Esta sesión FSY es específicamente para 3 estacas — se muestran primero en
// el selector del registro, el resto queda detrás de "Otra estaca…".
export const ESTACAS_PRINCIPALES = ['Ventanilla', 'Puente Piedra', 'Pro Lima'];
export const ESTACAS_SECUNDARIAS = TODAS_LAS_ESTACAS.filter((e) => !ESTACAS_PRINCIPALES.includes(e));
