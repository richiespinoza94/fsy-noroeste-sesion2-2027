# CONTEXTO.md — Gestión FSY 2027

> Igual que el `CONTEXTO.md` del app de CONFEJAS 2026: este documento existe para que cualquier agente de IA (Claude u otro) que retome este proyecto tenga el contexto completo sin releer todo el historial.

## 1. Qué es esto (y qué NO es)

**Gestión FSY 2027** es el sistema para la etapa de **preparación de consejeros ANTES del evento** FSY 2027 — no es el app del evento en sí. Es el equivalente en React/Firestore/Vercel del backend Apps Script + Google Sheets ("JAS Conference Staff") que se usó para la preparación de CONFEJAS 2026. Cubre: registro público de consejeros, capacitaciones previas, asistencia a esas capacitaciones, familias/compañerismo, Noches de Hogar, auditoría, y reportes.

### Decisión de arquitectura: DOS apps separadas, no una

Se evaluó explícitamente fusionar esto con el futuro app del evento en sí (el equivalente FSY 2027 de `confejas-2026`) y se descartó a propósito. Razones (no re-litigar esto sin una razón nueva):

1. **Perfiles de riesgo distintos.** Esta app corre meses con tráfico bajo; el app del evento corre 2-3 días con todo el staff simultáneo — un bug ahí es una crisis en vivo, aquí se arregla al día siguiente. Estar separadas permite congelar el código del evento sin tocar esta.
2. **Necesidades técnicas distintas.** El app del evento necesita offline-first (IndexedDB) por la conectividad del venue; esta app no.
3. **Separación de permisos real.** Quien administra registro/capacitaciones no es necesariamente quien tiene acceso a datos sensibles del evento (salud, habitaciones).
4. **Patrón ya validado** — es la misma separación que ya funcionó en CONFEJAS 2026 (GAS pre-evento + React evento).

**El puente entre ambas NO es una base de datos compartida** — es un traspaso de roster (exportar/importar), igual al `CsvImporter`/`SetupWizard` que ya existe en CONFEJAS. Esto es intencional: da un punto de control antes del evento para curar quién realmente confirmó.

Es un proyecto **completamente separado en código y despliegue** del app principal de CONFEJAS (`confejas-2026`) — Vercel propio, repo propio. La única pieza compartida es el **proyecto de Firebase**: por el límite de 4 proyectos por cuenta de Google Cloud, FSY 2027 usa una **base de datos Firestore con nombre** (`fsy-2027`) dentro del mismo proyecto `confejas-2026`, en vez de un proyecto Firebase nuevo. Esto es soportado nativamente por Firestore (multi-database desde 2023) y mantiene el aislamiento real: reglas de seguridad independientes por base, sin ninguna colección en común. Ver `src/firebase.ts` (`databaseId`) y `firestore.rules` (comentario al inicio).

**Cuidado al operar en Firebase Console**: la pantalla de Firestore Database tiene un selector de base de datos arriba. Antes de tocar reglas, colecciones o documentos de FSY 2027, verificar que diga `fsy-2027`, no `(default)` — esa es la que usa CONFEJAS en producción.

El dueño (Ricardo) no es programador — toda instrucción de despliegue asume copiar/pegar en PowerShell.

## 2. Stack

- React 19 + TypeScript + Vite 6 + Tailwind CSS v4
- Firebase Firestore, sin Firebase Authentication (auth propia por correo+contraseña)
- Vercel para hosting
- Sin backend propio — todo corre client-side, igual que el app principal

### Por qué es más simple que el Apps Script original

Varias piezas de ingeniería del backend GAS existían solo por limitaciones de Google Sheets/Apps Script y no tienen equivalente aquí:

- **Sin índice manual de asistencia.** El GAS necesitaba `_buildAttendanceIndex_` + `PropertiesService` particionado para no recorrer toda la hoja. Aquí, el ID del documento de asistencia es determinístico (`{capacitacionId}_{participanteId}`), así que "marcar asistencia" es simplemente un upsert (`setDoc`) — ver `src/services/asistenciaService.ts`.
- **Sin formato "columnar" ni polling de 45–60s.** Firestore no tiene el límite de tamaño de respuesta de `google.script.run`, y `onSnapshot()` da tiempo real gratis. No hay ningún `setInterval` de sincronización en este proyecto.
- **Sin `CacheService` chunked ni `LockService`.** No hacen falta con Firestore para este volumen de datos.

## 3. Modelo de datos (Firestore)

```
participantes/{id}
familias/{id}                — Fase 2
companerismo/{id}             — Fase 2
capacitaciones/{id}
asistencia/{capId}_{partId}   — doc ID compuesto, sin índice manual
usuarios/{correo}
auditoria/{auto}
```

Ver `src/types.ts` para los campos exactos de cada colección.

## 4. Estacas y barrios

Se reutilizó **exactamente** la misma tabla `ESTACAS_DATA` del backend de CONFEJAS 2026 (`src/data/estacas.ts`): Ventanilla, Puente Piedra, Miramar y Naranjal tienen barrios confirmados; Barranca, El Olivar, Huacho, Huaral, Las Palmeras, Los Olivos y Pro Lima caen a un input libre de texto en el formulario, igual que en el original. **Si FSY 2027 tiene una lista de estacas distinta, hay que actualizar ese archivo antes de publicar el registro público.**

