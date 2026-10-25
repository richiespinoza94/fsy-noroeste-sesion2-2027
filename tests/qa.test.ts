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
import { estadoVentanaCheckIn, getCapacitacionParaAutoMarcar, getCapacitacionParaCheckIn, getCapacitacionParaAsistencia, getCapacitacionParaHome, getNextCapacitacion } from '../src/services/capacitacionesService';
import { addConsejeroToFamilia, addFamilia, familiasDeAuxiliar, ordenarFamilias } from '../src/services/familiasService';
import { registrarParticipante, subscribeParticipantes, updateParticipante } from '../src/services/participantsService';
import { estacasSugeridas, fuzzyIncludes, matchesQuery, quitarPalabrasDeEstaca } from '../src/utils/search';
import { calcularCompromiso } from '../src/utils/compromiso';
import { calcularAsistenciaPorCapacitacion, medianaAsistencia, promedioAsistencia, soloOcurridas, variacionesPorEvento } from '../src/utils/asistenciaStats';
import { calcularSeguimiento } from '../src/utils/seguimiento';
import { marcarAsistencia, quitarMarca, subscribeAsistencia } from '../src/services/asistenciaService';
import { contarEstados, contarSinCompania, esDeReparto, filtrarPorCompania, filtrarPorEstado, infoCompanias, nombreCompania, resumenGrupo } from '../src/utils/companias';
import { fechaAmigable, rangoHora } from '../src/utils/fechaAmigable';
import { MAX_SUGERIR, companerosDe, estacasDistintas, firmaPropuesta, otraPropuesta, planearGuardado, planearLote, resumenCompaneros, sugerirParejas, vistaFamilia } from '../src/utils/parejasTrabajo';
import { deshacerPareja, deshacerParejasLote, guardarPareja, guardarParejasLote, subscribeParejas } from '../src/services/parejasService';
import { crearNocheHogar, editarNocheHogar, eliminarNocheHogar, marcarVariosNocheHogar, ordenarNoches, restaurarNocheHogar, subscribeNochesHogar } from '../src/services/nochesHogarService';
import { ordenarParaVista, resumenNoche, sumarDias } from '../src/utils/nochesHogar';
import { createStaffAccount, loginStaff, restablecerContrasena, setupPasswordFirstTime } from '../src/services/authService';
import { suscripcionCompartida } from '../src/utils/suscripcionCompartida';
import { describirEntrada, describirEntradas, etiquetaDia, filtrarHistorial, grupoDeAccion } from '../src/utils/historial';
import { formatAuditDetails } from '../src/services/auditService';
import { agruparEventosParaSelector, contarPorTipo, filtrarPorTipos, hoyLocalISO, tipoDe } from '../src/utils/tiposEvento';
import {
  calcularCandidatosPorRol,
  calcularEdad,
  calcularEstadisticas,
  calcularEstadoFamilia,
  participaRegular,
  UMBRAL_PARTICIPACION,
  esElegibleReparto,
  grupoEstacaReparto,
  repartirConBalance,
  repartoCompleto,
  calcularOActualizarPlanEnVivo,
  type CandidatoReparto,
  type EstadoFamilia,
  type FuenteReparto,
} from '../src/utils/repartoFamilias';
import { nombreConInicialMaterna, nombreCorto, primerApellido, primerNombre } from '../src/utils/nombreCorto';
import { habilidadesParaMostrar, tieneExperienciaAudiovisual } from '../src/utils/audiovisual';
import { calcularCumpleanosProximos, diasHastaProximoCumple } from '../src/utils/cumpleanos';
import { sinVenirRecientes } from '../src/utils/sinVenir';
import { resumenCompaniasTexto } from '../src/utils/resumenCompanias';
import type { Asistencia, AuditLog, Capacitacion, Companerismo, Familia, NocheHogar, ParejaTrabajo, Participante } from '../src/types';
import { ESTACAS_DATA, ESTACAS_PRINCIPALES, ESTACAS_SECUNDARIAS, FILTRO_OTRAS, TODAS_LAS_ESTACAS, estacaEnFiltro } from '../src/data/estacas';

let passed = 0;
const pendientes: Promise<void>[] = [];
function test(name: string, fn: () => void | Promise<void>) {
  const ok = () => {
    passed++;
    console.log(`✓ ${name}`);
  };
  const fallo = (e: unknown) => {
    console.error(`✗ ${name}`);
    console.error(e);
    process.exitCode = 1;
  };
  try {
    const r = fn();
    if (r && typeof (r as Promise<void>).then === 'function') {
      pendientes.push((r as Promise<void>).then(ok, fallo)); // pruebas async: se esperan antes del resumen
      return;
    }
    ok();
  } catch (e) {
    fallo(e);
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

function estadoVacio(id: string): EstadoFamilia {
  return { id, total: 0, hombres: 0, mujeres: 0, porEstaca: { Ventanilla: 0, 'Puente Piedra': 0, 'Pro Lima': 0, Otros: 0 } };
}
const ESTADOS_VACIOS_4 = ['f1', 'f2', 'f3', 'f4'].map(estadoVacio);

test('84. repartirConBalance — el conteo total nunca difiere en más de 1 entre familias (partiendo de vacío)', () => {
  const candidatos: CandidatoReparto[] = Array.from({ length: 23 }, (_, i) => ({
    participante: personaReparto(`p${i}`, { genero: i % 2 ? 'H' : 'M', estaca: ['Ventanilla', 'Puente Piedra', 'Pro Lima', 'Huaral'][i % 4] }),
    edad: 18 + (i % 10),
  }));
  const { porFamilia } = repartirConBalance(candidatos, ESTADOS_VACIOS_4);
  const counts = Object.values(porFamilia).map((arr) => arr.length);
  assert.strictEqual(counts.reduce((a, b) => a + b, 0), 23);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `counts muy desparejos: ${counts}`);
});

test('85. repartirConBalance — SÍ toma en cuenta compañías que ya tienen gente (el caso real: reparto corrido varias veces)', () => {
  // Familia 1 ya tiene 5 hombres de Ventanilla (de una corrida anterior o
  // asignados a mano) — el reparto nuevo debe evitar seguir mandándole
  // hombres de Ventanilla mientras las otras 3 están vacías.
  const estados: EstadoFamilia[] = [
    { id: 'f1', total: 5, hombres: 5, mujeres: 0, porEstaca: { Ventanilla: 5, 'Puente Piedra': 0, 'Pro Lima': 0, Otros: 0 } },
    estadoVacio('f2'),
    estadoVacio('f3'),
    estadoVacio('f4'),
  ];
  const candidatos: CandidatoReparto[] = Array.from({ length: 8 }, (_, i) => ({
    participante: personaReparto(`h${i}`, { genero: 'H', estaca: 'Ventanilla' }),
    edad: 18 + i,
  }));
  const { porFamilia } = repartirConBalance(candidatos, estados);
  assert.strictEqual(porFamilia['f1'].length, 0, 'Familia 1 ya estaba cargada de hombres de Ventanilla, no debería recibir más mientras las otras están en 0');
  assert.ok(porFamilia['f2'].length > 0 && porFamilia['f3'].length > 0 && porFamilia['f4'].length > 0, 'las 3 vacías deberían repartirse la mayoría');
});

test('86. repartirConBalance — sin familias, no revienta y devuelve objeto vacío', () => {
  const candidatos: CandidatoReparto[] = [{ participante: personaReparto('p1'), edad: 20 }];
  assert.deepStrictEqual(repartirConBalance(candidatos, []).porFamilia, {});
});

test('87. repartirConBalance — prioridad más alta (sexo) queda parejo: 20 hombres y 20 mujeres se reparten ~10/10 en cada familia', () => {
  const candidatos: CandidatoReparto[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ participante: personaReparto(`h${i}`, { genero: 'H' as const, estaca: 'Ventanilla' }), edad: 18 + i })),
    ...Array.from({ length: 20 }, (_, i) => ({ participante: personaReparto(`m${i}`, { genero: 'M' as const, estaca: 'Ventanilla' }), edad: 18 + i })),
  ];
  const { porFamilia } = repartirConBalance(candidatos, ESTADOS_VACIOS_4);
  Object.values(porFamilia).forEach((miembros) => {
    const h = miembros.filter((m) => m.participante.genero === 'H').length;
    const m = miembros.filter((m) => m.participante.genero === 'M').length;
    assert.ok(Math.abs(h - m) <= 1, `sexo desbalanceado en una familia: H=${h} M=${m}`);
  });
});

test('88. repartirConBalance — cada estaca queda representada proporcionalmente en las 4 familias (no toda en una sola)', () => {
  const candidatos: CandidatoReparto[] = [
    ...Array.from({ length: 16 }, (_, i) => ({ participante: personaReparto(`v${i}`, { estaca: 'Ventanilla', genero: i % 2 ? 'H' : 'M' }), edad: 18 + i })),
    ...Array.from({ length: 16 }, (_, i) => ({ participante: personaReparto(`pp${i}`, { estaca: 'Puente Piedra', genero: i % 2 ? 'H' : 'M' }), edad: 18 + i })),
  ] as CandidatoReparto[];
  const { porFamilia } = repartirConBalance(candidatos, ESTADOS_VACIOS_4);
  Object.values(porFamilia).forEach((miembros) => {
    const deVentanilla = miembros.filter((m) => m.participante.estaca === 'Ventanilla').length;
    const dePuentePiedra = miembros.filter((m) => m.participante.estaca === 'Puente Piedra').length;
    assert.ok(deVentanilla >= 2 && deVentanilla <= 6, `Ventanilla desbalanceada en una familia: ${deVentanilla}`);
    assert.ok(dePuentePiedra >= 2 && dePuentePiedra <= 6, `Puente Piedra desbalanceada en una familia: ${dePuentePiedra}`);
  });
});

test('89. repartoCompleto — Consejeros primero, Logísticos como relleno después, usando el estado que dejaron los Consejeros (no el inicial)', () => {
  const consejeros: CandidatoReparto[] = Array.from({ length: 9 }, (_, i) => ({
    participante: personaReparto(`c${i}`, { genero: i % 2 ? 'H' : 'M', estaca: 'Ventanilla' }),
    edad: 18 + i,
  }));
  const logisticos: CandidatoReparto[] = Array.from({ length: 7 }, (_, i) => ({
    participante: personaReparto(`l${i}`, { genero: i % 2 ? 'H' : 'M', estaca: 'Pro Lima', asignacion: 'Logístico' }),
    edad: 20 + i,
  }));
  const combinado = repartoCompleto(consejeros, logisticos, ESTADOS_VACIOS_4);
  const counts = Object.values(combinado).map((arr) => arr.length);
  assert.strictEqual(counts.reduce((a, b) => a + b, 0), 16);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `totales combinados muy desparejos: ${counts}`);
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

// ── ordenarFamilias — Firestore no garantiza orden sin orderBy; el id de cada familia es un UUID al azar, así que sin esto podían salir como "1, 2, 4, 3" en Reparto/PDF/presentación ──

function familiaFake(nombre: string): Familia {
  return { id: crypto.randomUUID(), nombre, customName: '', colorId: 'rojo', consejeros: [] };
}

test('98. ordenarFamilias — reordena "Familia 1..4" aunque lleguen en cualquier orden de Firestore', () => {
  const desordenadas = [familiaFake('Familia 3'), familiaFake('Familia 1'), familiaFake('Familia 4'), familiaFake('Familia 2')];
  const ordenadas = ordenarFamilias(desordenadas);
  assert.deepStrictEqual(ordenadas.map((f) => f.nombre), ['Familia 1', 'Familia 2', 'Familia 3', 'Familia 4']);
});

test('99. ordenarFamilias — numérico de verdad, no alfabético ("Familia 10" no debe quedar antes que "Familia 2")', () => {
  const desordenadas = [familiaFake('Familia 10'), familiaFake('Familia 2')];
  const ordenadas = ordenarFamilias(desordenadas);
  assert.deepStrictEqual(ordenadas.map((f) => f.nombre), ['Familia 2', 'Familia 10']);
});

// ── estadoVentanaCheckIn respeta horaFin cuando está cargada ────────────────
// Antes SIEMPRE usaba 3h fijas sin importar lo que el admin hubiera puesto
// en horaFin al crear la capacitación — alguien llegando después de esas 3h
// pero antes de la hora de cierre real se encontraba la ventana "cerrada"
// sin poder auto-registrarse.

test('100. estadoVentanaCheckIn — con horaFin cargada, el cierre real es horaFin, no 3h fijas', () => {
  const cap: Capacitacion = { ...CAP_REF, horaFin: '22:00' }; // empieza 18:00, cierre real 22:00 (4h, no 3h)
  const dentroDeLas3hFijasPeroFueraDeLaVieja = new Date('2027-01-25T21:30:00'); // dentro de horaFin, fuera de las 3h fijas (21:00)
  assert.strictEqual(estadoVentanaCheckIn(cap, dentroDeLas3hFijasPeroFueraDeLaVieja), 'abierta');
  const pasadoElCierreReal = new Date('2027-01-25T22:01:00');
  assert.strictEqual(estadoVentanaCheckIn(cap, pasadoElCierreReal), 'cerrada');
});

test('101. estadoVentanaCheckIn — sin horaFin, sigue usando las 3h por defecto (compatibilidad con capacitaciones viejas)', () => {
  assert.strictEqual(estadoVentanaCheckIn(CAP_REF, new Date('2027-01-25T21:00:00')), 'abierta');
  assert.strictEqual(estadoVentanaCheckIn(CAP_REF, new Date('2027-01-25T21:00:01')), 'cerrada');
});

test('102. estadoVentanaCheckIn — horaFin inválida (antes que hora) cae al valor por defecto en vez de invertir el rango', () => {
  const cap: Capacitacion = { ...CAP_REF, horaFin: '10:00' }; // antes de las 18:00 de inicio — dato mal cargado
  assert.strictEqual(estadoVentanaCheckIn(cap, new Date('2027-01-25T20:00:00')), 'abierta'); // sigue dentro de las 3h por defecto
});

test('103. calcularEstadoFamilia — cuenta total/hombres/mujeres/porEstaca a partir de los participantes reales de la familia', () => {
  const miembros = [
    personaReparto('a', { genero: 'H', estaca: 'Ventanilla' }),
    personaReparto('b', { genero: 'M', estaca: 'Pro Lima' }),
    personaReparto('c', { genero: 'H', estaca: 'Huaral' }), // cae en "Otros"
  ];
  const estado = calcularEstadoFamilia('f1', miembros);
  assert.strictEqual(estado.total, 3);
  assert.strictEqual(estado.hombres, 2);
  assert.strictEqual(estado.mujeres, 1);
  assert.strictEqual(estado.porEstaca.Ventanilla, 1);
  assert.strictEqual(estado.porEstaca['Pro Lima'], 1);
  assert.strictEqual(estado.porEstaca.Otros, 1);
});

test('104. repartirConBalance — 2 corridas sucesivas (simulando que llega gente en 2 tandas) terminan parejas en total, aunque la 2da no empiece de cero', () => {
  // Tanda 1: 12 personas a familias vacías.
  const tanda1: CandidatoReparto[] = Array.from({ length: 12 }, (_, i) => ({
    participante: personaReparto(`t1-${i}`, { genero: i % 2 ? 'H' : 'M', estaca: i % 2 ? 'Ventanilla' : 'Pro Lima' }),
    edad: 18 + i,
  }));
  const paso1 = repartirConBalance(tanda1, ESTADOS_VACIOS_4);
  const estadosTrasT1 = ['f1', 'f2', 'f3', 'f4'].map((id) => calcularEstadoFamilia(id, paso1.porFamilia[id].map((c) => c.participante)));

  // Tanda 2 (días después, simulando una 2da corrida): 8 personas más, SOBRE el estado que dejó la tanda 1.
  const tanda2: CandidatoReparto[] = Array.from({ length: 8 }, (_, i) => ({
    participante: personaReparto(`t2-${i}`, { genero: i % 2 ? 'H' : 'M', estaca: i % 2 ? 'Ventanilla' : 'Pro Lima' }),
    edad: 18 + i,
  }));
  const paso2 = repartirConBalance(tanda2, estadosTrasT1);

  // Total final (tanda1 + tanda2) por familia debe seguir parejo — la 2da
  // tanda tuvo que "leer" el desbalance que dejó la 1ra y compensarlo.
  const totalFinal = ['f1', 'f2', 'f3', 'f4'].map((id) => paso1.porFamilia[id].length + paso2.porFamilia[id].length);
  assert.strictEqual(totalFinal.reduce((a, b) => a + b, 0), 20);
  assert.ok(Math.max(...totalFinal) - Math.min(...totalFinal) <= 1, `total tras 2 corridas muy desparejo: ${totalFinal}`);
});

// ── calcularOActualizarPlanEnVivo — asignación en vivo durante check-in ────
// Escenario base de los 15 casos: una capacitación donde varios YA tienen
// compañía (no entran a esto) y un grupo de 5 que no — más gente que puede
// seguir llegando mientras el staff va procesando al grupo original.

function candidato(id: string, opts: Parameters<typeof personaReparto>[1] = {}): CandidatoReparto {
  return { participante: personaReparto(id, opts), edad: 20 };
}

test('105. calcularOActualizarPlanEnVivo — primer clic en un grupo de 5 dispara el cálculo (recalculo=true) y resuelve a los 5 de una vez', () => {
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => candidato(id, { genero: i % 2 ? 'H' : 'M' }));
  const { plan, recalculo } = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  assert.strictEqual(recalculo, true);
  assert.strictEqual(Object.keys(plan).length, 5, 'las 5 personas deberían quedar resueltas en el plan, no solo p1');
  ['p1', 'p2', 'p3', 'p4', 'p5'].forEach((id) => assert.ok(plan[id], `${id} debería tener compañía asignada en el plan`));
});

