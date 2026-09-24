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
import { estadoVentanaCheckIn, getCapacitacionParaAutoMarcar, getCapacitacionParaCheckIn, getCapacitacionParaHome, getNextCapacitacion } from '../src/services/capacitacionesService';
import { fuzzyIncludes } from '../src/utils/search';
import { calcularCompromiso } from '../src/utils/compromiso';
import { calcularAsistenciaPorCapacitacion, promedioAsistencia } from '../src/utils/asistenciaStats';
import {
  calcularCandidatosPorRol,
  calcularEdad,
  calcularEstadisticas,
  esElegibleReparto,
  grupoEstacaReparto,
  repartirEnFamilias,
  repartoCompleto,
  type CandidatoReparto,
  type FuenteReparto,
} from '../src/utils/repartoFamilias';
import { nombreConInicialMaterna, nombreCorto, primerApellido, primerNombre } from '../src/utils/nombreCorto';
import { habilidadesParaMostrar, tieneExperienciaAudiovisual } from '../src/utils/audiovisual';
import type { Asistencia, Capacitacion, Participante } from '../src/types';
import { ESTACAS_DATA, ESTACAS_PRINCIPALES, ESTACAS_SECUNDARIAS, FILTRO_OTRAS, TODAS_LAS_ESTACAS, estacaEnFiltro } from '../src/data/estacas';
import type { Asistencia, Capacitacion, Participante } from '../src/types';

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

// ── calcularCompromiso — elegibilidad, tasa, cobertura, racha ──────────────

function capFake(id: string, fecha: string, hora = '18:00'): Capacitacion {
  return { id, label: `Cap ${id}`, fecha, hora, lugar: 'X', oficial: true };
}
function participanteFake(timestamp: string): Participante {
  return {
    id: 'p1', timestamp, nombres: 'Test', apellidos: 'Persona', fechaNacimiento: '2005-01-01',
    telefono: '987654321', correo: 'test@correo.com', estaca: 'Ventanilla', barrio: 'Ventanilla',
    genero: 'H', experienciaPrevia: 'ninguna', asignacionAnterior: '', disponibilidad: 'si',
    asignacion: 'Consejero', familiaId: '',
  };
}
// 18 capacitaciones, una por día de enero 2027 (del 1 al 18) a las 18:00.
const CAPS_18 = Array.from({ length: 18 }, (_, i) => capFake(String(i + 1), `2027-01-${String(i + 1).padStart(2, '0')}`));
// "Ahora" fijo, posterior a las 18 — para las pruebas que asumen que todas
// las capacitaciones de CAPS_18 ya ocurrieron (si no se fija, la prueba
// #49 de abajo demuestra por qué eso cambia el resultado).
const AHORA_DESPUES_DE_TODAS = new Date('2027-01-20T00:00:00');

test('38. calcularCompromiso — caso de ejemplo de Ricardo: se registra en la #14 de 18, quedan 5 elegibles', () => {
  const p = participanteFake(new Date('2027-01-14T18:00:00').toISOString());
  const c = calcularCompromiso(p, CAPS_18, [], AHORA_DESPUES_DE_TODAS);
  assert.strictEqual(c.elegibles, 5); // 14, 15, 16, 17, 18
  assert.strictEqual(c.totalCapacitaciones, 18);
  assert.strictEqual(c.cobertura, 5 / 18);
});

test('39. calcularCompromiso — tasa de asistencia sobre elegibles (4 de 5 = 80%)', () => {
  const p = participanteFake(new Date('2027-01-14T18:00:00').toISOString());
  const asistencia: Asistencia[] = [
    { capacitacionId: '14', participanteId: 'p1', estado: 'presente', timestamp: '' },
    { capacitacionId: '15', participanteId: 'p1', estado: 'presente', timestamp: '' },
    { capacitacionId: '16', participanteId: 'p1', estado: 'ausente', timestamp: '' },
    { capacitacionId: '17', participanteId: 'p1', estado: 'presente', timestamp: '' },
    { capacitacionId: '18', participanteId: 'p1', estado: 'presente', timestamp: '' },
  ];
  const c = calcularCompromiso(p, CAPS_18, asistencia, AHORA_DESPUES_DE_TODAS);
  assert.strictEqual(c.asistencias, 4);
  assert.strictEqual(c.inasistencias, 1);
  assert.strictEqual(c.tasaAsistencia, 4 / 5);
  assert.strictEqual(c.rachaPerfecta, false);
});

test('40. calcularCompromiso — racha perfecta cuando asistió a TODAS sus elegibles', () => {
  const p = participanteFake(new Date('2027-01-17T18:00:00').toISOString());
  const asistencia: Asistencia[] = [
    { capacitacionId: '17', participanteId: 'p1', estado: 'presente', timestamp: '' },
    { capacitacionId: '18', participanteId: 'p1', estado: 'presente', timestamp: '' },
  ];
  const c = calcularCompromiso(p, CAPS_18, asistencia, AHORA_DESPUES_DE_TODAS);
  assert.strictEqual(c.elegibles, 2);
  assert.strictEqual(c.asistencias, 2);
  assert.strictEqual(c.rachaPerfecta, true);
});

