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

## 6. Estado actual — Fase 34: nombre específico del evento, visible en todo lo público (parche `0037`)

### Construido y verificado (`npx tsc -b`, `npx vite build`, `npx tsx tests/qa.test.ts` — 66/66 pasan)
- **Fases 1-33**: ver historial de commits/parches.
- **Fase 34** — bug de UX real reportado por Ricardo: gente que ya había ido a Confe JAS o a otra sesión de FSY leía "¿Es tu primera vez en esta preparación?" y pensaba en esa OTRA experiencia — porque en ningún lado del formulario público se decía explícitamente que esto es "FSY Noroeste · Sesión 2", solo el genérico "FSY 2027".
  - Nueva constante `EVENTO_NOMBRE` en `data/evento.ts` (asumido "FSY Noroeste · Sesión 2" por el nombre del repo de GitHub — corregible en un solo lugar si el nombre oficial es otro).
  - Se hizo prominente (no solo un badge chico) en `PublicEntry` (la pantalla que reportó Ricardo), y la pregunta pasó a decir explícitamente "¿Es tu primera vez en la preparación de FSY Noroeste · Sesión 2?". También agregado en `RegistroWizard`, `AutoCheckInScreen` y `LoginScreen` por consistencia. En el header compacto de staff (`App.tsx`) se agregó de forma más discreta, sin sumar una línea nueva al espacio ya ajustado del encabezado — ahí la ambigüedad importa menos porque el staff ya sabe qué evento administra.
  - **Bug adicional encontrado en el camino**: el botón "Sí, es mi primera vez" seguía diciendo "3 pasos rápidos" — desactualizado desde que el wizard pasó a 4 pasos (Fase 26, audiovisual). Corregido.
  - Verificado visualmente con Playwright antes de entregarlo.

### Explícitamente NO construido todavía
- Edición de `fechaNacimiento` y `experienciaPrevia` desde la ficha de Búsqueda (hoy son de solo lectura ahí).
- Panel de contexto lateral en desktop para el registro (pendiente de decisión, ver Fase 6).
- El app del evento en sí — proyecto nuevo y separado, no iniciado.
- Filtro de "consentimiento pendiente" en Búsqueda.

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

## 8. Flujo de trabajo con Claude (leer antes de tocar código)

