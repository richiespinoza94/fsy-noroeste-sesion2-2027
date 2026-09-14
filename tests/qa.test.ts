// QA — Gestión FSY 2027. Correr con: npx tsx tests/qa.test.ts
import assert from 'node:assert';
import {
  nameKey,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  validateEmail,
  validatePhone,
} from '../src/utils/validation';
import { estadoVentanaCheckIn, getCapacitacionParaCheckIn, getNextCapacitacion } from '../src/services/capacitacionesService';
import { fuzzyIncludes } from '../src/utils/search';
import { ESTACAS_DATA, ESTACAS_PRINCIPALES, ESTACAS_SECUNDARIAS, FILTRO_OTRAS, TODAS_LAS_ESTACAS, estacaEnFiltro } from '../src/data/estacas';
import type { Capacitacion } from '../src/types';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

// ── Validación y normalización de datos del formulario ─────────────────────

test('1. validatePhone acepta celular peruano de 9 dígitos empezando en 9', () => {
  assert.strictEqual(validatePhone('987654321'), true);
  assert.strictEqual(validatePhone('123456789'), false);
  assert.strictEqual(validatePhone('98765432'), false);
});

test('2. validatePhone rechaza 9 dígitos que no empiezan en 9', () => {
  assert.strictEqual(validatePhone('812345678'), false);
});

test('3. validateEmail rechaza formatos inválidos', () => {
  assert.strictEqual(validateEmail('a@b.com'), true);
  assert.strictEqual(validateEmail('sin-arroba.com'), false);
});

test('4. normalizePhone deja solo dígitos y trunca a 9', () => {
  assert.strictEqual(normalizePhone('987-654-321 '), '987654321');
  assert.strictEqual(normalizePhone('9876543219999'), '987654321');
});

test('5. normalizeEmail baja a minúsculas y recorta espacios', () => {
  assert.strictEqual(normalizeEmail('  Ana@Correo.COM '), 'ana@correo.com');
});

test('6. normalizeName capitaliza cada palabra sin tocar tildes ni guiones', () => {
  assert.strictEqual(normalizeName('maría josé pérez-lópez'), 'María José Pérez-López');
});

test('7. normalizeName con un solo nombre (sin apellido) no revienta', () => {
  assert.strictEqual(normalizeName('ana'), 'Ana');
});

test('8. nameKey compara nombres sin tildes ni mayúsculas (detección de duplicados)', () => {
  assert.strictEqual(nameKey('Saúl', 'García'), nameKey('saul', 'GARCIA'));
});

test('9. nameKey ignora espacios extra entre nombre y apellido', () => {
  assert.strictEqual(nameKey('Ana', 'Perez'), nameKey('Ana  ', '  Perez'));
});

// ── Búsqueda difusa (usada en Búsqueda del staff y en el check-in público) ──

test('10. fuzzyIncludes encuentra por substring o inicio de palabra, sin tildes ni mayúsculas', () => {
  assert.strictEqual(fuzzyIncludes('María José Pérez López', 'perez'), true);
  assert.strictEqual(fuzzyIncludes('María José Pérez López', 'JOSE'), true);
  assert.strictEqual(fuzzyIncludes('María José Pérez López', 'garcia'), false);
});

test('11. fuzzyIncludes con query vacío siempre devuelve true', () => {
  assert.strictEqual(fuzzyIncludes('cualquier cosa', ''), true);
  assert.strictEqual(fuzzyIncludes('cualquier cosa', '   '), true);
});

test('12. fuzzyIncludes encuentra el apellido aunque se busque solo por eso, no por el nombre completo', () => {
  assert.strictEqual(fuzzyIncludes('Kevin Alexander Garcia', 'garcia'), true);
});

// ── Estacas y barrios ────────────────────────────────────────────────────────

test('13. ESTACAS_DATA — estacas con barrios confirmados vs. input libre', () => {
  assert.deepStrictEqual(ESTACAS_DATA.Ventanilla, ['Ventanilla', 'Los Álamos', 'Naval', 'Angamos', 'Pedro Beltrán', 'Mi Perú']);
  assert.strictEqual(ESTACAS_DATA['El Olivar'], null);
  assert.strictEqual(TODAS_LAS_ESTACAS.length, 11);
});

test('14. Pro Lima tiene sus 7 barrios específicos de esta sesión FSY', () => {
  assert.strictEqual(ESTACAS_DATA['Pro Lima']?.length, 7);
  assert.ok(ESTACAS_DATA['Pro Lima']?.includes('Ensenada'));
});

test('15. ESTACAS_PRINCIPALES + ESTACAS_SECUNDARIAS cubren las 11 estacas, sin duplicados ni faltantes', () => {
  const todas = [...ESTACAS_PRINCIPALES, ...ESTACAS_SECUNDARIAS].sort();
  assert.deepStrictEqual(todas, TODAS_LAS_ESTACAS);
  assert.strictEqual(ESTACAS_PRINCIPALES.length, 3);
  assert.strictEqual(new Set(todas).size, 11); // sin duplicados
});