test('41. calcularCompromiso — sin elegibles todavía (se registró después de la última), tasa es null y no cuenta como racha', () => {
  const p = participanteFake(new Date('2027-02-01T00:00:00').toISOString());
  const c = calcularCompromiso(p, CAPS_18, [], new Date('2027-02-05T00:00:00'));
  assert.strictEqual(c.elegibles, 0);
  assert.strictEqual(c.tasaAsistencia, null);
  assert.strictEqual(c.rachaPerfecta, false); // 0 elegibles no es "racha", es "todavía no aplica"
});

test('42. calcularCompromiso — una asistencia marcada por un admin fuera de la ventana normal SÍ cuenta (la evidencia real gana)', () => {
  // Se registró en la #14, pero un admin marcó su asistencia a la #5
  // manualmente desde Asistencia, fuera de tiempo — debe contar igual: si
  // el admin la marcó, el cálculo de compromiso confía en eso.
  const p = participanteFake(new Date('2027-01-14T18:00:00').toISOString());
  const asistencia: Asistencia[] = [{ capacitacionId: '5', participanteId: 'p1', estado: 'presente', timestamp: '' }];
  const c = calcularCompromiso(p, CAPS_18, asistencia, AHORA_DESPUES_DE_TODAS);
  assert.strictEqual(c.asistencias, 1);
  assert.strictEqual(c.elegibles, 6); // las 5 normales (14-18) + la #5 por la asistencia real
});

test('49. calcularCompromiso — caso real reportado: una capacitación futura ya creada NO cuenta como elegible todavía', () => {
  // Exactamente el bug que reportó Ricardo con captura: dos capacitaciones
  // creadas (13.09.2026 y 20.09.2026), pero "ahora" cae DESPUÉS de la
  // primera y ANTES de la segunda — la segunda todavía no ocurrió, no
  // puede contar en contra de nadie aunque ya esté creada en el sistema.
  const p = participanteFake(new Date('2026-09-01T00:00:00').toISOString());
  const caps = [capFake('c1', '2026-09-13'), capFake('c2', '2026-09-20')];
  const ahora = new Date('2026-09-14T12:00:00'); // después de c1, antes de c2
  const asistencia: Asistencia[] = [{ capacitacionId: 'c1', participanteId: 'p1', estado: 'presente', timestamp: '' }];
  const c = calcularCompromiso(p, caps, asistencia, ahora);
  assert.strictEqual(c.elegibles, 1); // solo c1 — c2 no ha pasado
  assert.strictEqual(c.asistencias, 1);
  assert.strictEqual(c.tasaAsistencia, 1); // 100%, no 50%
  assert.strictEqual(c.totalCapacitaciones, 2); // esto sí sigue contando las 2 (responde otra pregunta)
});

test('57. calcularCompromiso — se registra DURANTE una capacitación en curso (auto-marcado): esa capacitación cuenta como elegible aunque su timestamp quede después', () => {
  // Caso real reportado con captura: 4 personas asistieron de verdad (se
  // registraron a mitad de la capacitación, vía el auto-marcado del
  // registro) pero aparecían con "0/0 asistencias" — porque su timestamp
  // de registro (18:20) queda DESPUÉS de la hora de inicio de la
  // capacitación (18:00) a la que sí asistieron en ese mismo momento.
  const cap = capFake('c1', '2026-09-13', '18:00');
  const p = participanteFake(new Date('2026-09-13T18:20:00').toISOString()); // se registró 20 min después de que empezó
  const asistencia: Asistencia[] = [{ capacitacionId: 'c1', participanteId: 'p1', estado: 'presente', timestamp: '' }];
  const ahora = new Date('2026-09-13T19:00:00');
  const c = calcularCompromiso(p, [cap], asistencia, ahora);
  assert.strictEqual(c.elegibles, 1); // no 0 — hay evidencia real de que sí fue
  assert.strictEqual(c.asistencias, 1);
  assert.strictEqual(c.tasaAsistencia, 1); // 100%, no null/0%
});

test('58. calcularCompromiso — una capacitación anterior al registro SIN asistencia real sigue sin contar (la excepción es solo con evidencia)', () => {
  // Confirma que el fix del caso 57 no abre la puerta a contar cualquier
  // capacitación pasada — solo cuenta si hay un registro real de "presente".
  const cap = capFake('c1', '2026-09-13', '18:00');
  const p = participanteFake(new Date('2026-09-13T18:20:00').toISOString());
  const c = calcularCompromiso(p, [cap], [], new Date('2026-09-13T19:00:00'));
  assert.strictEqual(c.elegibles, 0);
  assert.strictEqual(c.tasaAsistencia, null);
});

// ── getCapacitacionParaAutoMarcar — ¿debe marcar asistencia automática al
// registrarse por primera vez? Separado de estadoVentanaCheckIn/
// getCapacitacionParaCheckIn a propósito: aunque por dentro reusa esas dos,
// es la decisión específica que toma RegistroWizard al enviar el
// formulario, y merece sus propios casos — no alcanza con que las piezas
// de abajo ya estén probadas por separado.