test('106. calcularOActualizarPlanEnVivo — clic en el 2do del mismo grupo NO recalcula, solo revela lo ya calculado', () => {
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => candidato(id, { genero: i % 2 ? 'H' : 'M' }));
  const paso1 = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  const paso2 = calcularOActualizarPlanEnVivo(paso1.plan, 'p2', grupo5, ESTADOS_VACIOS_4);
  assert.strictEqual(paso2.recalculo, false);
  assert.deepStrictEqual(paso2.plan, paso1.plan, 'el plan no debería cambiar — p2 ya tenía resultado del primer cálculo');
});

test('107. calcularOActualizarPlanEnVivo — clic en el 3ro, 4to y 5to del mismo grupo: ninguno recalcula', () => {
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => candidato(id, { genero: i % 2 ? 'H' : 'M' }));
  let { plan } = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  for (const id of ['p3', 'p4', 'p5']) {
    const paso = calcularOActualizarPlanEnVivo(plan, id, grupo5, ESTADOS_VACIOS_4);
    assert.strictEqual(paso.recalculo, false, `${id} no debería disparar un recálculo`);
    plan = paso.plan;
  }
});

test('108. calcularOActualizarPlanEnVivo — llega una 6ta persona DESPUÉS del cálculo original: su id no está en el plan todavía', () => {
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => candidato(id, { genero: i % 2 ? 'H' : 'M' }));
  const { plan } = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  assert.strictEqual('p6' in plan, false);
});

test('109. calcularOActualizarPlanEnVivo — clic en la 6ta (nueva, no contemplada) SÍ dispara un cálculo nuevo', () => {
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => candidato(id, { genero: i % 2 ? 'H' : 'M' }));
  const { plan: planTrasGrupo5 } = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  const pendientesConSexta = [...grupo5, candidato('p6', { genero: 'H' })];
  const paso = calcularOActualizarPlanEnVivo(planTrasGrupo5, 'p6', pendientesConSexta, ESTADOS_VACIOS_4);
  assert.strictEqual(paso.recalculo, true);
  assert.ok(paso.plan['p6'], 'p6 debería quedar resuelta tras su propio clic');
});

test('110. calcularOActualizarPlanEnVivo — el recálculo de la 6ta NO toca ni cambia los resultados ya fijados del grupo original', () => {
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => candidato(id, { genero: i % 2 ? 'H' : 'M' }));
  const { plan: planTrasGrupo5 } = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  const pendientesConSexta = [...grupo5, candidato('p6', { genero: 'H' })];
  const { plan: planFinal } = calcularOActualizarPlanEnVivo(planTrasGrupo5, 'p6', pendientesConSexta, ESTADOS_VACIOS_4);
  ['p1', 'p2', 'p3', 'p4', 'p5'].forEach((id) => {
    assert.strictEqual(planFinal[id], planTrasGrupo5[id], `${id} no debería haber cambiado de compañía al calcular p6`);
  });
});

test('111. calcularOActualizarPlanEnVivo — el cálculo de la 6ta usa el estado REAL (lo escrito), no lo que el plan ya decidió pero no se confirmó', () => {
  // Simula: p1..p5 tienen un resultado CALCULADO (plan), pero solo p1 se
  // confirmó de verdad (escribió a Firestore) — estadosActuales solo debe
  // reflejar a p1, no a p2..p5 aunque ya tengan destino en el plan.
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => candidato(id, { genero: 'H', estaca: 'Ventanilla' }));
  const { plan: planTrasGrupo5 } = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  const familiaDeP1 = planTrasGrupo5['p1'];

  // Estado real: solo p1 escrito (los otros 4 siguen "pendientes de confirmar").
  const estadosConSoloP1Escrito = ESTADOS_VACIOS_4.map((e) =>
    e.id === familiaDeP1 ? { ...e, total: 1, hombres: 1, porEstaca: { ...e.porEstaca, Ventanilla: 1 } } : e
  );
  const pendientesConSexta = [...grupo5, candidato('p6', { genero: 'H', estaca: 'Ventanilla' })];
  const paso = calcularOActualizarPlanEnVivo(planTrasGrupo5, 'p6', pendientesConSexta, estadosConSoloP1Escrito);
  // p6 no debería ir a la misma familia que p1 si esa ya quedó con 1 más que las demás.
  assert.notStrictEqual(paso.plan['p6'], familiaDeP1, 'p6 debería evitar la familia de p1, que ya está más cargada según lo realmente escrito');
});

test('112. calcularOActualizarPlanEnVivo — si llegan 2 nuevas a la vez (7ma y 8va), el clic en la 7ma calcula para AMBAS juntas', () => {
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => candidato(id, { genero: 'H' }));
  const { plan: planTrasGrupo5 } = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  const pendientesCon2Nuevas = [...grupo5, candidato('p7', { genero: 'M' }), candidato('p8', { genero: 'M' })];
  const paso = calcularOActualizarPlanEnVivo(planTrasGrupo5, 'p7', pendientesCon2Nuevas, ESTADOS_VACIOS_4);
  assert.strictEqual(paso.recalculo, true);
  assert.ok(paso.plan['p7'] && paso.plan['p8'], 'tanto p7 como p8 deberían quedar resueltas en la misma corrida, aunque solo se haya clickeado p7');
});

test('113. calcularOActualizarPlanEnVivo — clic posterior en la 8va (ya resuelta por el paso anterior) no recalcula', () => {
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => candidato(id, { genero: 'H' }));
  const { plan: planTrasGrupo5 } = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  const pendientesCon2Nuevas = [...grupo5, candidato('p7', { genero: 'M' }), candidato('p8', { genero: 'M' })];
  const { plan: planTras7 } = calcularOActualizarPlanEnVivo(planTrasGrupo5, 'p7', pendientesCon2Nuevas, ESTADOS_VACIOS_4);
  const paso = calcularOActualizarPlanEnVivo(planTras7, 'p8', pendientesCon2Nuevas, ESTADOS_VACIOS_4);
  assert.strictEqual(paso.recalculo, false);
});

test('114. calcularOActualizarPlanEnVivo — el plan nunca pierde entradas previas al mezclar con un cálculo nuevo', () => {
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => candidato(id, { genero: 'H' }));
  const { plan: planTrasGrupo5 } = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  const pendientesConSexta = [...grupo5, candidato('p6', { genero: 'M' })];
  const { plan: planFinal } = calcularOActualizarPlanEnVivo(planTrasGrupo5, 'p6', pendientesConSexta, ESTADOS_VACIOS_4);
  assert.strictEqual(Object.keys(planFinal).length, 6);
  ['p1', 'p2', 'p3', 'p4', 'p5'].forEach((id) => assert.ok(id in planFinal));
});

test('115. calcularOActualizarPlanEnVivo — grupo de 1 sola persona: el clic calcula solo para ella', () => {
  const soloUno = [candidato('p1', { genero: 'H' })];
  const { plan, recalculo } = calcularOActualizarPlanEnVivo({}, 'p1', soloUno, ESTADOS_VACIOS_4);
  assert.strictEqual(recalculo, true);
  assert.strictEqual(Object.keys(plan).length, 1);
  assert.ok(plan['p1']);
});

test('116. calcularOActualizarPlanEnVivo — sin pendientes (lista vacía) no revienta, no resuelve nada', () => {
  const { plan, recalculo } = calcularOActualizarPlanEnVivo({}, 'p1', [], ESTADOS_VACIOS_4);
  assert.strictEqual(recalculo, true); // intenta calcular porque p1 no estaba en planPrevio — pero no hay candidatos
  assert.deepStrictEqual(plan, {});
});

test('117. calcularOActualizarPlanEnVivo — respeta la prioridad sexo→estaca ya probada en repartoCompleto (no es una fórmula distinta)', () => {
  const grupo8 = [
    ...Array.from({ length: 4 }, (_, i) => candidato(`h${i}`, { genero: 'H', estaca: 'Ventanilla' })),
    ...Array.from({ length: 4 }, (_, i) => candidato(`m${i}`, { genero: 'M', estaca: 'Ventanilla' })),
  ];
  const { plan } = calcularOActualizarPlanEnVivo({}, 'h0', grupo8, ESTADOS_VACIOS_4);
  const porFamilia = new Map<string, { h: number; m: number }>();
  Object.entries(plan).forEach(([id, famId]) => {
    const actual = porFamilia.get(famId) || { h: 0, m: 0 };
    if (id.startsWith('h')) actual.h++; else actual.m++;
    porFamilia.set(famId, actual);
  });
  porFamilia.forEach(({ h, m }) => assert.ok(Math.abs(h - m) <= 1, `sexo desbalanceado: H=${h} M=${m}`));
});

test('118. calcularOActualizarPlanEnVivo — 2 corridas separadas en el tiempo: la 2da ve el efecto de lo que la 1ra ya escribió de verdad', () => {
  const grupoA = ['a1', 'a2', 'a3'].map((id) => candidato(id, { genero: 'H', estaca: 'Ventanilla' }));
  const { plan: planA } = calcularOActualizarPlanEnVivo({}, 'a1', grupoA, ESTADOS_VACIOS_4);
  // Se "confirman" (escriben) los 3 de verdad — el estado real ahora los refleja.
  const estadosTrasConfirmarA = ESTADOS_VACIOS_4.map((e) => {
    const asignadosAqui = Object.entries(planA).filter(([, fid]) => fid === e.id).length;
    return asignadosAqui ? { ...e, total: asignadosAqui, hombres: asignadosAqui, porEstaca: { ...e.porEstaca, Ventanilla: asignadosAqui } } : e;
  });
  // Nuevo plan (nueva sesión/página, planPrevio vacío) para un grupo B que llega después.
  const grupoB = ['b1', 'b2', 'b3'].map((id) => candidato(id, { genero: 'H', estaca: 'Ventanilla' }));
  const { plan: planB } = calcularOActualizarPlanEnVivo({}, 'b1', grupoB, estadosTrasConfirmarA);
  // La familia que recibió gente del grupo A no debería llevarse TODO el grupo B también.
  const familiaMasCargadaDeA = [...new Set(Object.values(planA))][0];
  const todosEnB_fueronAhi = Object.values(planB).every((fid) => fid === familiaMasCargadaDeA);
  assert.strictEqual(todosEnB_fueronAhi, false, 'el grupo B debería repartirse evitando la familia ya cargada por el grupo A');
});

