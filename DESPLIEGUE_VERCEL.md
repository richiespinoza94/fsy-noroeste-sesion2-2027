# Despliegue — Gestión FSY 2027

## 1. Instalar lo necesario (una sola vez)

Si ya lo hiciste para el app de CONFEJAS, ya tienes todo esto instalado y puedes saltar al paso 2.

1. Instala [Node.js](https://nodejs.org) (versión LTS).
2. Abre PowerShell y verifica:
   ```powershell
   node -v
   npm -v
   ```

## 2. Descomprimir y preparar el proyecto

```powershell
cd Desktop
# descomprime el ZIP aquí, entra a la carpeta
cd gestion-fsy-2027
npm install
```

## 3. Conectar con Firebase (base de datos con nombre dentro de confejas-2026)

Reutilizamos el proyecto `confejas-2026` en vez de crear uno nuevo, para no chocar con el límite de 4 proyectos de tu cuenta de Google. FSY 2027 usa una **base de datos Firestore separada** dentro de ese mismo proyecto — los datos nunca se mezclan con los de CONFEJAS.

### 3.1 Crear la base de datos con nombre

1. Entra a https://console.firebase.google.com/u/0/project/confejas-2026
2. Menú izquierdo → "Compilación" → "Firestore Database"
3. Vas a ver la base "(default)" que ya usa CONFEJAS — **no la toques**. Busca el botón "+ Agregar base de datos" (o el selector de bases de datos arriba, con un "+").
4. ID de la base de datos: `fsy-2027` (exactamente así, en minúsculas y con guion — tiene que coincidir con lo que pongas en `.env.local`).
5. Modo: Producción. Región: la misma que uses en CONFEJAS o `southamerica-east1`.
6. "Crear".

### 3.2 Obtener el firebaseConfig (son los mismos de siempre)

Como es el mismo proyecto, el `firebaseConfig` es el mismo que ya usas para CONFEJAS 2026 — no hace falta registrar una app nueva. Si no lo tienes a la mano: Configuración del proyecto (ícono de engranaje) → pestaña "General" → baja hasta "Tus apps" → selecciona la app web → ahí está el bloque `firebaseConfig`.

### 3.3 Llenar .env.local

Copia el archivo de ejemplo:

```powershell
copy .env.example .env.local
```

Abre `.env.local` con el Bloc de notas y pega los 6 valores del `firebaseConfig` de CONFEJAS, más el ID de la base de datos que acabas de crear:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=confejas-2026.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=confejas-2026
VITE_FIREBASE_STORAGE_BUCKET=confejas-2026.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FIREBASE_DB_ID=fsy-2027
```

**La última línea (`VITE_FIREBASE_DB_ID`) es la que hace que esta app escriba en su propia base y nunca toque los datos de CONFEJAS.** Si la dejas vacía, la app se queda en "Modo local" a propósito — es una protección, no un bug.

## 4. Probar en tu computadora

```powershell
npm run dev
```

Abre el link que aparece (normalmente `http://localhost:5173`). Si ves el banner amarillo "Modo local", significa que el `.env.local` no se llenó bien — revisa el paso 3.

Para ver el formulario de registro público: `http://localhost:5173/?page=registro`

## 5. Pegar las reglas de Firestore

⚠️ **Paso crítico**: Firestore Database tiene ahora un selector de base de datos arriba (donde dice "(default)"). **Cámbialo a `fsy-2027` antes de tocar nada** — si editas las reglas con "(default)" seleccionada, estarías modificando las reglas de producción de CONFEJAS 2026 por error.

Con `fsy-2027` seleccionada: pestaña "Reglas" → borra todo → pega el contenido del archivo `firestore.rules` que viene en este ZIP → "Publicar".

## 6. Crear tu primer usuario (Coordinador General)

Antes de tener una pantalla de administración, crea el primer usuario directo en Firebase Console. **Mismo cuidado que en el paso anterior: verifica que el selector de base de datos siga en `fsy-2027`, no en "(default)".**

1. Firestore Database (con `fsy-2027` seleccionada) → "Iniciar colección" → nombre `usuarios`.
2. ID del documento: tu correo, ej. `ricardo@correo.com`.
3. Campos:
   - `correo` (string): tu correo
   - `passwordHash` (string): déjalo vacío `""`
   - `rol` (string): `Coordinador General`
   - `estaca` (string): déjalo vacío `""`
   - `activo` (boolean): `true`
   - `fechaCreacion` (string): la fecha de hoy en cualquier formato

Cuando entres al login con ese correo, la app va a detectar que no tiene contraseña y te va a pedir crear una — ese es tu primer acceso.

## 7. Desplegar a Vercel

```powershell
npm install -g vercel
vercel login
vercel --prod
```

Cuando pregunte por variables de entorno, o después desde el dashboard de Vercel (Settings → Environment Variables), agrega las **7** variables de `.env.local` (las 6 de siempre + `VITE_FIREBASE_DB_ID`). Este es un proyecto de Vercel nuevo y separado del de CONFEJAS — no lo despliegues encima del existente.

## 8. Entregas siguientes

Cada nueva versión te la doy como ZIP completo (nunca archivos sueltos), igual que con CONFEJAS. Repite: descomprimir → `npm install` → copiar tu `.env.local` existente a la carpeta nueva → `vercel --prod`.