test('43. getCapacitacionParaAutoMarcar — llena el formulario SIN ninguna ventana de capacitación activa → no marca (null)', () => {
  // La capacitación de referencia es a las 18:00 (ventana 17:00–21:00);
  // a las 15:00 todavía no abre.
  const ahora = new Date('2027-01-25T15:00:00');
  assert.strictEqual(getCapacitacionParaAutoMarcar([CAP_REF], ahora), null);
});

test('44. getCapacitacionParaAutoMarcar — llena el formulario CON la ventana de capacitación activa → marca esa capacitación', () => {
  const ahora = new Date('2027-01-25T18:30:00'); // dentro de la ventana
  const cap = getCapacitacionParaAutoMarcar([CAP_REF], ahora);
  assert.strictEqual(cap?.id, 'ref');
});

test('45. getCapacitacionParaAutoMarcar — la ventana ya cerró cuando llena el formulario → no marca (null)', () => {
  const ahora = new Date('2027-01-25T22:00:00'); // 1h después del cierre (21:00)
  assert.strictEqual(getCapacitacionParaAutoMarcar([CAP_REF], ahora), null);
});

test('46. getCapacitacionParaAutoMarcar — sin ninguna capacitación creada todavía → no marca (null)', () => {
  assert.strictEqual(getCapacitacionParaAutoMarcar([], new Date('2027-01-25T18:30:00')), null);
});

test('47. getCapacitacionParaAutoMarcar — justo en el borde de apertura (1h antes exacto) SÍ marca', () => {
  const ahora = new Date('2027-01-25T17:00:00'); // exactamente cuando abre
  assert.strictEqual(getCapacitacionParaAutoMarcar([CAP_REF], ahora)?.id, 'ref');
});

test('48. getCapacitacionParaAutoMarcar — justo en el borde de cierre (3h después exacto) SÍ marca, 1 segundo más tarde no', () => {
  assert.strictEqual(getCapacitacionParaAutoMarcar([CAP_REF], new Date('2027-01-25T21:00:00'))?.id, 'ref');
  assert.strictEqual(getCapacitacionParaAutoMarcar([CAP_REF], new Date('2027-01-25T21:00:01')), null);
});

// ── nombreCorto — primer nombre + primer apellido, sin cortar partículas ──

test('50. primerApellido — apellido simple sin partícula, corta al primero (descarta el materno)', () => {
  assert.strictEqual(primerApellido('Gamarra Dioses'), 'Gamarra');
});

test('51. primerApellido — "De La Cruz Rodriguez" no se corta en "De" — arrastra la partícula completa', () => {
  assert.strictEqual(primerApellido('De La Cruz Rodriguez'), 'De La Cruz');
});

test('52. primerApellido — "Del Carmen Flores" arrastra "Del" con el nombre que sigue', () => {
  assert.strictEqual(primerApellido('Del Carmen Flores'), 'Del Carmen');
});

test('53. primerApellido — "De Los Santos Pardo", dos partículas seguidas antes del nombre real', () => {
  assert.strictEqual(primerApellido('De Los Santos Pardo'), 'De Los Santos');
});

test('54. primerApellido — un solo apellido (sin materno) se queda igual', () => {
  assert.strictEqual(primerApellido('Pérez'), 'Pérez');
});

test('55. primerNombre — nombre compuesto se corta al primero', () => {
  assert.strictEqual(primerNombre('Maria Jose'), 'Maria');
});

test('56. nombreCorto — junta primer nombre + primer apellido completo', () => {
  assert.strictEqual(nombreCorto('Benjamin Cesar', 'Gamarra Dioses'), 'Benjamin Gamarra');
  assert.strictEqual(nombreCorto('Ana', 'De La Cruz Rodriguez'), 'Ana De La Cruz');
});

test('59. calcularCompromiso — caso real: registro después de ambas capacitaciones, asistencia marcada a mano desde Asistencia — 100%, no "—"', () => {
  // El caso exacto de Dulce/Yulissa en la captura: se registraron después
  // de que ambas capacitaciones ya habían pasado (por eso "Elegible en 0/2"
  // con la lógica vieja), pero un admin les marcó presente a mano en una de
  // ellas desde Asistencia. Debe verse 100%, no "—".
  const caps = [capFake('c1', '2026-09-13', '18:00'), capFake('c2', '2026-09-20', '18:00')];
  const p = participanteFake(new Date('2026-09-25T00:00:00').toISOString()); // se registró después de las dos
  const asistencia: Asistencia[] = [{ capacitacionId: 'c1', participanteId: 'p1', estado: 'presente', timestamp: '' }];
  const c = calcularCompromiso(p, caps, asistencia, new Date('2026-09-26T00:00:00'));
  assert.strictEqual(c.elegibles, 1);
  assert.strictEqual(c.asistencias, 1);
  assert.strictEqual(c.tasaAsistencia, 1);
});