// ── getNextCapacitacion ──────────────────────────────────────────────────────

test('16. getNextCapacitacion prioriza la futura más próxima', () => {
  const caps: Capacitacion[] = [
    { id: '1', label: 'Pasada', fecha: '2020-01-01', hora: '09:00', lugar: 'X', oficial: true },
    { id: '2', label: 'Futura lejana', fecha: '2099-01-01', hora: '09:00', lugar: 'X', oficial: true },
    { id: '3', label: 'Futura próxima', fecha: '2030-01-01', hora: '09:00', lugar: 'X', oficial: true },
  ];
  assert.strictEqual(getNextCapacitacion(caps)?.id, '3');
});

test('17. getNextCapacitacion cae a la pasada más reciente si no hay futuras', () => {
  const caps: Capacitacion[] = [
    { id: '1', label: 'Muy pasada', fecha: '2019-01-01', hora: '09:00', lugar: 'X', oficial: true },
    { id: '2', label: 'Pasada reciente', fecha: '2024-06-01', hora: '09:00', lugar: 'X', oficial: true },
  ];
  assert.strictEqual(getNextCapacitacion(caps)?.id, '2');
});

test('18. getNextCapacitacion con lista vacía devuelve null', () => {
  assert.strictEqual(getNextCapacitacion([]), null);
});

test('19. getNextCapacitacion con fecha inválida no revienta — cae al primer elemento', () => {
  const caps: Capacitacion[] = [{ id: '1', label: 'Rota', fecha: 'no-es-una-fecha', hora: '09:00', lugar: 'X', oficial: true }];
  assert.strictEqual(getNextCapacitacion(caps)?.id, '1');
});

// ── Ventana de check-in automático (público, sin login) ─────────────────────
// Capacitación de referencia: 25 enero 2027, 18:00. Ventana: 17:00–21:00
// (1h antes del inicio, hasta 3h después de que empieza).

const CAP_REF: Capacitacion = { id: 'ref', label: 'Capacitación', fecha: '2027-01-25', hora: '18:00', lugar: 'X', oficial: true };

test('20. estadoVentanaCheckIn — sin capacitación devuelve sin_fecha', () => {
  assert.strictEqual(estadoVentanaCheckIn(null), 'sin_fecha');
});

test('21. estadoVentanaCheckIn — capacitación sin fecha devuelve sin_fecha', () => {
  assert.strictEqual(estadoVentanaCheckIn({ ...CAP_REF, fecha: '' }), 'sin_fecha');
});

test('22. estadoVentanaCheckIn — el caso de las 4:30pm de Ricardo (30 min antes de que abra) es muy_temprano', () => {
  const ahora = new Date('2027-01-25T16:30:00');
  assert.strictEqual(estadoVentanaCheckIn(CAP_REF, ahora), 'muy_temprano');
});

test('23. estadoVentanaCheckIn — 1 segundo antes de la apertura (17:00) sigue siendo muy_temprano', () => {
  const ahora = new Date('2027-01-25T16:59:59');
  assert.strictEqual(estadoVentanaCheckIn(CAP_REF, ahora), 'muy_temprano');
});

test('24. estadoVentanaCheckIn — exactamente en la apertura (1h antes) ya está abierta', () => {
  const ahora = new Date('2027-01-25T17:00:00');
  assert.strictEqual(estadoVentanaCheckIn(CAP_REF, ahora), 'abierta');
});

test('25. estadoVentanaCheckIn — a la hora de inicio está abierta', () => {
  const ahora = new Date('2027-01-25T18:00:00');
  assert.strictEqual(estadoVentanaCheckIn(CAP_REF, ahora), 'abierta');
});

test('26. estadoVentanaCheckIn — exactamente en el cierre (3h después del inicio) todavía está abierta', () => {
  const ahora = new Date('2027-01-25T21:00:00');
  assert.strictEqual(estadoVentanaCheckIn(CAP_REF, ahora), 'abierta');
});

test('27. estadoVentanaCheckIn — 1 segundo después del cierre ya está cerrada', () => {
  const ahora = new Date('2027-01-25T21:00:01');
  assert.strictEqual(estadoVentanaCheckIn(CAP_REF, ahora), 'cerrada');
});

test('28. estadoVentanaCheckIn — mucho después (al día siguiente) sigue cerrada', () => {
  const ahora = new Date('2027-01-26T10:00:00');
  assert.strictEqual(estadoVentanaCheckIn(CAP_REF, ahora), 'cerrada');
});

test('29. estadoVentanaCheckIn — sin hora especificada usa 00:00 como referencia', () => {
  const capSinHora: Capacitacion = { ...CAP_REF, hora: '' };
  const ahora = new Date('2027-01-25T00:30:00'); // 30 min después de medianoche
  assert.strictEqual(estadoVentanaCheckIn(capSinHora, ahora), 'abierta');
});