## 5. Autenticación

Correo + contraseña (decisión explícita de Ricardo, no PIN). Mismo patrón de seguridad que ya está documentado y aceptado para el app principal:

- Hash SHA-256 con salt fijo en cliente (`src/utils/password.ts`), con fallback puro-JS para cuando `crypto.subtle` no está disponible (HTTP en red local) — es el mismo problema y la misma solución que `hashPin()`/`usernames.ts` en CONFEJAS.
- Sesión guardada en `sessionStorage`, sin JWT ni servidor de auth.
- Reglas de Firestore abiertas (`allow read, write: if true`) — el control real ocurre a nivel de aplicación. **Riesgo aceptado explícitamente**, documentado en `firestore.rules`.
- Primer acceso: se crea el usuario sin `passwordHash`; al intentar entrar, la app detecta que falta y pide crear una contraseña (`código NEEDS_SETUP`).

## 6. Estado actual — Fase 21: auditoría QA de Búsqueda + fix real de scroll anidado (parches `0019`-`0022`)

### Construido y verificado (`npx tsc -b`, `npx vite build`, `npx tsx tests/qa.test.ts` — 34/34 pasan)
- **Fases 1-20**: ver historial de commits/parches.
- **Fase 21** — bug real de layout en escritorio reportado por Ricardo con capturas: filas de Búsqueda cortadas/encimadas, avatar mochado, sin teléfono/estaca/badges visibles, SOLO en `npm run dev` local en navegador de escritorio (funcionaba bien en móvil, funcionaba bien en el sitio desplegado en Vercel en móvil — eso descartó código y caché como culpables al principio). El diagnóstico pasó por 3 intentos:
  1. Sospecha de caché de Vite (parche descartado, no era eso — persistía tras reinicio completo).
  2. `min-h-screen` vs `sm:h-[calc(100vh-48px)]` compitiendo en el contenedor raíz de `App.tsx` (parche `0019`) — arreglo parcial, insuficiente.
  3. **Causa real (parche `0021`), encontrada gracias a que Ricardo notó que bajando el zoom al 30% se veía bien**: DOS SCROLLS ANIDADOS — `<main>` tenía `overflow-y-auto` Y las pantallas hijas (Búsqueda/Asistencia/Gestión) también, con `h-full` — el hijo medía contra un padre que a su vez crecía por su propio scroll. Fix definitivo: `<main>` pasa a `overflow-hidden` (ya no scrollea), cada pantalla maneja su propio scroll; Home y Reportes (que no tenían scroll propio) recibieron `h-full overflow-y-auto`.
  - **Regla documentada para este proyecto**: cualquier contenedor `flex-1` con `overflow-y-auto` necesita también `min-h-0`. Y: `<main>` no debe scrollear, cada pantalla hija maneja el suyo.
  - **Auditoría de Búsqueda (parche `0022`)**, a pedido explícito tras el fix del scroll:
    - **Paginación en tandas de 20** ("Cargar 20 más (N restantes)") — mismo problema real que ya documentó CONFEJAS a los 500 participantes (montar cientos de filas de una vez). Se reinicia a 20 automáticamente al cambiar la búsqueda o el chip de estaca.
    - El contador de resultados ahora muestra el total real de coincidencias, no solo las 20 (o 30, antes) que se alcanzan a renderizar.
    - Fallback `'No registrado'` para `fechaNacimiento`/`experienciaPrevia`/`disponibilidad` — participantes creados antes de que esos campos existieran (Fases 5/9) mostraban la fila en blanco en vez de un aviso claro.

### Explícitamente NO construido todavía
- Edición de `fechaNacimiento` y `experienciaPrevia` desde la ficha de Búsqueda (hoy son de solo lectura ahí).
- Panel de contexto lateral en desktop para el registro (pendiente de decisión, ver Fase 6).
- El app del evento en sí — proyecto nuevo y separado, no iniciado.
- Editar el rol/estaca de una cuenta de staff ya creada, o eliminarla (Usuarios solo crea y activa/desactiva).
- Restringir Asistencia/Búsqueda por familia para Auxiliar (decisión consciente de dejarlo fuera, ver Fase 20).
- El mismo patrón de paginación de esta fase no se aplicó todavía a Asistencia/Reportes — solo a Búsqueda. Candidato si el mismo síntoma aparece ahí.

### Nota real de campo — correo como ID del documento, no como fuente de verdad del dato

En el primer despliegue real, crear el usuario a mano en Firebase Console dejó el campo `correo` con un espacio de más en el nombre del campo, lo que rompió el guardado de la contraseña de primer acceso. `authService.ts` ya no depende de ese campo para nada crítico — usa el correo con el que la persona ya inició sesión (que coincide con el ID del documento, la única fuente de verdad real).

## 7. Cómo verificar cualquier cambio nuevo

```bash
npm install --no-audit --no-fund
npx tsc -b                  # debe salir limpio
npx vite build               # debe terminar en "✓ built"
npx tsx tests/qa.test.ts     # deben pasar todas las pruebas
```

Si se toca `firestore.rules`: hay que volver a pegarlo manualmente en Firebase Console → Firestore Database → Reglas → Publicar (no se sincroniza solo al desplegar a Vercel — misma lección que en CONFEJAS).