// ── tieneExperienciaAudiovisual — no confundir "escribió algo" con "tiene experiencia" ─

test('60. tieneExperienciaAudiovisual — caso real reportado: escribió "No" en el texto libre, no cuenta como experiencia', () => {
  assert.strictEqual(tieneExperienciaAudiovisual(['No']), false);
});

test('61. tieneExperienciaAudiovisual — array vacío o sin datos no cuenta', () => {
  assert.strictEqual(tieneExperienciaAudiovisual([]), false);
  assert.strictEqual(tieneExperienciaAudiovisual(undefined), false);
});

test('62. tieneExperienciaAudiovisual — una habilidad real de la lista de checkboxes sí cuenta', () => {
  assert.strictEqual(tieneExperienciaAudiovisual(['Edición de video']), true);
});

test('63. tieneExperienciaAudiovisual — variantes de "ninguna"/"n/a" tampoco cuentan, sin importar mayúsculas o espacios', () => {
  assert.strictEqual(tieneExperienciaAudiovisual(['Ninguna']), false);
  assert.strictEqual(tieneExperienciaAudiovisual(['  N/A  ']), false);
  assert.strictEqual(tieneExperienciaAudiovisual(['NO TENGO']), false);
});

test('64. tieneExperienciaAudiovisual — una habilidad real mezclada con una respuesta negativa igual cuenta', () => {
  assert.strictEqual(tieneExperienciaAudiovisual(['Fotografía', 'No']), true);
});

test('65. habilidadesParaMostrar — quita las respuestas negativas de la lista a mostrar', () => {
  assert.deepStrictEqual(habilidadesParaMostrar(['No']), []);
  assert.deepStrictEqual(habilidadesParaMostrar(['Fotografía', 'No']), ['Fotografía']);
});

test('66. tieneExperienciaAudiovisual — la opción explícita "No tengo experiencia" tampoco cuenta', () => {
  assert.strictEqual(tieneExperienciaAudiovisual(['No tengo experiencia']), false);
});

// ── asistenciaStats — presentes/ausentes/% por capacitación, y el promedio ─

function personaFake(id: string): Participante {
  return {
    id, timestamp: new Date('2027-01-01T00:00:00').toISOString(), nombres: 'Test', apellidos: id,
    fechaNacimiento: '2005-01-01', telefono: '987654321', correo: `${id}@correo.com`, estaca: 'Ventanilla',
    barrio: 'Ventanilla', genero: 'H', experienciaPrevia: 'ninguna', asignacionAnterior: '', disponibilidad: 'si',
    asignacion: 'Consejero', familiaId: '',
  } as Participante;
}
const SEGMENTO_4 = ['a', 'b', 'c', 'd'].map(personaFake);
const CAP_UNICA = [capFake('u1', '2027-01-05')];

test('67. calcularAsistenciaPorCapacitacion — cuenta presentes/ausentes/justificados/sinMarca correctamente', () => {
  const asistencia: Asistencia[] = [
    { capacitacionId: 'u1', participanteId: 'a', estado: 'presente', timestamp: '' },
    { capacitacionId: 'u1', participanteId: 'b', estado: 'presente', timestamp: '' },
    { capacitacionId: 'u1', participanteId: 'c', estado: 'ausente', timestamp: '' },
    // 'd' no tiene marca — cuenta como sinMarca, no como registro
  ];
  const [stat] = calcularAsistenciaPorCapacitacion(SEGMENTO_4, CAP_UNICA, asistencia);
  assert.strictEqual(stat.presentes, 2);
  assert.strictEqual(stat.ausentes, 1);
  assert.strictEqual(stat.justificados, 0);
  assert.strictEqual(stat.sinMarca, 1);
  assert.strictEqual(stat.registros, 3);
  assert.strictEqual(stat.pct, 50); // 2 de 4 = 50%
});

test('68. calcularAsistenciaPorCapacitacion — ignora marcas de personas fuera del segmento (filtro de estaca/audiovisual ya aplicado antes)', () => {
  const asistencia: Asistencia[] = [
    { capacitacionId: 'u1', participanteId: 'fuera-del-segmento', estado: 'presente', timestamp: '' },
    { capacitacionId: 'u1', participanteId: 'a', estado: 'presente', timestamp: '' },
  ];
  const [stat] = calcularAsistenciaPorCapacitacion(SEGMENTO_4, CAP_UNICA, asistencia);
  assert.strictEqual(stat.presentes, 1);
  assert.strictEqual(stat.registros, 1);
});

test('69. promedioAsistencia — ignora capacitaciones sin ningún registro (no las cuenta como 0%)', () => {
  const dosCaps = [capFake('u1', '2027-01-05'), capFake('u2', '2027-01-06')];
  const asistencia: Asistencia[] = [
    { capacitacionId: 'u1', participanteId: 'a', estado: 'presente', timestamp: '' },
    { capacitacionId: 'u1', participanteId: 'b', estado: 'presente', timestamp: '' },
    { capacitacionId: 'u1', participanteId: 'c', estado: 'presente', timestamp: '' },
    { capacitacionId: 'u1', participanteId: 'd', estado: 'presente', timestamp: '' },
    // u2 sin ninguna marca todavía
  ];
  const porCap = calcularAsistenciaPorCapacitacion(SEGMENTO_4, dosCaps, asistencia);
  assert.strictEqual(promedioAsistencia(porCap), 100); // solo u1 cuenta (100%), u2 se ignora
});