test('119. calcularOActualizarPlanEnVivo — llamar 2 veces con los mismos argumentos exactos da el mismo resultado (determinismo, sin azar)', () => {
  const grupo5 = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => candidato(id, { genero: i % 2 ? 'H' : 'M', estaca: i % 2 ? 'Ventanilla' : 'Pro Lima' }));
  const resultado1 = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  const resultado2 = calcularOActualizarPlanEnVivo({}, 'p1', grupo5, ESTADOS_VACIOS_4);
  assert.deepStrictEqual(resultado1.plan, resultado2.plan);
});

// ── cumpleanos — Home: quién cumple hoy o esta semana ───────────────────────

function personaConNacimiento(id: string, fechaNacimiento: string): Participante {
  return { ...personaFake(id), fechaNacimiento } as Participante;
}

test('120. diasHastaProximoCumple — hoy mismo da 0', () => {
  assert.strictEqual(diasHastaProximoCumple('2005-03-15', new Date('2027-03-15T12:00:00')), 0);
});

test('121. diasHastaProximoCumple — dentro de este año, cuenta los días que faltan', () => {
  assert.strictEqual(diasHastaProximoCumple('2005-03-20', new Date('2027-03-15T00:00:00')), 5);
});

test('122. diasHastaProximoCumple — ya pasó este año, calcula contra el del año que viene', () => {
  // cumple el 10-ene, hoy es 20-dic: faltan 21 días (11 de lo que queda de dic + 10 de ene)
  assert.strictEqual(diasHastaProximoCumple('2005-01-10', new Date('2027-12-20T00:00:00')), 21);
});

test('123. diasHastaProximoCumple — 29 de febrero en año no bisiesto cae al 1 de marzo', () => {
  assert.strictEqual(diasHastaProximoCumple('2004-02-29', new Date('2027-02-28T00:00:00')), 1);
});

test('124. diasHastaProximoCumple — fecha vacía o inválida da null, no revienta ni da "0 días" falso', () => {
  assert.strictEqual(diasHastaProximoCumple('', new Date('2027-03-15T00:00:00')), null);
  assert.strictEqual(diasHastaProximoCumple('no-es-fecha', new Date('2027-03-15T00:00:00')), null);
});

test('125. calcularCumpleanosProximos — incluye a quien cumple hoy y a quien cumple dentro de la ventana', () => {
  const hoy = new Date('2027-03-15T00:00:00');
  const personas = [
    personaConNacimiento('hoy', '2005-03-15'),
    personaConNacimiento('en3dias', '2005-03-18'),
    personaConNacimiento('lejos', '2005-06-01'),
  ];
  const r = calcularCumpleanosProximos(personas, hoy, 7);
  assert.deepStrictEqual(r.map((x) => x.participante.id), ['hoy', 'en3dias']);
});

test('126. calcularCumpleanosProximos — ordena del más próximo al más lejano, hoy primero', () => {
  const hoy = new Date('2027-03-15T00:00:00');
  const personas = [
    personaConNacimiento('en6', '2005-03-21'),
    personaConNacimiento('hoy', '2005-03-15'),
    personaConNacimiento('en2', '2005-03-17'),
  ];
  const r = calcularCumpleanosProximos(personas, hoy, 7);
  assert.deepStrictEqual(r.map((x) => x.diasFaltantes), [0, 2, 6]);
});

test('127. calcularCumpleanosProximos — ventana de 7 días es inclusiva (día 7 entra, día 8 no)', () => {
  const hoy = new Date('2027-03-15T00:00:00');
  const personas = [personaConNacimiento('dia7', '2005-03-22'), personaConNacimiento('dia8', '2005-03-23')];
  const r = calcularCumpleanosProximos(personas, hoy, 7);
  assert.deepStrictEqual(r.map((x) => x.participante.id), ['dia7']);
});

test('128. calcularCumpleanosProximos — fechaNacimiento vacía no rompe la lista, simplemente no entra', () => {
  const hoy = new Date('2027-03-15T00:00:00');
  const personas = [personaConNacimiento('sinfecha', ''), personaConNacimiento('hoy', '2005-03-15')];
  const r = calcularCumpleanosProximos(personas, hoy, 7);
  assert.deepStrictEqual(r.map((x) => x.participante.id), ['hoy']);
});

test('129. calcularCumpleanosProximos — edadQueCumple es la edad que tendrá ese día, no la edad actual', () => {
  const hoy = new Date('2027-03-15T00:00:00');
  const [r] = calcularCumpleanosProximos([personaConNacimiento('p', '2005-03-20')], hoy, 7);
  assert.strictEqual(r.edadQueCumple, 22); // nace en 2005, cumple en 2027
});

test('130. calcularCumpleanosProximos — lista vacía de participantes no revienta', () => {
  assert.deepStrictEqual(calcularCumpleanosProximos([], new Date('2027-03-15T00:00:00'), 7), []);
});

// ── familiasDeAuxiliar — a qué familias puede entrar un Coordinador Auxiliar ─

function famAux(n: number): Familia {
  return { id: `f${n}`, nombre: `Familia ${n}`, customName: '', colorId: '', consejeros: [] };
}
function cpAux(id: string, familiaId: string, p1Id: string, p2Id: string): Companerismo {
  return { id, familiaId, p1Id, p2Id };
}
const FAMS_AUX = [famAux(1), famAux(2), famAux(3), famAux(10)];

test('131. familiasDeAuxiliar — devuelve solo la familia donde está en un compañerismo (como P1)', () => {
  const r = familiasDeAuxiliar('aux1', [cpAux('c1', 'f2', 'aux1', 'otro'), cpAux('c2', 'f3', 'x', 'y')], FAMS_AUX);
  assert.deepStrictEqual(r.map((f) => f.id), ['f2']);
});

test('132. familiasDeAuxiliar — también lo encuentra si está en el slot P2', () => {
  const r = familiasDeAuxiliar('aux1', [cpAux('c1', 'f3', 'otro', 'aux1')], FAMS_AUX);
  assert.deepStrictEqual(r.map((f) => f.id), ['f3']);
});

test('133. familiasDeAuxiliar — en varios compañerismos: devuelve todas sus familias, orden numérico (2 antes que 10)', () => {
  const r = familiasDeAuxiliar('aux1', [cpAux('c1', 'f10', 'aux1', ''), cpAux('c2', 'f2', '', 'aux1')], FAMS_AUX);
  assert.deepStrictEqual(r.map((f) => f.id), ['f2', 'f10']);
});

test('134. familiasDeAuxiliar — sin compañerismo no ve ninguna familia (no cae a "todas")', () => {
  assert.deepStrictEqual(familiasDeAuxiliar('aux1', [cpAux('c1', 'f1', 'otro', 'otro2')], FAMS_AUX), []);
  assert.deepStrictEqual(familiasDeAuxiliar('aux1', [], FAMS_AUX), []);
});

test('135. familiasDeAuxiliar — participanteId desconocido (correo sin registro) no ve nada', () => {
  assert.deepStrictEqual(familiasDeAuxiliar(undefined, [cpAux('c1', 'f1', '', '')], FAMS_AUX), []);
  assert.deepStrictEqual(familiasDeAuxiliar('', [cpAux('c1', 'f1', '', '')], FAMS_AUX), []);
});

test('136. familiasDeAuxiliar — ignora compañerismos huérfanos (familia ya eliminada)', () => {
  assert.deepStrictEqual(familiasDeAuxiliar('aux1', [cpAux('c1', 'f99', 'aux1', '')], FAMS_AUX), []);
});

test('137. familiasDeAuxiliar — dos compañerismos de la misma familia no la duplican', () => {
  const r = familiasDeAuxiliar('aux1', [cpAux('c1', 'f1', 'aux1', 'a'), cpAux('c2', 'f1', 'b', 'aux1')], FAMS_AUX);
  assert.deepStrictEqual(r.map((f) => f.id), ['f1']);
});

// ── Tipos de evento (capacitación, baile, noche de hogar, otra) ─────────────

function eventoTipado(id: string, fecha: string, tipo?: string): Capacitacion {
  return { ...capFake(id, fecha), ...(tipo ? { tipo } : {}) } as Capacitacion;
}

test('138. tipoDe — un evento viejo sin tipo cuenta como capacitación', () => {
  assert.strictEqual(tipoDe(eventoTipado('a', '2027-01-03')), 'capacitacion');
});

test('139. tipoDe — respeta un tipo válido, y uno desconocido o vacío cae a capacitación', () => {
  assert.strictEqual(tipoDe(eventoTipado('a', '2027-01-03', 'baile')), 'baile');
  assert.strictEqual(tipoDe(eventoTipado('b', '2027-01-03', 'noche_hogar')), 'noche_hogar');
  assert.strictEqual(tipoDe(eventoTipado('c', '2027-01-03', 'inventado')), 'capacitacion');
  assert.strictEqual(tipoDe(eventoTipado('d', '2027-01-03', '')), 'capacitacion');
});

test('140. filtrarPorTipos — lista vacía deja pasar todo; uno o varios tipos dejan solo esos (los sin tipo van con capacitación)', () => {
  const caps = [eventoTipado('a', '2027-01-03'), eventoTipado('b', '2027-01-10', 'baile'), eventoTipado('c', '2027-01-17', 'capacitacion')];
  assert.strictEqual(filtrarPorTipos(caps, []).length, 3);
  assert.deepStrictEqual(filtrarPorTipos(caps, ['capacitacion', 'baile']).map((c) => c.id), ['a', 'b', 'c']);
  assert.deepStrictEqual(filtrarPorTipos(caps, ['capacitacion']).map((c) => c.id), ['a', 'c']);
  assert.deepStrictEqual(filtrarPorTipos(caps, ['baile']).map((c) => c.id), ['b']);
  assert.deepStrictEqual(filtrarPorTipos(caps, ['otro']), []);
});

test('141. contarPorTipo — cuenta por tipo y omite los tipos que no existen', () => {
  const caps = [eventoTipado('a', '2027-01-03'), eventoTipado('b', '2027-01-10', 'baile'), eventoTipado('c', '2027-01-17', 'baile')];
  assert.deepStrictEqual(contarPorTipo(caps), [{ tipo: 'capacitacion', n: 1 }, { tipo: 'baile', n: 2 }]);
});

test('142. el promedio por tipo no se contamina: un baile con poca asistencia no baja el de las capacitaciones', () => {
  const gente = ['a', 'b', 'c', 'd'].map(personaFake);
  const cap = eventoTipado('cap1', '2027-01-03');
  const baile = eventoTipado('baile1', '2027-01-10', 'baile');
  const asis: Asistencia[] = [
    ...gente.map((p) => ({ capacitacionId: 'cap1', participanteId: p.id, estado: 'presente' as const, timestamp: '' })), // 100%
    { capacitacionId: 'baile1', participanteId: 'a', estado: 'presente' as const, timestamp: '' }, // 25%
  ];
  const todos = promedioAsistencia(calcularAsistenciaPorCapacitacion(gente, [cap, baile], asis));
  const soloCap = promedioAsistencia(calcularAsistenciaPorCapacitacion(gente, filtrarPorTipos([cap, baile], ['capacitacion']), asis));
  const soloBaile = promedioAsistencia(calcularAsistenciaPorCapacitacion(gente, filtrarPorTipos([cap, baile], ['baile']), asis));
  assert.strictEqual(todos, 63); // mezclado: (100+25)/2
  assert.strictEqual(soloCap, 100);
  assert.strictEqual(soloBaile, 25);
});

test('143. soloOcurridas — quita lo futuro sin marcas; deja hoy, lo pasado y lo futuro que ya tiene marcas', () => {
  const gente = [personaFake('a')];
  const caps = [
    eventoTipado('pasada', '2027-01-03'),
    eventoTipado('hoy', '2027-01-10'),
    eventoTipado('futura', '2027-02-01'),
    eventoTipado('futuraConMarca', '2027-02-08'),
  ];
  const asis: Asistencia[] = [{ capacitacionId: 'futuraConMarca', participanteId: 'a', estado: 'presente', timestamp: '' }];
  const r = soloOcurridas(calcularAsistenciaPorCapacitacion(gente, caps, asis), '2027-01-10');
  assert.deepStrictEqual(r.map((d) => d.cap.id), ['pasada', 'hoy', 'futuraConMarca']);
});

test('144. hoyLocalISO — usa la fecha local, no UTC (a las 11pm en Lima sigue siendo el mismo día)', () => {
  assert.strictEqual(hoyLocalISO(new Date(2027, 0, 5, 23, 30)), '2027-01-05');
  assert.strictEqual(hoyLocalISO(new Date(2027, 11, 1, 0, 5)), '2027-12-01');
});

// ── Seguimiento (retención) ─────────────────────────────────────────────
// Todos los eventos están en el pasado respecto a AHORA_SEG; la gente se registró el 2027-01-01.
const AHORA_SEG = new Date('2027-03-01T12:00:00');
function evSeg(n: number, tipo?: string): Capacitacion {
  const dia = String(n + 1).padStart(2, '0'); // e1 → 2027-02-02 … ordenados por n
  return { ...capFake(`e${n}`, `2027-02-${dia}`), hora: '10:00', horaFin: '12:00', ...(tipo ? { tipo } : {}) } as Capacitacion;
}
function marca(ev: number, who: string, estado: 'presente' | 'ausente' | 'justificado'): Asistencia {
  return { capacitacionId: `e${ev}`, participanteId: who, estado, timestamp: '' } as Asistencia;
}
function seg(ids: string[], caps: Capacitacion[], asis: Asistencia[], ahora = AHORA_SEG) {
  return calcularSeguimiento(ids.map(personaFake), caps, asis, ahora).map((i) => `${i.participante.id}:${i.categoria}`);
}
const E4 = [1, 2, 3, 4].map((n) => evSeg(n));

