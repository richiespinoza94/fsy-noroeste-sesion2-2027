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
import { getNextCapacitacion } from '../src/services/capacitacionesService';
import { ESTACAS_DATA, TODAS_LAS_ESTACAS } from '../src/data/estacas';
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

test('validatePhone acepta celular peruano de 9 dígitos empezando en 9', () => {
  assert.strictEqual(validatePhone('987654321'), true);
  assert.strictEqual(validatePhone('123456789'), false);
  assert.strictEqual(validatePhone('98765432'), false);
});

test('validateEmail rechaza formatos inválidos', () => {
  assert.strictEqual(validateEmail('a@b.com'), true);
  assert.strictEqual(validateEmail('sin-arroba.com'), false);
});

test('normalizePhone deja solo dígitos y trunca a 9', () => {
  assert.strictEqual(normalizePhone('987-654-321 '), '987654321');
  assert.strictEqual(normalizePhone('9876543219999'), '987654321');
});

test('normalizeEmail baja a minúsculas y recorta espacios', () => {
  assert.strictEqual(normalizeEmail('  Ana@Correo.COM '), 'ana@correo.com');
});

test('normalizeName capitaliza cada palabra sin tocar tildes ni guiones', () => {
  assert.strictEqual(normalizeName('maría josé pérez-lópez'), 'María José Pérez-López');
});

test('nameKey compara nombres sin tildes ni mayúsculas (detección de duplicados)', () => {
  assert.strictEqual(nameKey('Saúl', 'García'), nameKey('saul', 'GARCIA'));
});

test('ESTACAS_DATA — estacas con barrios confirmados vs. input libre', () => {
  assert.deepStrictEqual(ESTACAS_DATA.Ventanilla, ['Ventanilla', 'Los Álamos', 'Naval', 'Angamos', 'Pedro Beltrán', 'Mi Perú']);
  assert.strictEqual(ESTACAS_DATA['El Olivar'], null);
  assert.strictEqual(TODAS_LAS_ESTACAS.length, 11);
});

test('getNextCapacitacion prioriza la futura más próxima', () => {
  const caps: Capacitacion[] = [
    { id: '1', label: 'Pasada', fecha: '2020-01-01', hora: '09:00', lugar: 'X', oficial: true },
    { id: '2', label: 'Futura lejana', fecha: '2099-01-01', hora: '09:00', lugar: 'X', oficial: true },
    { id: '3', label: 'Futura próxima', fecha: '2030-01-01', hora: '09:00', lugar: 'X', oficial: true },
  ];
  assert.strictEqual(getNextCapacitacion(caps)?.id, '3');
});

test('getNextCapacitacion cae a la pasada más reciente si no hay futuras', () => {
  const caps: Capacitacion[] = [
    { id: '1', label: 'Muy pasada', fecha: '2019-01-01', hora: '09:00', lugar: 'X', oficial: true },
    { id: '2', label: 'Pasada reciente', fecha: '2024-06-01', hora: '09:00', lugar: 'X', oficial: true },
  ];
  assert.strictEqual(getNextCapacitacion(caps)?.id, '2');
});

test('getNextCapacitacion con lista vacía devuelve null', () => {
  assert.strictEqual(getNextCapacitacion([]), null);
});

console.log(`\n${passed} pruebas pasaron.`);