test('70. promedioAsistencia — sin ninguna capacitación con registros, el promedio es 0', () => {
  const porCap = calcularAsistenciaPorCapacitacion(SEGMENTO_4, CAP_UNICA, []);
  assert.strictEqual(promedioAsistencia(porCap), 0);
});

// ── getCapacitacionParaHome — en vivo vs. última capacitación ──────────────

test('71. getCapacitacionParaHome — sin capacitaciones creadas todavía → null', () => {
  assert.strictEqual(getCapacitacionParaHome([]), null);
});

test('72. getCapacitacionParaHome — todas son futuras (evento no ha empezado) → null', () => {
  const caps = [capFake('f1', '2027-03-01', '09:00')];
  const ahora = new Date('2027-01-01T00:00:00');
  assert.strictEqual(getCapacitacionParaHome(caps, ahora), null);
});

test('73. getCapacitacionParaHome — "ahora" cae dentro del rango [hora, horaFin] → en curso', () => {
  const cap: Capacitacion = { id: 'c1', label: 'Sesión', fecha: '2027-01-10', hora: '09:00', horaFin: '12:00', lugar: 'X', oficial: true };
  const r = getCapacitacionParaHome([cap], new Date('2027-01-10T10:30:00'));
  assert.strictEqual(r?.cap.id, 'c1');
  assert.strictEqual(r?.enCurso, true);
});

test('74. getCapacitacionParaHome — justo pasada la horaFin exacta, ya no está en curso, es "última"', () => {
  const cap: Capacitacion = { id: 'c1', label: 'Sesión', fecha: '2027-01-10', hora: '09:00', horaFin: '12:00', lugar: 'X', oficial: true };
  const r = getCapacitacionParaHome([cap], new Date('2027-01-10T12:00:01'));
  assert.strictEqual(r?.cap.id, 'c1');
  assert.strictEqual(r?.enCurso, false);
});

test('75. getCapacitacionParaHome — sin horaFin, usa 3h por defecto (mismo valor que la ventana pública)', () => {
  const cap: Capacitacion = { id: 'c1', label: 'Sesión', fecha: '2027-01-10', hora: '09:00', lugar: 'X', oficial: true };
  const dentro = getCapacitacionParaHome([cap], new Date('2027-01-10T11:59:00'));
  const fuera = getCapacitacionParaHome([cap], new Date('2027-01-10T12:01:00'));
  assert.strictEqual(dentro?.enCurso, true);
  assert.strictEqual(fuera?.enCurso, false);
});

test('76. getCapacitacionParaHome — horaFin inválida (antes que hora, dato mal cargado) cae al valor por defecto en vez de invertir el rango', () => {
  const cap: Capacitacion = { id: 'c1', label: 'Sesión', fecha: '2027-01-10', hora: '09:00', horaFin: '08:00', lugar: 'X', oficial: true };
  const r = getCapacitacionParaHome([cap], new Date('2027-01-10T10:00:00'));
  assert.strictEqual(r?.enCurso, true); // sigue "en curso" gracias al fallback de 3h, no queda huérfana
});

test('77. getCapacitacionParaHome — dos capacitaciones el mismo día en curso a la vez → gana la que empezó más tarde', () => {
  const manana: Capacitacion = { id: 'manana', label: 'Mañana', fecha: '2027-01-10', hora: '08:00', horaFin: '13:00', lugar: 'X', oficial: true };
  const tarde: Capacitacion = { id: 'tarde', label: 'Tarde', fecha: '2027-01-10', hora: '12:00', horaFin: '17:00', lugar: 'X', oficial: true };
  const r = getCapacitacionParaHome([manana, tarde], new Date('2027-01-10T12:30:00')); // dentro de ambos rangos
  assert.strictEqual(r?.cap.id, 'tarde');
  assert.strictEqual(r?.enCurso, true);
});

test('78. getCapacitacionParaHome — ninguna en curso → la más reciente que ya terminó ("última capacitación")', () => {
  const caps = [capFake('c1', '2027-01-05', '09:00'), capFake('c2', '2027-01-10', '09:00')];
  const r = getCapacitacionParaHome(caps, new Date('2027-01-15T00:00:00'));
  assert.strictEqual(r?.cap.id, 'c2'); // la del 10, no la del 5
  assert.strictEqual(r?.enCurso, false);
});

// ── repartoFamilias — reparto automático de Compañías ──────────────────────