test('145. seguimiento — sin eventos terminados no hay a quién seguir', () => {
  assert.deepStrictEqual(seg(['a'], [], []), []);
  assert.deepStrictEqual(seg(['a'], [evSeg(1)], [], new Date('2027-02-02T10:30:00')), []); // en curso
});

test('146. seguimiento — "siempre asiste" que faltó al último', () => {
  const asis = [marca(1, 'a', 'presente'), marca(2, 'a', 'presente'), marca(3, 'a', 'presente'), marca(4, 'a', 'ausente')];
  assert.deepStrictEqual(seg(['a'], E4, asis), ['a:siempre_asiste_falto']);
});

test('147. seguimiento — con asistencia previa bajo 75% no es "siempre asiste"', () => {
  const asis = [marca(1, 'a', 'presente'), marca(2, 'a', 'ausente'), marca(3, 'a', 'presente')]; // 2/3 previos y falta el 4
  assert.deepStrictEqual(seg(['a'], E4, asis), []);
});

test('148. seguimiento — vino por primera vez y faltó al siguiente (cualquier tipo de evento)', () => {
  const caps = [evSeg(1), evSeg(2, 'baile')];
  assert.deepStrictEqual(seg(['a'], caps, [marca(1, 'a', 'presente')]), ['a:primera_vez_falto']);
});

test('149. seguimiento — una falta justificada no dispara seguimiento', () => {
  const asis = [marca(1, 'a', 'presente'), marca(2, 'a', 'presente'), marca(3, 'a', 'presente'), marca(4, 'a', 'justificado')];
  assert.deepStrictEqual(seg(['a'], E4, asis), []);
});

test('150. seguimiento — dos faltas seguidas (sin marca cuenta como falta)', () => {
  const asis = [marca(1, 'a', 'presente'), marca(2, 'a', 'presente'), marca(3, 'a', 'ausente')]; // e4 sin marca
  assert.deepStrictEqual(seg(['a'], E4, asis), ['a:dos_faltas']);
});

test('151. seguimiento — vino una sola vez y no volvió en 2+ eventos: "solo una vez", no "dos faltas"', () => {
  assert.deepStrictEqual(seg(['a'], E4, [marca(1, 'a', 'presente')]), ['a:solo_una_vez']);
});

test('152. seguimiento — "dos faltas" gana sobre "siempre asiste"', () => {
  const asis = [marca(1, 'a', 'presente'), marca(2, 'a', 'presente'), marca(3, 'a', 'presente'), marca(4, 'a', 'presente')];
  const caps = [...E4, evSeg(5), evSeg(6)];
  const asis2 = [...asis, marca(5, 'a', 'ausente')]; // e5 ausente y e6 sin marca
  assert.deepStrictEqual(seg(['a'], caps, asis2), ['a:dos_faltas']);
});

test('153. seguimiento — eventos futuros o en curso no cuentan como falta', () => {
  const caps = [evSeg(1), evSeg(2)];
  const asis = [marca(1, 'a', 'presente')];
  assert.deepStrictEqual(seg(['a'], caps, asis, new Date('2027-02-03T10:30:00')), []); // e2 en curso
  assert.deepStrictEqual(seg(['a'], caps, asis, new Date('2027-02-02T13:00:00')), []); // e2 aún futuro
});

test('154. seguimiento — quien se registró después del último evento no "faltó" a él', () => {
  const tarde = { ...personaFake('t'), timestamp: new Date('2027-02-20T00:00:00').toISOString() } as Participante;
  assert.deepStrictEqual(calcularSeguimiento([tarde], E4, [], AHORA_SEG), []);
});

test('155. seguimiento — un "presente" cuenta aunque sea anterior a su registro', () => {
  const tarde = { ...personaFake('t'), timestamp: new Date('2027-02-03T11:00:00').toISOString() } as Participante;
  const r = calcularSeguimiento([tarde], E4, [marca(1, 't', 'presente')], AHORA_SEG);
  assert.deepStrictEqual(r.map((i) => i.categoria), ['solo_una_vez']);
});

test('156. seguimiento — filtrar por tipo antes de calcular cambia quién aparece', () => {
  const caps = [evSeg(1), evSeg(2, 'baile'), evSeg(3)];
  const asis = [marca(1, 'a', 'presente'), marca(3, 'a', 'presente'), marca(2, 'a', 'ausente')];
  assert.deepStrictEqual(seg(['a'], caps, asis), []); // último (e3) sí vino
  const soloCaps = filtrarPorTipos(caps, ['capacitacion']);
  assert.deepStrictEqual(seg(['a'], soloCaps, asis), []);
  const asis2 = [marca(1, 'a', 'presente'), marca(2, 'a', 'ausente'), marca(3, 'a', 'ausente')];
  assert.deepStrictEqual(seg(['a'], filtrarPorTipos(caps, ['baile']), asis2), []); // un solo evento baile y no hay elegibilidad previa
});

test('157. seguimiento — quien nunca vino y faltó solo a uno no aparece; un grupo por persona', () => {
  assert.deepStrictEqual(seg(['n'], [evSeg(1)], []), []);
  const asis = [marca(1, 'a', 'presente')];
  const r = calcularSeguimiento(['a', 'b'].map(personaFake), E4, asis, AHORA_SEG);
  assert.strictEqual(new Set(r.map((i) => i.participante.id)).size, r.length);
});

test('158. seguimiento — orden: quien más asistió primero, luego por nombre', () => {
  const caps = [...E4];
  const asis = [
    marca(1, 'x', 'presente'), marca(2, 'x', 'presente'), marca(3, 'x', 'presente'), marca(4, 'x', 'ausente'),
    marca(1, 'y', 'presente'), marca(2, 'y', 'presente'), marca(3, 'y', 'presente'), marca(4, 'y', 'presente'),
    marca(1, 'z', 'presente'), marca(2, 'z', 'presente'), marca(3, 'z', 'presente'), marca(4, 'z', 'ausente'),
  ];
  assert.deepStrictEqual(seg(['z', 'y', 'x'], caps, asis), ['x:siempre_asiste_falto', 'z:siempre_asiste_falto']);
});

// ── Historial (log de cambios legible) ──────────────────────────────────
const CTX_H = {
  participantes: [{ ...personaFake('ana'), nombres: 'Ana', apellidos: 'Pérez Soto', correo: 'ana@correo.com' } as Participante, { ...personaFake('juan'), nombres: 'Juan', apellidos: 'Lopez Diaz' } as Participante],
  familias: [{ id: 'f1', nombre: 'Familia 1', customName: 'Leones', colorId: 'x', consejeros: [] } as Familia, { id: 'f2', nombre: 'Familia 2', customName: '', colorId: 'y', consejeros: [] } as Familia],
  capacitaciones: [capFake('e1', '2027-02-02')],
};
function logH(accion: string, detalles: unknown, participanteId = '', admin = 'ana@correo.com', timestamp = '2027-03-01T15:00:00.000Z'): AuditLog {
  return { id: `${accion}-${participanteId}-${timestamp}`, timestamp, admin, accion, participanteId, detalles: JSON.stringify(detalles) };
}

test('159. historial — marcar asistencia dice quién, a quién, qué y en qué evento', () => {
  const e = describirEntrada(logH('MARCAR_ASISTENCIA', { capacitacionId: 'e1', estado: 'presente' }, 'juan'), CTX_H);
  assert.strictEqual(e.grupo, 'asistencia');
  assert.ok(e.actor.startsWith('Ana'));
  assert.ok(e.texto.includes('presente') && e.texto.includes('Juan') && e.texto.includes(CTX_H.capacitaciones[0].label));
});

test('160. historial — editar persona muestra "antes → después" y traduce la familia a su nombre', () => {
  const e = describirEntrada(logH('ACTUALIZAR_PARTICIPANTE', { asignacion: 'Logístico', familiaId: 'f1', _antes: { asignacion: 'Consejero', familiaId: '' } }, 'juan'), CTX_H);
  assert.ok(e.texto.includes('rol: Consejero → Logístico'));
  assert.ok(e.texto.includes('familia: sin compañía → Leones'));
  assert.ok(!e.texto.includes('_antes'));
});

test('161. historial — un log viejo (sin _antes) igual se entiende', () => {
  const e = describirEntrada(logH('ACTUALIZAR_PARTICIPANTE', { telefono: '999' }, 'juan'), CTX_H);
  assert.ok(e.texto.includes('teléfono: 999'));
});

test('162. historial — ids que ya no existen no rompen: caen a "una persona/familia/evento"', () => {
  assert.ok(describirEntrada(logH('AÑADIR_MIEMBRO_FAMILIA', { familiaId: 'borrada' }, 'nadie'), CTX_H).texto.includes('una persona'));
  assert.ok(describirEntrada(logH('MARCAR_ASISTENCIA', { capacitacionId: 'zzz', estado: 'ausente' }, 'juan'), CTX_H).texto.includes('un evento'));
});

test('163. historial — acción desconocida o detalles no-JSON se muestran sin fallar', () => {
  const raro = { id: 'x', timestamp: '2027-03-01T15:00:00Z', admin: '', accion: 'COSA_NUEVA_X', participanteId: '', detalles: 'no es json' } as AuditLog;
  const e = describirEntrada(raro, CTX_H);
  assert.strictEqual(e.texto, 'cosa nueva x');
  assert.strictEqual(e.actor, 'sistema');
});

test('164. historial — grupos: accesos aparte, usuarios, familias, eventos y personas', () => {
  assert.strictEqual(grupoDeAccion('LOGIN_EXITOSO'), 'accesos');
  assert.strictEqual(grupoDeAccion('SETUP_PASSWORD_FIRST_TIME'), 'accesos');
  assert.strictEqual(grupoDeAccion('CREAR_USUARIO'), 'usuarios');
  assert.strictEqual(grupoDeAccion('ELIMINAR_COMPANERISMO'), 'familias');
  assert.strictEqual(grupoDeAccion('REPARTO_FAMILIAS_EJECUTADO'), 'familias');
  assert.strictEqual(grupoDeAccion('CREAR_NOCHE_HOGAR'), 'eventos');
  assert.strictEqual(grupoDeAccion('ACTUALIZAR_CAPACITACION'), 'eventos');
  assert.strictEqual(grupoDeAccion('ACTUALIZAR_PARTICIPANTE'), 'personas');
});

test('165. historial — "Cambios" (por defecto) oculta los accesos; "Accesos" solo los muestra', () => {
  const es = [logH('LOGIN_EXITOSO', {}), logH('MARCAR_ASISTENCIA', { capacitacionId: 'e1', estado: 'presente' }, 'juan')].map((l) => describirEntrada(l, CTX_H));
  const ahora = new Date('2027-03-01T18:00:00Z');
  assert.deepStrictEqual(filtrarHistorial(es, { grupo: 'cambios', rango: 'todo', texto: '' }, ahora).map((e) => e.grupo), ['asistencia']);
  assert.deepStrictEqual(filtrarHistorial(es, { grupo: 'accesos', rango: 'todo', texto: '' }, ahora).map((e) => e.grupo), ['accesos']);
});

test('166. historial — rango "hoy" y "7 días" respetan la fecha local; "todo" no recorta', () => {
  const ahora = new Date(2027, 2, 10, 12, 0);
  const mk = (d: Date) => describirEntrada(logH('CREAR_FAMILIA', { nombre: 'F' }, '', 'ana@correo.com', d.toISOString()), CTX_H);
  const es = [mk(new Date(2027, 2, 10, 8, 0)), mk(new Date(2027, 2, 5, 8, 0)), mk(new Date(2027, 1, 1, 8, 0))];
  assert.strictEqual(filtrarHistorial(es, { grupo: 'cambios', rango: 'hoy', texto: '' }, ahora).length, 1);
  assert.strictEqual(filtrarHistorial(es, { grupo: 'cambios', rango: '7d', texto: '' }, ahora).length, 2);
  assert.strictEqual(filtrarHistorial(es, { grupo: 'cambios', rango: 'todo', texto: '' }, ahora).length, 3);
});

test('167. historial — la búsqueda por texto encuentra por usuario o por persona, sin importar mayúsculas', () => {
  const es = [
    logH('MARCAR_ASISTENCIA', { capacitacionId: 'e1', estado: 'presente' }, 'juan', 'ana@correo.com'),
    logH('MARCAR_ASISTENCIA', { capacitacionId: 'e1', estado: 'presente' }, 'ana', 'otro@correo.com'),
  ].map((l) => describirEntrada(l, CTX_H));
  const f = (texto: string) => filtrarHistorial(es, { grupo: 'cambios', rango: 'todo', texto }, new Date('2027-03-02T00:00:00Z'));
  assert.strictEqual(f('JUAN').length, 1);
  assert.strictEqual(f('otro@correo').length, 1);
  assert.strictEqual(f('presente').length, 2);
  assert.strictEqual(f('nadie').length, 0);
});

test('168. historial — etiquetaDia: Hoy, Ayer y fecha corta', () => {
  const ahora = new Date(2027, 2, 10, 12, 0);
  assert.strictEqual(etiquetaDia(new Date(2027, 2, 10, 1, 0).toISOString(), ahora), 'Hoy');
  assert.strictEqual(etiquetaDia(new Date(2027, 2, 9, 23, 0).toISOString(), ahora), 'Ayer');
  assert.ok(etiquetaDia(new Date(2027, 2, 1, 9, 0).toISOString(), ahora).length > 4);
  assert.strictEqual(etiquetaDia('basura', ahora), 'Sin fecha');
});

test('169. formatAuditDetails — con _antes muestra "antes → ahora" y no imprime _antes', () => {
  const t = formatAuditDetails(JSON.stringify({ asignacion: 'Logístico', _antes: { asignacion: 'Consejero' } }));
  assert.strictEqual(t, 'asignacion: Consejero → Logístico');
  assert.strictEqual(formatAuditDetails(JSON.stringify({ a: 1 })), 'a: 1');
});

