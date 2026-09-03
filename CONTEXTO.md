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

## 6. Estado actual — Fase 4: Búsqueda (`gestion-fsy-2027-v8.zip`)

### Construido y verificado (`npx tsc -b`, `npx vite build`, `npx tsx tests/qa.test.ts` — 10/10 pasan)
- **Fase 1**: Registro público, login correo+contraseña con primer acceso, Asistencia en tiempo real, Home.
- **Fase 2**: Familias, Compañerismo, Roles, administración de Capacitaciones, Reportes.
- **Fase 3**:
  - **Noches de Hogar** (`src/services/nochesHogarService.ts`) — planificar sesiones por familia y marcar asistencia interna de sus consejeros. Visible dentro de la pestaña Familias, debajo de Compañerismo.
  - **Auditoría con timeline visual** (`src/components/AuditTimeline.tsx`) — se carga bajo demanda (no en cada render) al abrir el detalle de un consejero desde la pestaña Familias. Lee de la colección `auditoria` que ya se venía escribiendo desde la Fase 1.
  - `firestore.rules` actualizado con la colección `nochesHogar` (checklist de la sección 7 aplicado).
- **Fase 4**: `src/components/BusquedaScreen.tsx` — búsqueda difusa de participantes (por nombre, estaca o barrio, sin necesitar tildes exactas), ficha expandible, edición completa (`canEditAll`). El Home ahora tiene las **5 acciones rápidas** del GAS original: Registrar (enlace externo a `?page=registro`), Buscar, Marcar asistencia, Gestión, Reportes — se me había quedado fuera Búsqueda en las fases anteriores.

### Explícitamente NO construido todavía (pendiente, no pedido en esta entrega)
- Permisos graduales más finos — hoy solo hay `canEditAll` vs. `isAuxiliar`; el filtrado de datos "solo mi familia" para Coordinador Auxiliar tiene el campo `familiaId` en la sesión pero el frontend aún no restringe lo que ve un auxiliar.
- Compresión de bundle (Firebase SDK pesa ~800KB sin comprimir; si se vuelve un problema real, se resuelve con `React.lazy()` en `GestionScreen`/`ReportesScreen`, mismo patrón que ya usaron en CONFEJAS desde su v29).
- El app del evento en sí (equivalente FSY 2027 de `confejas-2026`) — proyecto nuevo y separado, no iniciado.

### Nota real de campo — correo como ID del documento, no como fuente de verdad del dato

En el primer despliegue real, crear el usuario a mano en Firebase Console dejó el campo `correo` con un espacio de más en el nombre del campo (`"correo "` en vez de `"correo"`), lo que rompió el guardado de la contraseña de primer acceso. `authService.ts` ya no depende de ese campo para nada crítico — usa el correo con el que la persona ya inició sesión (que coincide con el ID del documento, la única fuente de verdad real). Si se vuelve a crear un usuario a mano, no pasa nada si el campo `correo` queda mal escrito — pero igual conviene revisarlo por prolijidad.

## 7. Cómo verificar cualquier cambio nuevo

```bash
npm install --no-audit --no-fund
npx tsc -b                  # debe salir limpio
npx vite build               # debe terminar en "✓ built"
npx tsx tests/qa.test.ts     # deben pasar todas las pruebas
```

Si se toca `firestore.rules`: hay que volver a pegarlo manualmente en Firebase Console → Firestore Database → Reglas → Publicar (no se sincroniza solo al desplegar a Vercel — misma lección que en CONFEJAS).