function personaReparto(
  id: string,
  opts: { estaca?: string; genero?: 'H' | 'M'; fechaNacimiento?: string; asignacion?: string; familiaId?: string } = {}
): Participante {
  return {
    id, timestamp: '', nombres: 'Test', apellidos: id,
    fechaNacimiento: opts.fechaNacimiento || '2005-06-15', telefono: '987654321', correo: `${id}@correo.com`,
    estaca: opts.estaca || 'Ventanilla', barrio: 'Ventanilla', genero: opts.genero || 'H',
    experienciaPrevia: 'ninguna', asignacionAnterior: '', disponibilidad: 'si',
    asignacion: (opts.asignacion ?? 'Consejero') as Participante['asignacion'], familiaId: opts.familiaId ?? '',
  } as Participante;
}

test('79. esElegibleReparto — Consejero y Logístico sí, cualquier otra asignación no', () => {
  assert.strictEqual(esElegibleReparto(personaReparto('a', { asignacion: 'Consejero' })), true);
  assert.strictEqual(esElegibleReparto(personaReparto('b', { asignacion: 'Logístico' })), true);
  assert.strictEqual(esElegibleReparto(personaReparto('c', { asignacion: 'Coordinador Auxiliar' })), false);
  assert.strictEqual(esElegibleReparto(personaReparto('d', { asignacion: 'Audiovisuales' })), false);
});

test('80. grupoEstacaReparto — las 3 estacas foco pasan tal cual, cualquier otra cae en "Otros"', () => {
  assert.strictEqual(grupoEstacaReparto('Ventanilla'), 'Ventanilla');
  assert.strictEqual(grupoEstacaReparto('Puente Piedra'), 'Puente Piedra');
  assert.strictEqual(grupoEstacaReparto('Pro Lima'), 'Pro Lima');
  assert.strictEqual(grupoEstacaReparto('Huaral'), 'Otros');
  assert.strictEqual(grupoEstacaReparto('Miramar'), 'Otros');
});

test('81. calcularEdad — antes y después del cumpleaños en el año de referencia', () => {
  assert.strictEqual(calcularEdad('2005-06-15', new Date('2027-06-14')), 21); // un día antes de cumplir
  assert.strictEqual(calcularEdad('2005-06-15', new Date('2027-06-15')), 22); // el mismo día
  assert.strictEqual(calcularEdad('2005-06-15', new Date('2027-06-16')), 22); // un día después
});

test('82. calcularCandidatosPorRol — modo "capacitacion": excluye a quien no asistió, a quien es del otro rol, y a quien ya tiene familia asignada', () => {
  const participantes = [
    personaReparto('consejero-presente', { asignacion: 'Consejero' }),
    personaReparto('logistico-presente', { asignacion: 'Logístico' }),
    personaReparto('consejero-ausente', { asignacion: 'Consejero' }),
    personaReparto('coord-aux-presente', { asignacion: 'Coordinador Auxiliar' }),
    personaReparto('consejero-ya-asignado', { asignacion: 'Consejero', familiaId: 'fam-1' }),
  ];
  const asistencia: Asistencia[] = [
    { capacitacionId: 'c1', participanteId: 'consejero-presente', estado: 'presente', timestamp: '' },
    { capacitacionId: 'c1', participanteId: 'logistico-presente', estado: 'presente', timestamp: '' },
    { capacitacionId: 'c1', participanteId: 'consejero-ausente', estado: 'ausente', timestamp: '' },
    { capacitacionId: 'c1', participanteId: 'coord-aux-presente', estado: 'presente', timestamp: '' },
    { capacitacionId: 'c1', participanteId: 'consejero-ya-asignado', estado: 'presente', timestamp: '' },
  ];
  const fuente: FuenteReparto = { modo: 'capacitacion', capacitacionId: 'c1' };
  const consejeros = calcularCandidatosPorRol(participantes, asistencia, fuente, 'Consejero', new Date('2027-01-01'));
  const logisticos = calcularCandidatosPorRol(participantes, asistencia, fuente, 'Logístico', new Date('2027-01-01'));
  assert.deepStrictEqual(consejeros.map((c) => c.participante.id), ['consejero-presente']);
  assert.deepStrictEqual(logisticos.map((c) => c.participante.id), ['logistico-presente']);
});

test('83. calcularCandidatosPorRol — modo "todos": no filtra por asistencia, entra cualquier elegible del rol sin familia', () => {
  const participantes = [
    personaReparto('a', { asignacion: 'Consejero' }),
    personaReparto('b', { asignacion: 'Consejero', familiaId: 'fam-1' }), // ya asignado, queda fuera igual
    personaReparto('c', { asignacion: 'Logístico' }),
  ];
  const consejeros = calcularCandidatosPorRol(participantes, [], { modo: 'todos' }, 'Consejero', new Date('2027-01-01'));
  assert.deepStrictEqual(consejeros.map((c) => c.participante.id), ['a']);
});