// ── Rendimiento: suscripciones compartidas e índices ────────────────────
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('170. suscripcionCompartida — varios oyentes abren UNA sola conexión y todos reciben los datos', () => {
  let aperturas = 0;
  let emitir: (v: number) => void = () => {};
  const sub = suscripcionCompartida<number>((e) => { aperturas++; emitir = e; return () => {}; });
  const a: number[] = [], b: number[] = [];
  sub((v) => a.push(v));
  sub((v) => b.push(v));
  emitir(7);
  assert.strictEqual(aperturas, 1);
  assert.deepStrictEqual(a, [7]);
  assert.deepStrictEqual(b, [7]);
});

test('171. suscripcionCompartida — un oyente tardío recibe el último dato al instante (sin reabrir)', () => {
  let aperturas = 0;
  let emitir: (v: string) => void = () => {};
  const sub = suscripcionCompartida<string>((e) => { aperturas++; emitir = e; return () => {}; });
  sub(() => {});
  emitir('datos');
  const tardio: string[] = [];
  sub((v) => tardio.push(v));
  assert.deepStrictEqual(tardio, ['datos']);
  assert.strictEqual(aperturas, 1);
});

test('172. suscripcionCompartida — al irse el último, la conexión sigue abierta durante la gracia y se reutiliza', async () => {
  let aperturas = 0, cierres = 0;
  let emitir: (v: number) => void = () => {};
  const sub = suscripcionCompartida<number>((e) => { aperturas++; emitir = e; return () => { cierres++; }; }, 40);
  const off = sub(() => {});
  emitir(1);
  off();
  await espera(10);
  const vistos: number[] = [];
  sub((v) => vistos.push(v)); // vuelve dentro de la gracia
  assert.deepStrictEqual(vistos, [1]);
  assert.strictEqual(aperturas, 1);
  assert.strictEqual(cierres, 0);
});

test('173. suscripcionCompartida — pasada la gracia sin oyentes se cierra, y un nuevo oyente la reabre', async () => {
  let aperturas = 0, cierres = 0;
  const sub = suscripcionCompartida<number>(() => { aperturas++; return () => { cierres++; }; }, 20);
  sub(() => {})();
  await espera(60);
  assert.strictEqual(cierres, 1);
  sub(() => {});
  assert.strictEqual(aperturas, 2);
});

test('174. historial — describirEntradas indexa una vez y da el mismo resultado que describir una por una', () => {
  const logs = [
    logH('MARCAR_ASISTENCIA', { capacitacionId: 'e1', estado: 'presente' }, 'juan'),
    logH('AÑADIR_MIEMBRO_FAMILIA', { familiaId: 'f2' }, 'ana'),
  ];
  const lote = describirEntradas(logs, CTX_H);
  assert.deepStrictEqual(lote.map((e) => e.texto), logs.map((l) => describirEntrada(l, CTX_H).texto));
  assert.ok(lote[1].texto.includes('Compañía 2')); // sin customName cae al nombre
});

// ── Asistencia: selector agrupado y deshacer ────────────────────────────
test('175. agruparEventosParaSelector — "Hoy y próximos" ascendente, "Pasados" del más reciente al más antiguo', () => {
  const caps = [eventoTipado('a', '2027-01-03'), eventoTipado('b', '2027-01-20'), eventoTipado('c', '2027-01-10'), eventoTipado('d', '2027-01-15'), eventoTipado('e', '2027-02-01')];
  const g = agruparEventosParaSelector(caps, '2027-01-15');
  assert.deepStrictEqual(g.proximos.map((c) => c.id), ['d', 'b', 'e']); // hoy cuenta como próximo
  assert.deepStrictEqual(g.pasados.map((c) => c.id), ['c', 'a']);
  assert.deepStrictEqual(agruparEventosParaSelector([], '2027-01-15'), { proximos: [], pasados: [] });
});

test('176. quitarMarca — vuelve a "sin marca" y no toca a los demás (modo local)', async () => {
  let actual: Record<string, Asistencia> = {};
  const off = subscribeAsistencia('capQ', (m) => { actual = m; });
  await marcarAsistencia('capQ', 'p1', 'presente', 'admin@x.com');
  await marcarAsistencia('capQ', 'p2', 'presente', 'admin@x.com');
  assert.deepStrictEqual(Object.keys(actual).sort(), ['p1', 'p2']);
  await quitarMarca('capQ', 'p1', 'admin@x.com');
  assert.deepStrictEqual(Object.keys(actual), ['p2']);
  await quitarMarca('capQ', 'inexistente', 'admin@x.com'); // no falla
  off();
});

test('177. historial — quitar marca se describe y cae en el grupo Asistencia', () => {
  const e = describirEntrada(logH('QUITAR_ASISTENCIA', { capacitacionId: 'e1' }, 'juan'), CTX_H);
  assert.strictEqual(e.grupo, 'asistencia');
  assert.ok(e.texto.startsWith('quitó la marca de Juan'));
});

// ── Compañías en Asistencia: número, filtro y avance ────────────────────
const FAMS_C = [
  { id: 'fa', nombre: 'Familia 1', customName: 'Compañía 1', colorId: 'rojo', consejeros: [] },
  { id: 'fb', nombre: 'Familia 2', customName: '', colorId: 'amarillo', consejeros: [] },
  { id: 'fc', nombre: 'Equipo especial', customName: '', colorId: 'noexiste', consejeros: [] },
] as Familia[];
const GENTE_C = [
  { ...personaFake('a1'), familiaId: 'fa' },
  { ...personaFake('a2'), familiaId: 'fa' },
  { ...personaFake('b1'), familiaId: 'fb' },
  { ...personaFake('s1'), familiaId: '' },
  { ...personaFake('h1'), familiaId: 'eliminada' },
] as Participante[];

test('178. infoCompanias — número desde el nombre, posición si no tiene número, color con respaldo', () => {
  const m = infoCompanias(FAMS_C);
  assert.strictEqual(m.get('fa')?.numero, 1);
  assert.strictEqual(m.get('fb')?.numero, 2);
  assert.strictEqual(m.get('fc')?.numero, 3); // "Equipo especial" no trae número: usa su posición
  assert.strictEqual(m.get('fa')?.nombre, 'Compañía 1');
  assert.strictEqual(m.get('fb')?.nombre, 'Compañía 2'); // sin nombre personalizado
  assert.strictEqual(m.get('fc')?.hex, '#94A3B8'); // color desconocido → gris
  assert.strictEqual(m.get('inexistente'), undefined);
});

test('179. filtrarPorCompania — todas, una compañía, y "sin" incluye también a quien apunta a una compañía eliminada', () => {
  const m = infoCompanias(FAMS_C);
  assert.strictEqual(filtrarPorCompania(GENTE_C, '', m).length, 5);
  assert.deepStrictEqual(filtrarPorCompania(GENTE_C, 'fa', m).map((p) => p.id), ['a1', 'a2']);
  assert.deepStrictEqual(filtrarPorCompania(GENTE_C, 'sin', m).map((p) => p.id), ['s1', 'h1']);
  assert.deepStrictEqual(filtrarPorCompania(GENTE_C, 'fc', m), []);
});

test('180. resumenGrupo — avance del grupo filtrado, solo cuenta "presente", y un grupo vacío no divide por cero', () => {
  const asis = { a1: { estado: 'presente' }, a2: { estado: 'justificado' }, b1: { estado: 'presente' } };
  const m = infoCompanias(FAMS_C);
  assert.deepStrictEqual(resumenGrupo(filtrarPorCompania(GENTE_C, 'fa', m), asis), { presentes: 1, total: 2, pct: 50 });
  assert.deepStrictEqual(resumenGrupo(GENTE_C, asis), { presentes: 2, total: 5, pct: 40 });
  assert.deepStrictEqual(resumenGrupo([], asis), { presentes: 0, total: 0, pct: 0 });
});


// ── Compañerismos de trabajo dentro de la familia ──────────────────────────
const FAM_P = { id: 'F1', nombre: 'Familia 1', customName: '', colorId: 'rojo', consejeros: ['u1', 'u2', 'u3', 'u4', 'u5'] } as Familia;
const GENTE_P = ['u1', 'u2', 'u3', 'u4', 'u5', 'x9'].map((id, i) => ({
  ...personaFake(id),
  familiaId: id === 'x9' ? 'F2' : 'F1',
  genero: i % 2 ? 'M' : 'H',
})) as Participante[];
const MIEMBROS_P = GENTE_P.filter((p) => p.familiaId === 'F1');

test('181. vistaFamilia — grupos, sin compañero, y quien salió de la familia sale del grupo', () => {
  const parejas = [{ id: 'g1', familiaId: 'F1', miembros: ['u1', 'u2'] }, { id: 'g2', familiaId: 'F1', miembros: ['u3', 'u4', 'u5'] }];
  const v = vistaFamilia(FAM_P, parejas, MIEMBROS_P);
  assert.strictEqual(v.grupos.length, 2);
  assert.strictEqual(v.sinCompanero.length, 0);
  // u5 sale de la compañía: el trío pasa a dupla; si sale otro más, el grupo desaparece y el que queda figura "sin compañero"
  const sin5 = MIEMBROS_P.filter((p) => p.id !== 'u5');
  assert.deepStrictEqual(vistaFamilia(FAM_P, parejas, sin5).grupos.map((g) => g.personas.length).sort(), [2, 2]);
  const sin45 = sin5.filter((p) => p.id !== 'u4');
  const v2 = vistaFamilia(FAM_P, parejas, sin45);
  assert.deepStrictEqual(v2.grupos.map((g) => g.id), ['g1']);
  assert.deepStrictEqual(v2.sinCompanero.map((p) => p.id), ['u3']);
  assert.deepStrictEqual(resumenCompaneros(FAM_P, parejas, sin45), { grupos: 1, sinCompanero: 1 });
});

test('182. vistaFamilia — ignora grupos de otra familia y una persona duplicada solo cuenta en un grupo', () => {
  const parejas = [
    { id: 'g1', familiaId: 'F1', miembros: ['u1', 'u2'] },
    { id: 'gX', familiaId: 'F2', miembros: ['x9', 'u3'] },
    { id: 'g3', familiaId: 'F1', miembros: ['u2', 'u3'] }, // u2 ya está en g1
  ];
  const v = vistaFamilia(FAM_P, parejas, MIEMBROS_P);
  assert.deepStrictEqual(v.grupos.map((g) => g.id), ['g1']);
  assert.deepStrictEqual(v.sinCompanero.map((p) => p.id).sort(), ['u3', 'u4', 'u5']);
});

test('183. planearGuardado — valida 2 a 3 personas distintas', () => {
  const base = { familiaId: 'F1', id: null, existentes: [], nuevoId: 'n1' };
  assert.throws(() => planearGuardado({ ...base, miembros: ['u1'] }), /al menos 2/);
  assert.throws(() => planearGuardado({ ...base, miembros: ['u1', 'u1'] }), /al menos 2/); // repetida = 1 persona
  assert.throws(() => planearGuardado({ ...base, miembros: ['u1', 'u2', 'u3', 'u4'] }), /3 personas/);
  assert.deepStrictEqual(planearGuardado({ ...base, miembros: ['u1', 'u2', 'u3'] }).guardar, { id: 'n1', familiaId: 'F1', miembros: ['u1', 'u2', 'u3'] });
  assert.strictEqual(planearGuardado({ ...base, id: 'viejo', miembros: ['u1', 'u2'] }).guardar.id, 'viejo');
});

test('184. planearGuardado — mover a alguien lo saca de su grupo anterior (se achica o se deshace)', () => {
  const existentes = [
    { id: 'g1', familiaId: 'F1', miembros: ['u1', 'u2'] },
    { id: 'g2', familiaId: 'F1', miembros: ['u3', 'u4', 'u5'] },
    { id: 'gX', familiaId: 'F2', miembros: ['u1', 'x9'] }, // otra familia: no se toca
  ];
  const plan = planearGuardado({ familiaId: 'F1', id: null, miembros: ['u2', 'u3'], existentes, nuevoId: 'n' });
  assert.deepStrictEqual(plan.borrar, ['g1']); // g1 queda solo con u1 → se deshace
  assert.deepStrictEqual(plan.actualizar, [{ id: 'g2', familiaId: 'F1', miembros: ['u4', 'u5'] }]); // trío → dupla
  // Cambiar un grupo sin mover a nadie de otro no toca nada más
  const igual = planearGuardado({ familiaId: 'F1', id: 'g1', miembros: ['u1', 'u2'], existentes, nuevoId: 'n' });
  assert.deepStrictEqual([igual.borrar, igual.actualizar], [[], []]);
});

test('185. companerosDe — compañeros actuales; vacío sin grupo, sin compañía o si el otro ya salió', () => {
  const todos = new Map(GENTE_P.map((p) => [p.id, p]));
  const parejas = [{ id: 'g1', familiaId: 'F1', miembros: ['u1', 'u2', 'u3'] }];
  assert.deepStrictEqual(companerosDe(todos.get('u1')!, parejas, todos).map((p) => p.id), ['u2', 'u3']);
  assert.deepStrictEqual(companerosDe(todos.get('u4')!, parejas, todos), []);
  assert.deepStrictEqual(companerosDe(todos.get('x9')!, parejas, todos), []); // otra familia
  const sinCompania = new Map(todos).set('u2', { ...todos.get('u2')!, familiaId: '' });
  assert.deepStrictEqual(companerosDe(todos.get('u1')!, parejas, sinCompania).map((p) => p.id), ['u3']);
  assert.deepStrictEqual(companerosDe({ ...todos.get('u1')!, familiaId: '' }, parejas, todos), []);
});

