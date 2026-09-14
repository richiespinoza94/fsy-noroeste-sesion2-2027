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

## 6. Estado actual — Fase 26: perfil audiovisual — Paso 4 del registro + prompt en check-in (parche `0029`)

### Construido y verificado (`npx tsc -b`, `npx vite build`, `npx tsx tests/qa.test.ts` — 42/42 pasan)
- **Fases 1-25**: ver historial de commits/parches.
- **Fase 26** — a pedido explícito, para identificar candidatos al equipo audiovisual. Se planeó la arquitectura antes de tocar código (back + front) para no arriesgar romper el wizard ni el check-in ya probados:
  - **Datos**: `Participante.audiovisualHabilidades: string[]` y `audiovisualEquipo: 'si'|'no'|'algo'|''` (`types.ts`). El string vacío `''` es la señal de "todavía no se le preguntó" — distinto de `'no'` ("sí se le preguntó, no tiene") — es lo que permite decidir a quién ofrecerle la pregunta la próxima vez.
  - **Registro nuevo**: `RegistroWizard` pasó de 3 a 4 pasos — el nuevo Paso 4 ("🎬 Equipo audiovisual") es 100% opcional, no bloquea el envío del registro. 3 checkboxes de habilidades + texto libre para "otra", y 3 opciones de equipo propio. `StepIndicator` y el subtítulo se actualizaron a 4 pasos.
  - **Alguien que ya se registró**: en `AutoCheckInScreen`, al tocar su nombre, si `!p.audiovisualEquipo` (cubre tanto `''` como `undefined` — este último es lo que tienen los participantes creados ANTES de que este campo existiera, ya que Firestore ni siquiera guarda la propiedad) aparece un bottom-sheet con las mismas 2 preguntas, con "Omitir" siempre visible, ANTES de marcar asistencia. La función `marcar()` original no se tocó — el prompt solo la llama después de guardar (o de omitir), nunca la reemplaza, para no arriesgar el mecanismo de bloqueo por dispositivo ni la ventana de tiempo ya construidos.
  - **Visibilidad del dato**: nuevas filas "🎬 Habilidad AV" / "📷 Equipo AV" en la ficha expandida de Búsqueda.
  - Verificado visualmente con Playwright (Paso 4 del wizard) antes de entregarlo.
  - **A pedido explícito de Ricardo**: la lógica de "¿debo marcar asistencia automática al registrarme?" (Fase 22) vivía metida dentro de `submit()` en `RegistroWizard.tsx` — nunca se probó sola, solo indirectamente a través de sus piezas internas. Se extrajo a `getCapacitacionParaAutoMarcar()` en `capacitacionesService.ts` y se le escribieron 6 pruebas dedicadas (43-48 → 48 pruebas en total), incluidos los dos casos exactos que preguntó (llenar el formulario SIN ventana activa vs. CON ventana activa) y los bordes exactos de apertura/cierre.

### Explícitamente NO construido todavía
- Edición de `fechaNacimiento` y `experienciaPrevia` desde la ficha de Búsqueda (hoy son de solo lectura ahí).
- Panel de contexto lateral en desktop para el registro (pendiente de decisión, ver Fase 6).
- El app del evento en sí — proyecto nuevo y separado, no iniciado.
- Filtro dedicado en Búsqueda para "solo con habilidad audiovisual" (el dato ya es visible en la ficha, pero no hay un chip/filtro específico todavía).
- Incluir los campos de audiovisual en el CSV de Reportes (hoy ese CSV solo trae la matriz de asistencia).

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