test('84. repartirEnFamilias — el conteo total nunca difiere en más de 1 entre familias', () => {
  const candidatos: CandidatoReparto[] = Array.from({ length: 23 }, (_, i) => ({
    participante: personaReparto(`p${i}`, { genero: i % 2 ? 'H' : 'M', estaca: ['Ventanilla', 'Puente Piedra', 'Pro Lima', 'Huaral'][i % 4] }),
    edad: 18 + (i % 10),
  }));
  const { porFamilia } = repartirEnFamilias(candidatos, ['f1', 'f2', 'f3', 'f4']);
  const counts = Object.values(porFamilia).map((arr) => arr.length);
  assert.strictEqual(counts.reduce((a, b) => a + b, 0), 23);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `counts muy desparejos: ${counts}`);
});

test('85. repartirEnFamilias — reparte en serpentina (0,1,2,3,3,2,1,0,…) sin reiniciar entre grupos', () => {
  // 8 personas, todas del mismo grupo (mismo sexo+estaca) para aislar el patrón puro de serpentina.
  const candidatos: CandidatoReparto[] = Array.from({ length: 8 }, (_, i) => ({
    participante: personaReparto(`p${i}`, { estaca: 'Ventanilla', genero: 'H' }),
    edad: 18 + i, // ya vienen ordenados por edad ascendente
  }));
  const { porFamilia } = repartirEnFamilias(candidatos, ['f1', 'f2', 'f3', 'f4']);
  const familiaDe = (id: string) => Object.entries(porFamilia).find(([, arr]) => arr.some((c) => c.participante.id === id))?.[0];
  assert.deepStrictEqual(
    ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map(familiaDe),
    ['f1', 'f2', 'f3', 'f4', 'f4', 'f3', 'f2', 'f1']
  );
});

test('86. repartirEnFamilias — sin familias creadas, no revienta y devuelve objeto vacío', () => {
  const candidatos: CandidatoReparto[] = [{ participante: personaReparto('p1'), edad: 20 }];
  assert.deepStrictEqual(repartirEnFamilias(candidatos, []).porFamilia, {});
});

test('87. repartirEnFamilias — prioridad más alta (sexo) queda parejo: 20 hombres y 20 mujeres se reparten ~10/10 en cada familia', () => {
  const candidatos: CandidatoReparto[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ participante: personaReparto(`h${i}`, { genero: 'H' as const, estaca: 'Ventanilla' }), edad: 18 + i })),
    ...Array.from({ length: 20 }, (_, i) => ({ participante: personaReparto(`m${i}`, { genero: 'M' as const, estaca: 'Ventanilla' }), edad: 18 + i })),
  ];
  const { porFamilia } = repartirEnFamilias(candidatos, ['f1', 'f2', 'f3', 'f4']);
  Object.values(porFamilia).forEach((miembros) => {
    const h = miembros.filter((m) => m.participante.genero === 'H').length;
    const m = miembros.filter((m) => m.participante.genero === 'M').length;
    assert.ok(Math.abs(h - m) <= 1, `sexo desbalanceado en una familia: H=${h} M=${m}`);
  });
});

test('88. repartirEnFamilias — cada estaca queda representada proporcionalmente en las 4 familias (no toda en una sola)', () => {
  // 16 de Ventanilla, 16 de Puente Piedra — con la serpentina agrupada por
  // sexo→estaca, cada familia debe recibir ~8 de cada una, no todo en 1 o 2.
  const candidatos: CandidatoReparto[] = [
    ...Array.from({ length: 16 }, (_, i) => ({ participante: personaReparto(`v${i}`, { estaca: 'Ventanilla', genero: i % 2 ? 'H' : 'M' }), edad: 18 + i })),
    ...Array.from({ length: 16 }, (_, i) => ({ participante: personaReparto(`pp${i}`, { estaca: 'Puente Piedra', genero: i % 2 ? 'H' : 'M' }), edad: 18 + i })),
  ] as CandidatoReparto[];
  const { porFamilia } = repartirEnFamilias(candidatos, ['f1', 'f2', 'f3', 'f4']);
  Object.values(porFamilia).forEach((miembros) => {
    const deVentanilla = miembros.filter((m) => m.participante.estaca === 'Ventanilla').length;
    const dePuentePiedra = miembros.filter((m) => m.participante.estaca === 'Puente Piedra').length;
    assert.ok(deVentanilla >= 2 && deVentanilla <= 6, `Ventanilla desbalanceada en una familia: ${deVentanilla}`);
    assert.ok(dePuentePiedra >= 2 && dePuentePiedra <= 6, `Puente Piedra desbalanceada en una familia: ${dePuentePiedra}`);
  });
});