test('186. guardarPareja / deshacerPareja (modo local) — arma, cambia y deshace; solo integrantes de la familia; sin duplicar personas', async () => {
  let ultimo: ParejaTrabajo[] = [];
  const baja = subscribeParejas((x) => (ultimo = x));
  const a = await guardarPareja(FAM_P, null, ['u1', 'u2'], ultimo, 'a@x.com');
  assert.strictEqual(ultimo.length, 1);
  await assert.rejects(() => guardarPareja(FAM_P, null, ['u1', 'x9'], ultimo, 'a@x.com'), /integrantes de esta compañía/);
  // u2 pasa a otro grupo con u3: el grupo viejo (u1 solo) se deshace
  await guardarPareja(FAM_P, null, ['u2', 'u3'], ultimo, 'a@x.com');
  assert.strictEqual(ultimo.length, 1);
  assert.deepStrictEqual(ultimo[0].miembros, ['u2', 'u3']);
  // cambiar el grupo existente (misma id) a un trío
  const b = ultimo[0];
  await guardarPareja(FAM_P, b.id, ['u2', 'u3', 'u4'], ultimo, 'a@x.com');
  assert.deepStrictEqual(ultimo.find((x) => x.id === b.id)?.miembros, ['u2', 'u3', 'u4']);
  await deshacerPareja(ultimo[0], 'a@x.com');
  assert.strictEqual(ultimo.length, 0);
  void a;
  baja();
});

test('187. historial — describe armar, cambiar y deshacer un compañerismo de trabajo, dentro del grupo "Familias"', () => {
  const ctx = { participantes: GENTE_P, capacitaciones: [], familias: [FAM_P] };
  const mk = (accion: string): AuditLog => ({ id: accion, timestamp: '2026-10-11T10:00:00', admin: 'a@x.com', accion, participanteId: '', detalles: JSON.stringify({ familiaId: 'F1', miembros: ['u1', 'u2'] }) } as AuditLog);
  assert.strictEqual(grupoDeAccion('ARMAR_COMPANERISMO_FAMILIA'), 'familias');
  assert.strictEqual(grupoDeAccion('DESHACER_COMPANERISMO_FAMILIA'), 'familias');
  const e = describirEntradas([mk('ARMAR_COMPANERISMO_FAMILIA'), mk('CAMBIAR_COMPANERISMO_FAMILIA'), mk('DESHACER_COMPANERISMO_FAMILIA')], ctx).map((x) => x.texto);
  assert.ok(/armó un compañerismo de trabajo en Compañía 1: /.test(e[0]));
  assert.ok(/^cambió un compañerismo/.test(e[1]));
  assert.ok(/^deshizo el compañerismo de trabajo de /.test(e[2]));
  assert.ok(!e.some((t) => t.includes('una persona')));
});


test('188. fechaAmigable — Hoy, Mañana, día y mes; año solo si cambia; cruza fin de mes y de año; fecha rara se devuelve igual', () => {
  assert.strictEqual(fechaAmigable('2026-10-11', '2026-10-11'), 'Hoy');
  assert.strictEqual(fechaAmigable('2026-10-12', '2026-10-11'), 'Mañana');
  assert.strictEqual(fechaAmigable('2026-11-01', '2026-10-31'), 'Mañana');
  assert.strictEqual(fechaAmigable('2027-01-01', '2026-12-31'), 'Mañana');
  assert.strictEqual(fechaAmigable('2026-10-18', '2026-10-11'), 'dom 18 oct'); // 18 oct 2026 es domingo
  assert.strictEqual(fechaAmigable('2026-10-10', '2026-10-11'), 'sáb 10 oct'); // ayer: sin "Hoy" ni "Mañana"
  assert.strictEqual(fechaAmigable('2027-02-05', '2026-10-11'), 'vie 5 feb 2027');
  assert.strictEqual(fechaAmigable('sin fecha', '2026-10-11'), 'sin fecha');
});

test('189. rangoHora — formato 12 h; comparte am/pm si coinciden; medianoche y mediodía', () => {
  assert.strictEqual(rangoHora('17:00', '19:00'), '5:00–7:00 pm');
  assert.strictEqual(rangoHora('11:00', '13:00'), '11:00 am–1:00 pm');
  assert.strictEqual(rangoHora('17:00'), '5:00 pm');
  assert.strictEqual(rangoHora('00:30'), '12:30 am');
  assert.strictEqual(rangoHora('12:00', '14:00'), '12:00–2:00 pm');
  assert.strictEqual(rangoHora(''), '');
});

test('190. medianaAsistencia — mediana de eventos con registros, par e impar, sin datos = 0, y aguanta un evento atípico que sí mueve el promedio', () => {
  const mk = (pct: number, registros = 10) => ({ cap: capFake('m' + pct, '2027-01-01'), presentes: 0, ausentes: 0, justificados: 0, sinMarca: 0, pct, registros });
  assert.strictEqual(medianaAsistencia([]), 0);
  assert.strictEqual(medianaAsistencia([mk(50, 0)]), 0); // sin registros no cuenta
  assert.strictEqual(medianaAsistencia([mk(60), mk(70), mk(20)]), 60);
  assert.strictEqual(medianaAsistencia([mk(60), mk(71)]), 66); // (60+71)/2 = 65,5 → entero
  const raros = [mk(90), mk(88), mk(89), mk(2)];
  assert.ok(promedioAsistencia(raros) < 70 && medianaAsistencia(raros) >= 88); // el promedio cae por un evento; la mediana no
});

void Promise.all(pendientes).then(() => console.log(`\n${passed} pruebas pasaron.`));

test('191. nombreCompania — alias manda; sin alias "Familia N" se muestra como "Compañía N"', () => {
  const base = { id: 'x', colorId: 'a', consejeros: [] };
  assert.strictEqual(nombreCompania({ ...base, nombre: 'Familia 3', customName: '' } as Familia), 'Compañía 3');
  assert.strictEqual(nombreCompania({ ...base, nombre: 'Familia 3', customName: 'Leones' } as Familia), 'Leones');
  assert.strictEqual(nombreCompania({ ...base, nombre: 'Equipo especial', customName: '' } as Familia), 'Equipo especial');
});

// ── Sugerir compañerismos (0058) ───────────────────────────────────────────
type G = 'H' | 'M';
const gente = (spec: [string, G, string][]): Participante[] =>
  spec.map(([id, genero, estaca]) => ({ ...personaFake(id), nombres: id.toUpperCase(), genero, estaca }) as Participante);
const idsDe = (grupos: Participante[][]) => grupos.map((g) => g.map((p) => p.id).join('+'));
// Costo calculado aparte (no importado): 100 por par del mismo sexo, 1 por par de la misma estaca.
const costoGrupo = (g: Participante[]) => {
  let c = 0;
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) c += (g[i].genero === g[j].genero ? 100 : 0) + (g[i].estaca === g[j].estaca ? 1 : 0);
  return c;
};
const costoTotal = (gs: Participante[][]) => gs.reduce((a, g) => a + costoGrupo(g), 0);
// Fuerza bruta: la mejor partición en duplas (y un solo trío si la cantidad es impar).
function mejorBruto(ps: Participante[]): number {
  const rec = (resto: Participante[], trioPendiente: boolean): number => {
    if (!resto.length) return trioPendiente ? Infinity : 0;
    const [a, ...otros] = resto;
    let m = Infinity;
    for (let i = 0; i < otros.length; i++) {
      m = Math.min(m, costoGrupo([a, otros[i]]) + rec(otros.filter((_, k) => k !== i), trioPendiente));
      if (trioPendiente) for (let j = i + 1; j < otros.length; j++) {
        m = Math.min(m, costoGrupo([a, otros[i], otros[j]]) + rec(otros.filter((_, k) => k !== i && k !== j), false));
      }
    }
    return m;
  };
  return rec(ps, ps.length % 2 === 1);
}

test('192. sugerirParejas — 3 hombres y 3 mujeres: todas las duplas son hombre + mujer', () => {
  const ps = gente([['a', 'H', 'V'], ['b', 'H', 'V'], ['c', 'H', 'V'], ['d', 'M', 'V'], ['e', 'M', 'V'], ['f', 'M', 'V']]);
  const r = sugerirParejas(ps);
  assert.strictEqual(r.grupos.length, 3);
  assert.ok(r.grupos.every((g) => g.length === 2 && new Set(g.map((p) => p.genero)).size === 2));
  assert.deepStrictEqual(r.sobrantes, []);
});

test('193. sugerirParejas — sobrantes del mismo sexo quedan entre sí; cantidad impar da un solo trío', () => {
  const par = sugerirParejas(gente([['a', 'H', 'V'], ['b', 'H', 'V'], ['c', 'H', 'V'], ['d', 'H', 'V'], ['e', 'M', 'V'], ['f', 'M', 'V']]));
  assert.strictEqual(costoTotal(par.grupos), 100 + 3); // 1 dupla de hombres (100) + 3 duplas que comparten estaca (1 c/u)
  assert.deepStrictEqual(par.grupos.map((g) => g.length).sort(), [2, 2, 2]);
  const impar = sugerirParejas(gente([['a', 'H', 'V'], ['b', 'H', 'V'], ['c', 'H', 'V'], ['d', 'M', 'V'], ['e', 'M', 'V']]));
  assert.deepStrictEqual(impar.grupos.map((g) => g.length).sort(), [2, 3]);
  assert.ok(impar.grupos.every((g) => new Set(g.map((p) => p.genero)).size === 2)); // ninguna sale solo de un sexo
  assert.strictEqual(new Set(impar.grupos.flat().map((p) => p.id)).size, 5); // nadie repetido ni olvidado
  const tres = sugerirParejas(gente([['a', 'H', 'V'], ['b', 'M', 'V'], ['c', 'H', 'V']]));
  assert.deepStrictEqual(tres.grupos.map((g) => g.length), [3]);
});

test('194. sugerirParejas — con 0 o 1 persona no arma nada y la que queda figura como sobrante', () => {
  assert.deepStrictEqual(sugerirParejas([]), { grupos: [], sobrantes: [], semilla: 0 });
  const una = gente([['a', 'H', 'V']]);
  const r = sugerirParejas(una);
  assert.deepStrictEqual(r.grupos, []);
  assert.deepStrictEqual(r.sobrantes.map((p) => p.id), ['a']);
});

test('195. sugerirParejas — prefiere estacas distintas aunque el orden alfabético juntaría a las iguales', () => {
  // Alfabético: A(Ventanilla) con C(Ventanilla) sería lo más fácil; lo bueno es A-D y B-C
  const ps = gente([['a', 'H', 'Ventanilla'], ['b', 'H', 'Pro Lima'], ['c', 'M', 'Ventanilla'], ['d', 'M', 'Pro Lima']]);
  const r = sugerirParejas(ps);
  assert.ok(r.grupos.every((g) => estacasDistintas(g)));
  assert.strictEqual(estacasDistintas([ps[0], ps[2]]), false);
  assert.strictEqual(estacasDistintas(gente([['x', 'H', ''], ['y', 'M', '']])), true); // sin estaca no cuenta como repetida
  assert.strictEqual(estacasDistintas(gente([['x', 'H', ' ventanilla '], ['y', 'M', 'Ventanilla']])), false); // ignora espacios y mayúsculas
});

test('196. sugerirParejas — es la mejor combinación posible (contra fuerza bruta, pares e impares) y es reproducible', () => {
  let semilla = 12345;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
  const estacas = ['Ventanilla', 'Puente Piedra', 'Pro Lima'];
  for (let caso = 0; caso < 60; caso++) {
    const n = 2 + (caso % 7); // 2..8
    const ps = gente(Array.from({ length: n }, (_, i) => [`p${i}`, azar() < 0.5 ? 'H' : 'M', estacas[Math.floor(azar() * 3)]] as [string, G, string]));
    const r = sugerirParejas(ps);
    assert.strictEqual(costoTotal(r.grupos), mejorBruto(ps), `caso ${caso}`);
    assert.strictEqual(r.grupos.flat().length, n);
    assert.strictEqual(r.grupos.filter((g) => g.length === 3).length, n % 2);
    assert.strictEqual(firmaPropuesta(sugerirParejas(ps)), firmaPropuesta(r)); // misma entrada, misma propuesta
    assert.strictEqual(firmaPropuesta(sugerirParejas([...ps].reverse())), firmaPropuesta(r)); // y no depende del orden de la lista
  }
});

test('197. otraPropuesta — da otra combinación igual de buena; null si no hay otra', () => {
  const ps = gente([['a', 'H', 'V1'], ['b', 'H', 'V2'], ['c', 'H', 'V3'], ['d', 'M', 'V1'], ['e', 'M', 'V2'], ['f', 'M', 'V3']]);
  const a = sugerirParejas(ps);
  const b = otraPropuesta(ps, a);
  assert.ok(b);
  assert.notStrictEqual(firmaPropuesta(b!), firmaPropuesta(a));
  assert.strictEqual(costoTotal(b!.grupos), costoTotal(a.grupos));
  assert.notStrictEqual(b!.semilla, a.semilla);
  assert.strictEqual(otraPropuesta(gente([['a', 'H', 'V'], ['b', 'M', 'V']]), sugerirParejas(gente([['a', 'H', 'V'], ['b', 'M', 'V']]))), null); // solo hay una forma de juntar a 2
});

test('198. sugerirParejas — con más de MAX_SUGERIR personas propone por tandas y el resto queda para la siguiente', () => {
  const ps = gente(Array.from({ length: 21 }, (_, i) => [`q${String(i).padStart(2, '0')}`, i % 2 ? 'M' : 'H', i % 3 ? 'Pro Lima' : 'Ventanilla'] as [string, G, string]));
  const t0 = Date.now();
  const r = sugerirParejas(ps);
  assert.ok(Date.now() - t0 < 3000);
  assert.strictEqual(r.grupos.flat().length, MAX_SUGERIR);
  assert.strictEqual(r.sobrantes.length, 21 - MAX_SUGERIR);
  const usados = new Set(r.grupos.flat().map((p) => p.id));
  const segunda = sugerirParejas(ps.filter((p) => !usados.has(p.id)));
  assert.deepStrictEqual(segunda.grupos.map((g) => g.length), [3]); // quedan 3: un trío
});