test('30. estadoVentanaCheckIn — capacitación que empieza a las 23:30 sigue abierta pasada la medianoche', () => {
  // Válida el fix de usar datetime completo en vez de comparar solo el string
  // de fecha: "ahora" cae en el día calendario SIGUIENTE al de la capacitación,
  // pero sigue dentro de las 3 horas desde que empezó.
  const capNocturna: Capacitacion = { ...CAP_REF, hora: '23:30' };
  const ahora = new Date('2027-01-26T01:00:00'); // 1.5h después de que empezó
  assert.strictEqual(estadoVentanaCheckIn(capNocturna, ahora), 'abierta');
});

// ── getCapacitacionParaCheckIn — cuál se muestra en el check-in público ─────
// (distinta de getNextCapacitacion: no debe saltar a una futura lejana si
// hoy hay/hubo una relevante — ver bug real reportado por Ricardo)

test('31. getCapacitacionParaCheckIn — con una abierta y otra futura lejana, elige la abierta', () => {
  const caps: Capacitacion[] = [
    { id: 'hoy', label: 'Hoy', fecha: '2027-01-25', hora: '18:00', lugar: 'X', oficial: true },
    { id: 'lejana', label: 'Lejana', fecha: '2027-02-10', hora: '18:00', lugar: 'X', oficial: true },
  ];
  const ahora = new Date('2027-01-25T18:30:00'); // dentro de la ventana de "Hoy"
  assert.strictEqual(getCapacitacionParaCheckIn(caps, ahora)?.id, 'hoy');
});

test('32. getCapacitacionParaCheckIn — caso real de Ricardo: "Prueba" de hoy ya cerrada vs. "Charla" en 3 días, elige "Prueba" (la cercana), no salta a la lejana', () => {
  const caps: Capacitacion[] = [
    { id: 'prueba', label: 'Prueba', fecha: '2026-09-03', hora: '11:00', lugar: 'mi casa', oficial: true },
    { id: 'charla', label: 'Charla Informativa Puente Piedra', fecha: '2026-09-06', hora: '17:00', lugar: 'Barrio Puente Piedra', oficial: true },
  ];
  const ahora = new Date('2026-09-03T20:00:00'); // "Prueba" ya cerró su ventana (11:00 + 3h = 14:00)
  const elegida = getCapacitacionParaCheckIn(caps, ahora);
  assert.strictEqual(elegida?.id, 'prueba');
  assert.strictEqual(estadoVentanaCheckIn(elegida, ahora), 'cerrada');
  // Antes del fix, esto elegía "charla" (getNextCapacitacion prefiere cualquier
  // futura) y mostraba "muy temprano" sobre algo a 3 días de distancia.
});

test('33. getCapacitacionParaCheckIn — con lista vacía devuelve null', () => {
  assert.strictEqual(getCapacitacionParaCheckIn([]), null);
});

test('34. getCapacitacionParaCheckIn — con dos abiertas a la vez, elige la más cercana a "ahora"', () => {
  const caps: Capacitacion[] = [
    { id: 'a', label: 'A', fecha: '2027-01-25', hora: '17:30', lugar: 'X', oficial: true },
    { id: 'b', label: 'B', fecha: '2027-01-25', hora: '18:30', lugar: 'X', oficial: true },
  ];
  const ahora = new Date('2027-01-25T18:15:00'); // ambas en ventana; B está más cerca (15 min vs 45 min)
  assert.strictEqual(getCapacitacionParaCheckIn(caps, ahora)?.id, 'b');
});

// ── Filtro de estaca en Búsqueda/Reportes (Ventanilla/Puente Piedra/Pro Lima/Otras) ─

test('35. estacaEnFiltro — filtro vacío ("Todas") acepta cualquier estaca', () => {
  assert.strictEqual(estacaEnFiltro('Ventanilla', ''), true);
  assert.strictEqual(estacaEnFiltro('Huacho', ''), true);
});

test('36. estacaEnFiltro — filtro de una estaca principal solo acepta esa exacta', () => {
  assert.strictEqual(estacaEnFiltro('Ventanilla', 'Ventanilla'), true);
  assert.strictEqual(estacaEnFiltro('Puente Piedra', 'Ventanilla'), false);
});

test('37. estacaEnFiltro — FILTRO_OTRAS acepta cualquier estaca fuera de las 3 principales', () => {
  assert.strictEqual(estacaEnFiltro('Huacho', FILTRO_OTRAS), true);
  assert.strictEqual(estacaEnFiltro('Miramar', FILTRO_OTRAS), true);
  assert.strictEqual(estacaEnFiltro('Ventanilla', FILTRO_OTRAS), false);
  assert.strictEqual(estacaEnFiltro('Pro Lima', FILTRO_OTRAS), false);
});

console.log(`\n${passed} pruebas pasaron.`);
