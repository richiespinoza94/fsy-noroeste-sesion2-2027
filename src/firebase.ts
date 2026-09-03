import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

// `?? {}` porque tsx (usado por tests/qa.test.ts) no pasa por Vite y no
// define import.meta.env — sin esto, correr los tests rompe al importar
// cualquier servicio que dependa de firebase.ts.
const env = import.meta.env ?? {};
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

// FSY 2027 comparte el PROYECTO de Firebase con CONFEJAS 2026 (mismo
// projectId/apiKey/etc. de arriba) pero usa una BASE DE DATOS Firestore
// con nombre propio, aislada de la que usa CONFEJAS. Esto evita el límite
// de 4 proyectos por cuenta de Google Cloud sin mezclar datos entre apps.
// Si esta variable queda vacía, se usa la base "(default)" del proyecto —
// por eso es obligatoria aquí para no escribir accidentalmente sobre los
// datos de CONFEJAS.
const databaseId: string | undefined = env.VITE_FIREBASE_DB_ID || undefined;

// Igual que en el app principal de CONFEJAS: sin las 6 variables de entorno,
// la app entra en "Modo local" — banner visible, sin sincronización real,
// pensado para poder probar la interfaz sin credenciales todavía.
export const isFirebaseConfigured = Object.values(cfg).every(Boolean) && !!databaseId;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(cfg);
  db = getFirestore(app, databaseId!);
}

export { db };