test('89. repartoCompleto — Consejeros primero, Logísticos como relleno después, y el TOTAL combinado queda parejo (encadena el cursor)', () => {
  const consejeros: CandidatoReparto[] = Array.from({ length: 9 }, (_, i) => ({
    participante: personaReparto(`c${i}`, { genero: i % 2 ? 'H' : 'M', estaca: 'Ventanilla' }),
    edad: 18 + i,
  }));
  const logisticos: CandidatoReparto[] = Array.from({ length: 7 }, (_, i) => ({
    participante: personaReparto(`l${i}`, { genero: i % 2 ? 'H' : 'M', estaca: 'Pro Lima', asignacion: 'Logístico' }),
    edad: 20 + i,
  }));
  const combinado = repartoCompleto(consejeros, logisticos, ['f1', 'f2', 'f3', 'f4']);
  const counts = Object.values(combinado).map((arr) => arr.length);
  assert.strictEqual(counts.reduce((a, b) => a + b, 0), 16);
  // Si cada pasada partiera siempre desde 0, el remanente (9%4=1, 7%4=3) se
  // acumularía en las MISMAS familias las 2 veces — encadenar el cursor
  // evita eso; el total combinado no debería diferir en más de 2.
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `totales combinados muy desparejos: ${counts}`);
  // Todos los logísticos deben estar repartidos (no todos concentrados en 1 familia).
  const familiasConLogistico = Object.values(combinado).filter((arr) => arr.some((c) => c.participante.asignacion === 'Logístico')).length;
  assert.ok(familiasConLogistico >= 3, `logísticos poco distribuidos: solo en ${familiasConLogistico} familias`);
});

test('90. calcularEstadisticas — promedio y mediana correctos (par e impar)', () => {
  const miembros: CandidatoReparto[] = [18, 20, 22].map((edad, i) => ({ participante: personaReparto(`p${i}`), edad }));
  const stats = calcularEstadisticas(miembros);
  assert.strictEqual(stats.edadPromedio, 20);
  assert.strictEqual(stats.edadMediana, 20);

  const miembrosPar: CandidatoReparto[] = [18, 20, 22, 24].map((edad, i) => ({ participante: personaReparto(`q${i}`), edad }));
  assert.strictEqual(calcularEstadisticas(miembrosPar).edadMediana, 21); // (20+22)/2
});

test('91. calcularEstadisticas — moda clara cuando un valor se repite más que los demás', () => {
  const miembros: CandidatoReparto[] = [18, 18, 18, 20, 22].map((edad, i) => ({ participante: personaReparto(`p${i}`), edad }));
  assert.strictEqual(calcularEstadisticas(miembros).edadModa, 18);
});

test('92. calcularEstadisticas — sin moda clara (empate o todas distintas) devuelve null, no un valor inventado', () => {
  const todasDistintas: CandidatoReparto[] = [18, 19, 20, 21].map((edad, i) => ({ participante: personaReparto(`p${i}`), edad }));
  assert.strictEqual(calcularEstadisticas(todasDistintas).edadModa, null);

  const empate: CandidatoReparto[] = [18, 18, 20, 20].map((edad, i) => ({ participante: personaReparto(`q${i}`), edad }));
  assert.strictEqual(calcularEstadisticas(empate).edadModa, null);
});

test('93. calcularEstadisticas — desglose por estaca y sexo, y el caso de lista vacía', () => {
  const miembros: CandidatoReparto[] = [
    { participante: personaReparto('a', { estaca: 'Ventanilla', genero: 'H' }), edad: 20 },
    { participante: personaReparto('b', { estaca: 'Pro Lima', genero: 'M' }), edad: 21 },
    { participante: personaReparto('c', { estaca: 'Huaral', genero: 'H' }), edad: 22 }, // cae en "Otros"
  ];
  const stats = calcularEstadisticas(miembros);
  assert.strictEqual(stats.hombres, 2);
  assert.strictEqual(stats.mujeres, 1);
  assert.strictEqual(stats.porEstaca.Ventanilla, 1);
  assert.strictEqual(stats.porEstaca['Pro Lima'], 1);
  assert.strictEqual(stats.porEstaca.Otros, 1);

  const vacio = calcularEstadisticas([]);
  assert.strictEqual(vacio.total, 0);
  assert.strictEqual(vacio.edadModa, null);
});

// ── nombreConInicialMaterna — evita confundir a 2 personas con mismo nombre+apellido paterno en el reparto ──

test('94. nombreConInicialMaterna — nombre + apellido paterno + inicial del materno', () => {
  assert.strictEqual(nombreConInicialMaterna('Ana', 'Flores Ramírez'), 'Ana Flores R.');
});

test('95. nombreConInicialMaterna — apellido paterno con partícula, la inicial es de la palabra que sigue', () => {
  assert.strictEqual(nombreConInicialMaterna('Juan', 'De La Cruz Rodríguez'), 'Juan De La Cruz R.');
});

test('96. nombreConInicialMaterna — sin apellido materno (un solo apellido), no agrega inicial ni punto de más', () => {
  assert.strictEqual(nombreConInicialMaterna('Pedro', 'Gómez'), 'Pedro Gómez');
});

test('97. nombreConInicialMaterna — distingue a 2 personas con el mismo primer nombre y apellido paterno (el caso real que motivó esto)', () => {
  const a = nombreConInicialMaterna('Ana', 'Flores Ramírez');
  const b = nombreConInicialMaterna('Ana', 'Flores Delgado');
  assert.notStrictEqual(a, b);
  assert.strictEqual(a, 'Ana Flores R.');
  assert.strictEqual(b, 'Ana Flores D.');
});

console.log(`\n${passed} pruebas pasaron.`);