test('199. planearLote — valida pertenencia, tamaño, repetidos y quien ya tiene compañero', () => {
  const fam = { id: 'F1', consejeros: ['u1', 'u2', 'u3', 'u4', 'u5'] };
  let k = 0;
  const base = { familia: fam, existentes: [] as ParejaTrabajo[], nuevoId: () => `n${++k}` };
  assert.deepStrictEqual(planearLote({ ...base, grupos: [['u1', 'u2'], ['u3', 'u4', 'u5']] }), [
    { id: 'n1', familiaId: 'F1', miembros: ['u1', 'u2'] },
    { id: 'n2', familiaId: 'F1', miembros: ['u3', 'u4', 'u5'] },
  ]);
  assert.throws(() => planearLote({ ...base, grupos: [] }), /No hay compañerismos/);
  assert.throws(() => planearLote({ ...base, grupos: [['u1']] }), /2 o 3/);
  assert.throws(() => planearLote({ ...base, grupos: [['u1', 'x9']] }), /integrantes de esta compañía/);
  assert.throws(() => planearLote({ ...base, grupos: [['u1', 'u2'], ['u2', 'u3']] }), /repetida/);
  const existentes = [{ id: 'g1', familiaId: 'F1', miembros: ['u1', 'u2'] }, { id: 'gX', familiaId: 'F2', miembros: ['u3', 'u4'] }];
  assert.throws(() => planearLote({ ...base, existentes, grupos: [['u2', 'u3']] }), /ya tiene compañero/); // u2 ya está con u1
  assert.strictEqual(planearLote({ ...base, existentes, grupos: [['u3', 'u4']] }).length, 1); // un grupo de OTRA familia no cuenta
  // un grupo viejo con alguien que ya salió de la compañía no se ve en pantalla, así que no bloquea a quien quedó solo
  const huerfano = [{ id: 'g9', familiaId: 'F1', miembros: ['u1', 'ya-no-esta'] }];
  assert.strictEqual(planearLote({ ...base, existentes: huerfano, grupos: [['u1', 'u2']] }).length, 1);
});

test('200. guardarParejasLote / deshacerParejasLote (modo local) — un lote crea todo y el deshacer lo borra todo; no pisa a quien ya tiene compañero', async () => {
  await Promise.all(pendientes.slice()); // el modo local comparte una lista: se espera a las otras pruebas async de parejas (186)
  let ultimo: ParejaTrabajo[] = [];
  const baja = subscribeParejas((x) => (ultimo = x));
  const previas = ultimo.length;
  const nuevas = await guardarParejasLote(FAM_P, [['u1', 'u2'], ['u3', 'u4', 'u5']], ultimo, 'a@x.com');
  assert.strictEqual(nuevas.length, 2);
  assert.strictEqual(ultimo.length, previas + 2);
  await assert.rejects(() => guardarParejasLote(FAM_P, [['u1', 'u3']], ultimo, 'a@x.com'), /ya tiene compañero/);
  assert.strictEqual(ultimo.length, previas + 2); // el rechazo no escribió nada
  await deshacerParejasLote(nuevas, 'a@x.com');
  assert.strictEqual(ultimo.length, previas);
  await deshacerParejasLote([], 'a@x.com'); // vacío: no hace nada
  baja();
});

test('201. historial — describe la propuesta aplicada y su deshacer, dentro del grupo "Familias"', () => {
  const ctx = { participantes: GENTE_P, capacitaciones: [], familias: [FAM_P] };
  const mk = (accion: string, grupos: string[][]): AuditLog => ({ id: accion, timestamp: '2026-10-11T10:00:00', admin: 'a@x.com', accion, participanteId: '', detalles: JSON.stringify({ familiaId: 'F1', grupos }) } as AuditLog);
  assert.strictEqual(grupoDeAccion('SUGERIR_COMPANERISMOS_FAMILIA'), 'familias');
  assert.strictEqual(grupoDeAccion('DESHACER_SUGERENCIA_COMPANERISMOS'), 'familias');
  const e = describirEntradas([mk('SUGERIR_COMPANERISMOS_FAMILIA', [['u1', 'u2'], ['u3', 'u4']]), mk('SUGERIR_COMPANERISMOS_FAMILIA', [['u1', 'u2']]), mk('DESHACER_SUGERENCIA_COMPANERISMOS', [])], ctx).map((x) => x.texto);
  assert.ok(/^armó 2 compañerismos de trabajo sugeridos en Compañía 1: /.test(e[0]));
  assert.ok(/^armó 1 compañerismo de trabajo sugerido en /.test(e[1]));
  assert.ok(/^deshizo los compañerismos sugeridos en Compañía 1/.test(e[2]));
  assert.ok(!e.some((t) => t.includes('una persona')));
});

// ── Asistencia (0059): Sin compañía vs Otros roles, y filtro por estado ─────
const GENTE_R = [
  { ...personaFake('c1'), familiaId: 'fa', asignacion: 'Consejero' },
  { ...personaFake('c2'), familiaId: '', asignacion: 'Consejero' },
  { ...personaFake('l1'), familiaId: '', asignacion: 'Logístico' },
  { ...personaFake('l2'), familiaId: 'eliminada', asignacion: 'Logístico' },
  { ...personaFake('o1'), familiaId: '', asignacion: 'Coordinador General' },
  { ...personaFake('o2'), familiaId: '', asignacion: 'Audiovisuales' },
  { ...personaFake('o3'), familiaId: '', asignacion: '' },
  { ...personaFake('o4'), familiaId: 'fa', asignacion: 'Coordinador Auxiliar' }, // con compañía: no cuenta en ninguno de los dos
] as Participante[];

test('202. esDeReparto — solo Consejero y Logístico (no Coordinador Logístico ni Matrimonio Logístico)', () => {
  assert.strictEqual(esDeReparto({ asignacion: 'Consejero' }), true);
  assert.strictEqual(esDeReparto({ asignacion: 'Logístico' }), true);
  for (const a of ['Coordinador Logístico', 'Matrimonio Logístico', 'Audiovisuales', 'Coordinador General', ''] as const) assert.strictEqual(esDeReparto({ asignacion: a }), false, a);
});

test('203. filtrarPorCompania — "sin" = Consejero/Logístico sin compañía (o con una eliminada); "otros" = el resto del equipo sin compañía', () => {
  const m = infoCompanias(FAMS_C);
  assert.deepStrictEqual(filtrarPorCompania(GENTE_R, 'sin', m).map((p) => p.id), ['c2', 'l1', 'l2']);
  assert.deepStrictEqual(filtrarPorCompania(GENTE_R, 'otros', m).map((p) => p.id), ['o1', 'o2', 'o3']);
  assert.deepStrictEqual(filtrarPorCompania(GENTE_R, 'fa', m).map((p) => p.id), ['c1', 'o4']); // quien tiene compañía, con cualquier rol
  assert.deepStrictEqual(contarSinCompania(GENTE_R, m), { sin: 3, otros: 3 });
  assert.deepStrictEqual(contarSinCompania([], m), { sin: 0, otros: 0 });
  // "sin" y "otros" no se pisan y, con las compañías, cubren a todos
  const total = ['sin', 'otros', 'fa', 'fb', 'fc'].reduce((n, f) => n + filtrarPorCompania(GENTE_R, f, m).length, 0);
  assert.strictEqual(total, GENTE_R.length);
});