- **Entrega por parches.** Claude trabaja en un clon de verificación y entrega `NNNN-nombre.patch`. Ricardo los aplica en Windows (`D:\Documentos\GitHub\FSY 2027\gestion-fsy-2027`, PowerShell): `git apply --ignore-whitespace <parche>`, `git add -A`, `git commit`, `git push`. Claude **no** hace push. Push a `master` despliega solo en Vercel (https://gestion-fsy-2027.vercel.app).
- **Antes de entregar:** `npx tsc -b`, `npx tsx tests/qa.test.ts`, `npx vite build`; respetar el fin de línea (EOL) que tiene `HEAD` en cada archivo; comprobar que el parche aplica en LF y en CRLF (`--ignore-whitespace`).
- **Firestore:** proyecto `confejas-2026`, base `fsy-2027`. Toda colección nueva necesita su `match` en `firestore.rules` **y** publicarse a mano en la consola (base `fsy-2027`), o aparece "missing or insufficient permissions". Ej.: `parejasTrabajo`.
- **Fechas:** nunca `new Date('YYYY-MM-DD')` (desfase de zona horaria). Usar `src/utils/fechaAmigable.ts`.
- **Contenedores flex-col con scroll** encogen a sus hijos: usar `shrink-0`.

## 9. Convenciones de producto y UX

- **Término único en la interfaz: "Compañía(s)"**, nunca "Familia". En Firestore se sigue guardando `Familia N` (hay regex que dependen de eso); en pantalla se usa `nombreCompania(f)` (`src/utils/companias.ts`).
- **Nombres cortos:** Primer nombre + Apellido paterno + inicial del materno (`src/utils/nombreCorto.ts`).
- **Siempre mediana junto al promedio** en las métricas.
- Toques de 44 px como mínimo, texto de 12 px como mínimo, "Deshacer" (`useAvisoDeshacer`) en vez de `confirm()` en acciones de un toque, explicaciones en una hoja ⓘ (`InfoSheet`) y no como texto fijo.
- **Compañerismos de trabajo** (`parejasTrabajo`): parejas o tríos dentro de una compañía, solo Consejeros y Logísticos, se permite "sin compañero" y se pueden modificar (no son oficiales). Distintos de los Coordinadores Auxiliares (`Companerismo`).
- **Sugerir parejas** (`sugerirParejas` en `src/utils/parejasTrabajo.ts`, botón ✨ en Compañías): solo usa a quienes aún no tienen compañero (no toca los ya armados). Busca la combinación de menor costo con cálculo exacto (par del mismo sexo = 100, par de la misma estaca = 1): hombre + mujer siempre que se pueda, sobrantes del mismo sexo entre sí, un solo trío si la cantidad es impar, y a igualdad prefiere estacas distintas. `semilla` 0 = primera propuesta; "Otra propuesta" avanza la semilla hasta dar una combinación distinta (`otraPropuesta`, devuelve `null` si no hay). Con más de `MAX_SUGERIR` (18) personas propone por tandas. Aplicar guarda todo en un solo batch (`guardarParejasLote`) y falla si alguien ya tiene compañero (`planearLote`); Deshacer borra el lote entero (`deshacerParejasLote`). Acciones de auditoría: `SUGERIR_COMPANERISMOS_FAMILIA`, `DESHACER_SUGERENCIA_COMPANERISMOS`. No hay colección nueva ni cambios en `firestore.rules`.
- **Franja de compañías en Gestión:** fija arriba (`sticky -top-4`, el `-4` compensa el `p-4` del contenedor que scrollea), pero se esconde al bajar y vuelve al subir, igual que el menú inferior (`useScrollDirection`); escondida, deja una línea de 4 px del color de la compañía.
- **Asistencia** (`AsistenciaScreen.tsx`): chips de estado "Por marcar · n" / "Presentes · n" (un toque filtra, otro vuelve a todos; "Por marcar" = sin marca o "ausente", el justificado no cuenta en ninguno) en la misma fila que el avance. Chip "Sin compañía" = solo Consejero/Logístico (`esDeReparto`); "Otros roles" = el resto del equipo sin compañía. La fecha del evento siempre se ve (antes se escondía al filtrar y el encabezado saltaba). Botón "Justif." con texto, no "J".
- Marca: azul `#0E2954`, acento `#f5c038`, fondo `#eef1f7`.

## 10. Estado y pendientes

Aplicados: 0054–0056 (compañerismos de trabajo, Inicio limpio, hoja ⓘ en Seguimiento), 0057 (Gestión → Compañías), 0058 (Sugerir parejas), 0058b/c (franja de compañías al ras y que se esconde al bajar), 0059 (Asistencia), 0064 (Usuarios: tocar una cuenta abre una hoja con acciones; el Coordinador General puede RESTABLECER la contraseña de cualquier cuenta menos la suya —borra el hash y la persona entra por la pantalla de crear contraseña—; Desactivar/Activar pasó a la hoja; fila propia marcada "Tú"), 0063b (Reportes: fila de filtros por tipo de evento ya no se aplasta; Compañías: tarjetas alineadas arriba; Usuarios: correo completo, botón 44px y Deshacer al activar/desactivar), 0063 (Noches de Hogar rediseñadas: una tarjeta por noche con fecha tipo calendario, solo una abierta a la vez, próximas primero y pasadas después, "Ver más" de 5 en 5, tocar la fila marca presente, botón J justificado, "Todos presentes" con Deshacer, editar y eliminar con Deshacer, fecha por defecto hoy. Las noches son REGISTRO INTERNO de la compañía: no se mezclan con la asistencia general ni con Reportes/Seguimiento; sin fechas ni cantidades fijas), 0062c (Noches de Hogar: orden de más reciente a más antigua y marca de asistencia atómica por persona), 0062b (Gestión → Compañía: Noches de Hogar con nombres cortos, botón sin partirse y "Compañía" en vez de "Familia" en el título; aviso cuando Sugerir/Armar están apagados; Integrantes sin la pareja repetida; "Separar" más angosto que "Cambiar"), 0062 (Transversal: ícono y manifest PWA en public/, <ScrollX> = tiras sin barra con degradado de borde y centradas en lo activo —incluye la tira de Gestión—, fechas amigables en Gestión y Auto check-in; las etiquetas guardadas de eventos "Tipo — yyyy-mm-dd" no se tocaron), 0061 (Reportes: gráfico y detalle fundidos en una tarjeta por evento — % grande, ▲▼ vs evento anterior, barra apilada ✓ J ✕ ○, ⓘ del cálculo; "Por estaca" y "Por rol" de mayor a menor). El % de asistencia es presentes ÷ todo el segmento (sin excluir a nadie); promedio y mediana usan ese mismo %, 0060 (Búsqueda: varias palabras, sugerencia de estacas al escribir, chip "🎬 AV"). Búsqueda: cada palabra debe aparecer (tolera tildes y espacios omitidos, "prolima"); mínimo 3 letras; las estacas que coinciden se ofrecen como filtro. 0065 (Asistencia abre en el evento de HOY: en curso › próximo de hoy › último de hoy; antes saltaba al del día siguiente si el de hoy ya había empezado). 0066 (marca "✓ Participa" por integrante en Gestión → Compañías → Integrantes, la ponen los Coordinadores Auxiliares y el General; el reparto y la asignación en vivo cuentan solo a los marcados; sin la marca escrita cuenta; al entrar a una compañía se reinicia a marcado; queda en Historial). 0067 (Gestión → Compañías: Compañerismos, Noches de Hogar e Integrantes son tarjetas plegables —componente Plegable— cerradas al entrar con resumen de una línea; las acciones van dentro del contenido; Integrantes abre sola si la compañía está vacía). 0068 (Gestión → Compañías → Todas: botón "📋 Resumen en números" solo para el Coordinador General; texto sin nombres con inscritos/participan/H-M/edad/estaca/asistencia por compañía y los sin compañía, para revisar el algoritmo de reparto). 0069 (tarjeta de compañía en la vista general: "Participan N de M" cuando hay quien no participa, en ámbar bajo 60%; H/M y estacas de la tarjeta = lo que ve el algoritmo). 0070 (Integrantes: aviso en ámbar a quien está marcado y no vino a ninguna de las últimas 3 capacitaciones —solo tipo Capacitación, ya pasadas y con lista pasada; justificado cuenta; no avisa a quien se registró después—; solo lo ven Coordinador General y auxiliares; no cambia marcas; sin lecturas nuevas: usa la asistencia compartida ya en memoria; famMembers memoizado).

Pendientes, en orden:
- Por auditar: Roles, Capacitaciones, Usuarios, Compromiso, Seguimiento, Login.
