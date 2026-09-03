export function normalizeSpaces(v: string): string {
  return (v || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(v: string): string {
  return (v || '').replace(/\D/g, '').slice(0, 9);
}

export function normalizeEmail(v: string): string {
  return normalizeSpaces(v).toLowerCase();
}

function titleCaseWord(w: string): string {
  return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '';
}

/** Capitaliza nombres/apellidos conservando guiones y apóstrofes, sin tocar tildes. */
export function normalizeName(v: string): string {
  const clean = normalizeSpaces(v);
  if (!clean) return '';
  return clean
    .split(' ')
    .map((part) =>
      part
        .split(/([-'])/)
        .map((piece) => (piece === '-' || piece === "'" ? piece : titleCaseWord(piece)))
        .join('')
    )
    .join(' ');
}

export function validatePhone(v: string): boolean {
  return /^9\d{8}$/.test(normalizePhone(v));
}

export function validateEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));
}

export function stripAccents(v: string): string {
  return (v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Clave canónica para comparar nombres sin tildes/mayúsculas — usado para detectar duplicados. */
export function nameKey(nombres: string, apellidos: string): string {
  return stripAccents(normalizeSpaces(`${nombres} ${apellidos}`));
}