test('204. filtrarPorEstado / contarEstados — "por marcar" incluye sin marca y "ausente"; "justificado" no es ni por marcar ni presente', () => {
  const g = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const asis = { a: { estado: 'presente' }, b: { estado: 'ausente' }, c: { estado: 'justificado' }, e: { estado: 'presente' } }; // d sin marca
  assert.deepStrictEqual(filtrarPorEstado(g, asis, '').map((p) => p.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepStrictEqual(filtrarPorEstado(g, asis, 'presentes').map((p) => p.id), ['a', 'e']);
  assert.deepStrictEqual(filtrarPorEstado(g, asis, 'por_marcar').map((p) => p.id), ['b', 'd']);
  assert.deepStrictEqual(contarEstados(g, asis), { presentes: 2, porMarcar: 2 });
  assert.deepStrictEqual(contarEstados([], asis), { presentes: 0, porMarcar: 0 });
  // el conteo del chip siempre coincide con la lista que muestra y con el resumen de avance
  assert.strictEqual(contarEstados(g, asis).presentes, resumenGrupo(g as unknown as Participante[], asis).presentes);
  assert.strictEqual(contarEstados(g, asis).porMarcar, filtrarPorEstado(g, asis, 'por_marcar').length);
});

test('205. matchesQuery — todas las palabras deben estar; tolera tildes y espacios omitidos', () => {
  assert.strictEqual(matchesQuery('Juan Pérez Pro Lima', 'perez lima'), true);
  assert.strictEqual(matchesQuery('Juan Pérez Pro Lima', 'juan prolima'), true);
  assert.strictEqual(matchesQuery('Juan Pérez Pro Lima', 'juan ventanilla'), false);
  assert.strictEqual(matchesQuery('Juan Pérez', '   '), true);
});

test('206. estacasSugeridas — sugiere estacas por inicio de palabra, ignora palabras de menos de 3 letras', () => {
  const E = ['Pro Lima', 'El Olivar', 'Los Olivos', 'Ventanilla'];
  assert.deepStrictEqual(estacasSugeridas('pro', E), ['Pro Lima']);
  assert.deepStrictEqual(estacasSugeridas('prolima', E), ['Pro Lima']);
  assert.deepStrictEqual(estacasSugeridas('juan oli', E).sort(), ['El Olivar', 'Los Olivos']);
  assert.deepStrictEqual(estacasSugeridas('el', E), []);
  assert.deepStrictEqual(estacasSugeridas('', E), []);
});

test('207. quitarPalabrasDeEstaca — quita del texto las palabras que ya eligieron la estaca', () => {
  assert.strictEqual(quitarPalabrasDeEstaca('juan pro', 'Pro Lima'), 'juan');
  assert.strictEqual(quitarPalabrasDeEstaca('pro', 'Pro Lima'), '');
  assert.strictEqual(quitarPalabrasDeEstaca('juan', 'Pro Lima'), 'juan');
});

test('209. variacionesPorEvento — compara con el evento anterior que tiene marcas; sin marcas o sin anterior = null', () => {
  const ev = (pct: number, registros: number) => ({ cap: capFake('x', '2027-01-01'), presentes: 0, ausentes: 0, justificados: 0, sinMarca: 0, registros, pct });
  assert.deepStrictEqual(variacionesPorEvento([ev(56, 9), ev(59, 9), ev(0, 0), ev(51, 9)]), [null, 3, null, -8]);
  assert.deepStrictEqual(variacionesPorEvento([]), []);
});

test('210. ordenarNoches — la más reciente primero, sin depender del orden en que llegan', () => {
  const n = (id: string, fecha: string) => ({ id, familiaId: 'f', fecha, titulo: 't', creadoPor: '', asistencia: {} });
  assert.deepStrictEqual(ordenarNoches([n('b', '2026-10-08'), n('c', '2026-10-15'), n('a', '2026-10-01')]).map((x) => x.fecha), ['2026-10-15', '2026-10-08', '2026-10-01']);
  assert.deepStrictEqual(ordenarNoches([]), []);
});

test('211. ordenarParaVista — primero lo que viene (la más cercana arriba), después lo pasado (la más reciente arriba)', () => {
  const n = (id: string, fecha: string) => ({ id, familiaId: 'f', fecha, titulo: 't', creadoPor: '', asistencia: {} });
  const orden = ordenarParaVista([n('a', '2026-10-01'), n('d', '2026-12-01'), n('b', '2026-10-08'), n('c', '2026-10-15'), n('e', '2026-10-13')], '2026-10-13').map((x) => x.id);
  assert.deepStrictEqual(orden, ['e', 'c', 'd', 'b', 'a']); // hoy (13) cuenta como "viene"
  assert.deepStrictEqual(ordenarParaVista([], '2026-10-13'), []);
});

test('212. resumenNoche — cuenta solo a los integrantes actuales; "ausente" y sin marca son "por marcar"', () => {
  const miembros = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const r = resumenNoche({ a: 'presente', b: 'justificado', c: 'ausente', fuera: 'presente' }, miembros); // "fuera" ya no está en la compañía
  assert.deepStrictEqual(r, { presentes: 1, justificados: 1, porMarcar: 2, total: 4, pct: 25 });
  assert.deepStrictEqual(resumenNoche({}, []), { presentes: 0, justificados: 0, porMarcar: 0, total: 0, pct: 0 });
});

test('213. sumarDias — cruza fin de mes y de año sin desfase de zona horaria', () => {
  assert.strictEqual(sumarDias('2026-10-13', 1), '2026-10-14');
  assert.strictEqual(sumarDias('2026-10-31', 1), '2026-11-01');
  assert.strictEqual(sumarDias('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(sumarDias('2027-01-18', -1), '2027-01-17');
});

test('214. marcarVariosNocheHogar / editar / eliminar / restaurar (modo local) — un guardado cambia a varios; eliminar y restaurar devuelven la noche con su asistencia', async () => {
  const sub = (cb: (n: NocheHogar[]) => void) => subscribeNochesHogar('fam-214', cb);
  let actual: NocheHogar[] = [];
  const off = sub((n) => (actual = n));
  const creada = await crearNocheHogar('fam-214', '2026-10-15', 'Noche de Hogar', 'x@y.z');
  await marcarVariosNocheHogar(creada, { a: 'presente', b: 'presente' }, 'x@y.z');
  assert.deepStrictEqual(actual[0].asistencia, { a: 'presente', b: 'presente' });
  await marcarVariosNocheHogar(actual[0], { a: 'ausente' }, 'x@y.z'); // el deshacer
  assert.deepStrictEqual(actual[0].asistencia, { a: 'ausente', b: 'presente' });
  await editarNocheHogar(actual[0], '2026-10-16', '  ', 'x@y.z');
  assert.strictEqual(actual[0].fecha, '2026-10-16');
  assert.strictEqual(actual[0].titulo, 'Noche de Hogar'); // título vacío vuelve al de siempre
  const antes = actual[0];
  await eliminarNocheHogar(antes, 'x@y.z');
  assert.strictEqual(actual.length, 0);
  await restaurarNocheHogar(antes, 'x@y.z');
  assert.deepStrictEqual(actual[0].asistencia, { a: 'ausente', b: 'presente' });
  off();
});

test('215. restablecerContrasena — solo el Coordinador General, nunca la propia; la persona vuelve a crear contraseña y la vieja deja de servir', async () => {
  const g = globalThis as Record<string, unknown>;
  const tenia = { window: g.window, sessionStorage: g.sessionStorage };
  g.window = globalThis; // hashPassword usa window.crypto
  g.sessionStorage = { setItem() {}, getItem: () => null, removeItem() {} };
  try {
    await createStaffAccount('cg215@x.pe', 'Coordinador General', '', 'sistema');
    await createStaffAccount('log215@x.pe', 'Logística', '', 'sistema');
    await createStaffAccount('ana215@x.pe', 'Coordinador General', '', 'sistema');
    for (const c of ['cg215@x.pe', 'log215@x.pe', 'ana215@x.pe']) assert.ok((await setupPasswordFirstTime(c, 'clave-vieja-1')).ok);

    await assert.rejects(restablecerContrasena('cg215@x.pe', 'cg215@x.pe'), /propia/); // ni la suya
    await assert.rejects(restablecerContrasena('ana215@x.pe', 'log215@x.pe'), /Solo el Coordinador General/); // Logística no puede
    assert.ok((await loginStaff('ana215@x.pe', 'clave-vieja-1')).ok); // lo rechazado no tocó nada

    await restablecerContrasena('ana215@x.pe', 'cg215@x.pe'); // otro Coordinador General sí es restablecible
    const sinClave = await loginStaff('ana215@x.pe', 'clave-vieja-1');
    assert.ok(!sinClave.ok && sinClave.code === 'NEEDS_SETUP'); // cae en la pantalla de crear contraseña
    assert.ok((await setupPasswordFirstTime('ana215@x.pe', 'clave-nueva-2')).ok);
    const vieja = await loginStaff('ana215@x.pe', 'clave-vieja-1');
    assert.ok(!vieja.ok && vieja.code === 'INVALID');
    assert.ok((await loginStaff('ana215@x.pe', 'clave-nueva-2')).ok);
    await assert.rejects(restablecerContrasena('no-existe@x.pe', 'cg215@x.pe'), /No se encontró/);
  } finally {
    g.window = tenia.window;
    g.sessionStorage = tenia.sessionStorage;
    if (tenia.window === undefined) delete g.window;
    if (tenia.sessionStorage === undefined) delete g.sessionStorage;
  }
});

test('216. historial — describe el restablecimiento de contraseña dentro del grupo "usuarios"', () => {
  assert.strictEqual(grupoDeAccion('RESTABLECER_CONTRASENA_USUARIO'), 'usuarios');
});

test('217. Asistencia abre en el evento de hoy: baile del sábado en curso gana a la dominical', () => {
  const baile = { id: 'b', fecha: '2027-01-09', hora: '09:00', horaFin: '13:00' } as any;
  const domi = { id: 'd', fecha: '2027-01-10', hora: '10:00' } as any;
  const d = (h: string) => new Date(`2027-01-09T${h}`);
  assert.strictEqual(getCapacitacionParaAsistencia([domi, baile], d('11:00'))?.id, 'b'); // en curso (getNext habría dado 'd')
  assert.strictEqual(getCapacitacionParaAsistencia([domi, baile], d('08:00'))?.id, 'b'); // aún no empieza, pero es hoy
  assert.strictEqual(getCapacitacionParaAsistencia([domi, baile], d('20:00'))?.id, 'b'); // ya terminó, sigue siendo lo de hoy
  assert.strictEqual(getCapacitacionParaAsistencia([domi, baile], new Date('2027-01-08T12:00'))?.id, 'b'); // víspera: la más cercana
  assert.strictEqual(getCapacitacionParaAsistencia([domi, baile], new Date('2027-01-10T09:00'))?.id, 'd');
  assert.strictEqual(getCapacitacionParaAsistencia([domi, baile], new Date('2027-02-01T09:00'))?.id, 'd'); // todo pasado: el más reciente
  assert.strictEqual(getCapacitacionParaAsistencia([], new Date()), null);
  const manana = { id: 'm', fecha: '2027-01-09', hora: '08:00', horaFin: '09:30' } as any;
  const tarde = { id: 't', fecha: '2027-01-09', hora: '15:00', horaFin: '17:00' } as any;
  assert.strictEqual(getCapacitacionParaAsistencia([manana, tarde], d('12:00'))?.id, 't'); // terminó la de la mañana → viene la de la tarde
});

test('218. participaRegular — sin la marca cuenta (llegar nuevo = marcado); solo false deja fuera', () => {
  assert.strictEqual(participaRegular({} as any), true);
  assert.strictEqual(participaRegular({ participaRegular: true } as any), true);
  assert.strictEqual(participaRegular({ participaRegular: false } as any), false);
});

test('219. calcularEstadoFamilia — los sin marca no cuentan para sexo, estaca ni total', () => {
  const mk = (id: string, genero: 'H' | 'M', estaca: string, participaRegular?: boolean) => ({ id, genero, estaca, participaRegular }) as any;
  const e = calcularEstadoFamilia('f', [mk('1', 'H', 'Estaca Ventanilla'), mk('2', 'M', 'Estaca Ventanilla', false), mk('3', 'M', 'Estaca Ventanilla', true), mk('4', 'H', 'Estaca Ventanilla', false)]);
  assert.strictEqual(e.total, 2);
  assert.strictEqual(e.hombres, 1);
  assert.strictEqual(e.mujeres, 1);
});

test('220. reparto — con 17 inscritos por compañía pero distinta participación, la que tiene menos participantes recibe más (H/M parejo)', () => {
  const mkFam = (n: number, activos: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `${n}-${activos}-${i}`, genero: i % 2 ? 'M' : 'H', estaca: 'Estaca Ventanilla', participaRegular: i < activos ? undefined : false }) as any);
  const fams = [mkFam(17, 6), mkFam(17, 13), mkFam(17, 10), mkFam(17, 9)];
  const estados = fams.map((m, i) => calcularEstadoFamilia(`C${i + 1}`, m));
  const nuevos = ['M', 'M', 'H', 'H', 'M', 'H', 'M', 'H'].map((g, i) => ({ participante: { id: 'n' + i, genero: g, estaca: 'Estaca Ventanilla' } as any, edad: 16 }));
  const { estadosFinales } = repartirConBalance(nuevos, estados);
  const total = (id: string) => estadosFinales.find((e) => e.id === id)!.total;
  assert.ok(total('C1') > estados[0].total + 2, 'la de 6 participantes recibe la mayoría');
  assert.strictEqual(total('C2'), estados[1].total, 'la de 13 no recibe a nadie');
  for (const e of estadosFinales) assert.ok(Math.abs(e.hombres - e.mujeres) <= 1, `H/M parejo en ${e.id}`);
});

test('221. historial — la marca de participación tiene su propia frase', () => {
  const mov = (v: boolean) => logH('ACTUALIZAR_PARTICIPANTE', { participaRegular: v, _antes: { participaRegular: !v } }, 'juan');
  assert.match(describirEntrada(mov(false), CTX_H).texto, /quitó la marca.*Juan/);
  assert.match(describirEntrada(mov(true), CTX_H).texto, /marcó que.*Juan.*participa con regularidad/);
});

test('222. quien entra a una compañía llega marcado, aunque antes le hubieran quitado la marca', async () => {
  const r = await registrarParticipante({
    nombres: 'Rosa', apellidos: 'Marca Prueba', fechaNacimiento: '2005-05-05', telefono: '987654321', correo: 'rosa222@x.pe', estaca: 'Estaca Ventanilla', barrio: 'B',
    genero: 'M', experienciaPrevia: 'ninguna', asignacionAnterior: '', disponibilidad: 'si', audiovisualHabilidades: [], audiovisualEquipo: 'no', consentimientoDatosFecha: new Date().toISOString(),
  });
  assert.ok(r.ok);
  const id = (r as { id: string }).id;
  await updateParticipante(id, { asignacion: 'Consejero', participaRegular: false }, 'sistema');
  const leer = () => { let p: Participante | undefined; subscribeParticipantes((l) => (p = l.find((x) => x.id === id)))(); return p!; };
  assert.strictEqual(participaRegular(leer()), false);
  await addFamilia('Prueba 222', '', [], 'sistema');
  let fam: Familia | undefined;
  const { subscribeFamilias } = await import('../src/services/familiasService');
  subscribeFamilias((l) => (fam = l.find((f) => f.customName === 'Prueba 222')))();
  await addConsejeroToFamilia(fam!, leer(), 'sistema');
  assert.strictEqual(participaRegular(leer()), true);
});

test('223. resumen de compañías — solo números (sin nombres), con inscritos, participan, edades y asistencia', () => {
  const mk = (id: string, genero: 'H' | 'M', nac: string, extra: Partial<Participante> = {}) =>
    ({ ...personaFake(id), nombres: `Nom${id}`, apellidos: `Ape${id}`, genero, fechaNacimiento: nac, estaca: 'Ventanilla', asignacion: 'Consejero', ...extra }) as Participante;
  const gente = [
    mk('a', 'H', '2010-01-01'), mk('b', 'M', '2009-01-01'), mk('c', 'M', '2008-01-01', { participaRegular: false }),
    mk('d', 'H', '2010-06-01', { asignacion: 'Logístico' }), // sin compañía
  ];
  const fam = { id: 'f1', nombre: 'Familia 1', customName: '', colorId: 'x', consejeros: ['a', 'b', 'c'] } as Familia;
  const cap = capFake('e1', '2027-02-02');
  const asis = [
    { capacitacionId: 'e1', participanteId: 'a', estado: 'presente', timestamp: '' },
    { capacitacionId: 'e1', participanteId: 'b', estado: 'justificado', timestamp: '' },
    { capacitacionId: 'e1', participanteId: 'd', estado: 'presente', timestamp: '' },
  ] as Asistencia[];
  const t = resumenCompaniasTexto({ familias: [fam], participantes: gente, capacitaciones: [cap], asistencia: asis, ahora: new Date('2027-02-10T12:00:00') });
  assert.ok(t.includes('Compañía 1'));
  assert.ok(t.includes('Inscritos: 3 (1H/2M) · Participan: 2 (1H/1M) · 67% de los inscritos'));
  assert.ok(t.includes('Ventanilla 2'));
  assert.ok(t.includes('1/3 +1J'));
  assert.ok(t.includes('Logísticos: 1 (1H/0M)'));
  assert.ok(!/Nom|Ape/.test(t), 'no debe filtrar nombres');
});

test('224. umbral de participación — 60%: 10 de 17 (59%) se marca, 11 de 17 (65%) no', () => {
  assert.ok(10 / 17 < UMBRAL_PARTICIPACION);
  assert.ok(!(11 / 17 < UMBRAL_PARTICIPACION));
});

test('225. sinVenirRecientes — avisa a los marcados que no vinieron a ninguna de las últimas 3 capacitaciones', () => {
  const caps = [capFake('e1', '2027-02-01'), capFake('e2', '2027-02-08'), capFake('e3', '2027-02-15'), capFake('e4', '2027-02-22')];
  const mk = (id: string, extra: Partial<Participante> = {}) => ({ ...personaFake(id), timestamp: '2027-01-01T00:00:00.000Z', ...extra }) as Participante;
  const gente = [
    mk('viene'),                                            // vino a e3 y e4
    mk('nunca'),                                            // no vino a nada
    mk('justifico'),                                        // justificó e2: cuenta como que vino
    mk('apagado', { participaRegular: false }),             // ya no está marcado: no se avisa
    mk('nuevo', { timestamp: '2027-02-20T00:00:00.000Z' }), // se registró después de e2: no pudo venir
    mk('solo-viejo'),                                       // solo vino a e1 (fuera de las últimas 3)
  ];
  const a = (cap: string, p: string, estado: 'presente' | 'justificado' | 'ausente') => ({ capacitacionId: cap, participanteId: p, estado, timestamp: '' }) as Asistencia;
  const asis = [a('e1', 'solo-viejo', 'presente'), a('e2', 'justifico', 'justificado'), a('e2', 'viene', 'presente'), a('e3', 'viene', 'presente'), a('e4', 'viene', 'presente')];
  const ids = (x: Set<string>) => [...x].sort();
  // con e4 ya pasado, las últimas 3 son e2, e3, e4
  assert.deepStrictEqual(ids(sinVenirRecientes(gente, caps, asis, '2027-03-01')), ['nunca', 'solo-viejo']);
  // el evento de hoy no cuenta: con hoy = e4 las últimas 3 son e1, e2, e3 (solo-viejo vino a e1; 'nuevo' se registró después de e1)
  assert.deepStrictEqual(ids(sinVenirRecientes(gente, caps, asis, '2027-02-22')), ['nunca']);
  // un evento donde nadie pasó lista todavía no se usa
  assert.deepStrictEqual(ids(sinVenirRecientes(gente, [...caps, capFake('e5', '2027-02-27')], asis, '2027-03-01')), ['nunca', 'solo-viejo']);
  // un baile no cuenta aunque haya venido
  const conBaile = [...caps, { ...capFake('b1', '2027-02-26'), tipo: 'baile' as const }];
  assert.deepStrictEqual(ids(sinVenirRecientes(gente, conBaile, [...asis, a('b1', 'nunca', 'presente')], '2027-03-01')), ['nunca', 'solo-viejo']);
  // con menos de 3 capacitaciones no hay aviso
  assert.strictEqual(sinVenirRecientes(gente, caps.slice(0, 2), asis, '2027-03-01').size, 0);
});
