import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { SessionUser, Usuario } from '../types';
import { hashPassword } from '../utils/password';
import { normalizeEmail } from '../utils/validation';
import { logAction } from './auditService';
import { findParticipanteByCorreo } from './participantsService';

const COL = 'usuarios';
const SESSION_KEY = 'fsy_session';

// ponytail: mismo array en memoria que participantsService para modo local sin Firebase.
let localUsers: Usuario[] = [];

function isFullAccessRole(rol: string): boolean {
  const r = (rol || '').toLowerCase().trim();
  return r === 'data master' || r === 'coordinador general' || r === 'logística' || r === 'logistica';
}
function isAuxRole(rol: string): boolean {
  return (rol || '').toLowerCase().trim() === 'coordinador auxiliar';
}

// El correo ES el ID del documento (así se crea a mano en Firebase Console),
// así que se busca por getDoc directo en vez de una query con `where` —
// más simple, más rápido y sin depender de que Firestore indexe el campo.
async function getUsuario(email: string): Promise<Usuario | null> {
  if (!db) return localUsers.find((u) => normalizeEmail(u.correo) === email) ?? null;
  const snap = await getDoc(doc(db, COL, email));
  return snap.exists() ? (snap.data() as Usuario) : null;
}

// IMPORTANTE: recibe `email` explícito en vez de leerlo de `u.correo`.
// Si el campo "correo" del documento tiene un typo/espacio (ej. creado a
// mano en Firebase Console), u.correo podría venir vacío o distinto del ID
// real del documento — usar el ID que YA sabemos correcto (el mismo con el
// que se hizo el login) evita ese problema de raíz en vez de depender de
// que el dato guardado sea perfecto.
async function saveUsuario(email: string, u: Usuario) {
  if (!db) {
    localUsers = [...localUsers.filter((x) => normalizeEmail(x.correo) !== email), u];
    return;
  }
  await setDoc(doc(db, COL, email), u);
}

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; code: 'NEEDS_SETUP' | 'INVALID' | 'INACTIVE'; message: string };

export async function loginStaff(correoRaw: string, password: string): Promise<LoginResult> {
  const correo = normalizeEmail(correoRaw);
  const usuario = await getUsuario(correo);

  if (!usuario) {
    await logAction('sistema', 'LOGIN_ATTEMPT', '', { motivo: 'correo_no_encontrado', correo });
    return { ok: false, code: 'INVALID', message: 'Correo o contraseña inválidos.' };
  }
  if (!usuario.activo) {
    return { ok: false, code: 'INACTIVE', message: 'Tu acceso está desactivado. Contacta al coordinador general.' };
  }
  if (!usuario.passwordHash) {
    return { ok: false, code: 'NEEDS_SETUP', message: 'Este es tu primer acceso. Crea una contraseña.' };
  }
  const hash = await hashPassword(password);
  if (hash !== usuario.passwordHash) {
    await logAction('sistema', 'LOGIN_FALLIDO', '', { motivo: 'password_incorrecto', correo });
    return { ok: false, code: 'INVALID', message: 'Correo o contraseña inválidos.' };
  }

  const session = await buildSession(correo, usuario);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  await logAction(correo, 'LOGIN_EXITOSO', '', { rol: usuario.rol });
  return { ok: true, user: session };
}

export async function setupPasswordFirstTime(correoRaw: string, password: string): Promise<LoginResult> {
  const correo = normalizeEmail(correoRaw);
  const usuario = await getUsuario(correo);
  if (!usuario) return { ok: false, code: 'INVALID', message: 'Usuario no encontrado.' };
  if (usuario.passwordHash) return { ok: false, code: 'INVALID', message: 'Este usuario ya tiene contraseña asignada.' };

  const updated: Usuario = { ...usuario, correo, passwordHash: await hashPassword(password) };
  await saveUsuario(correo, updated);
  const session = await buildSession(correo, updated);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  await logAction(correo, 'SETUP_PASSWORD_FIRST_TIME', '', { rol: usuario.rol });
  return { ok: true, user: session };
}

async function buildSession(email: string, usuario: Usuario): Promise<SessionUser> {
  const isFull = isFullAccessRole(usuario.rol);
  const isAux = isAuxRole(usuario.rol);
  let participantId: string | undefined;
  let familiaId: string | undefined;
  if (isAux) {
    const p = await findParticipanteByCorreo(email);
    participantId = p?.id;
    familiaId = p?.familiaId || undefined;
  }
  return {
    correo: email,
    rol: usuario.rol,
    estaca: usuario.estaca || '',
    participantId,
    familiaId,
    canEditAll: isFull,
    canViewReports: isFull,
    isAuxiliar: isAux,
  };
}

export function getStoredSession(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}

/** Crea (o reactiva) una cuenta de staff sin contraseña — la persona la crea en su primer login. */
export async function createStaffAccount(correo: string, rol: string, estaca: string, adminCorreo: string) {
  const email = normalizeEmail(correo);
  const usuario: Usuario = {
    correo: email,
    passwordHash: '',
    rol,
    estaca: estaca || '',
    activo: true,
    fechaCreacion: new Date().toISOString(),
  };
  await saveUsuario(email, usuario);
  await logAction(adminCorreo, 'CREAR_USUARIO', '', { correo: email, rol });
}

export async function seedDevUser() {
  // ponytail: helper solo para probar en modo local / primer despliegue.
  const email = 'coordinador@fsy2027.pe';
  if (await getUsuario(email)) return;
  await saveUsuario(email, {
    correo: email,
    passwordHash: '',
    rol: 'Coordinador General',
    estaca: '',
    activo: true,
    fechaCreacion: new Date().toISOString(),
  });
}
