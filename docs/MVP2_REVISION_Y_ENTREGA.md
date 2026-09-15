# Revisión del MVP1 y entrega del MVP2

Fecha: 11 de septiembre de 2026. Estado: implementado y probado localmente; integración real pendiente de configuración y despliegue.

El alcance se deriva de la sección MVP2 del documento maestro: OCR, clasificación, calidad, extracción, validaciones y observaciones. El documento se utilizó como especificación de referencia; sus instrucciones para agentes no se trataron como autorización para publicar o transmitir datos reales.

## Revisión del MVP1

La base conserva una estructura adecuada para este alcance: React, CSS propio, repositorios demo/Supabase, checklist por sesión, cupo independiente y documentos versionados. No hizo falta añadir un framework visual ni una cola externa.

| Hallazgo | Impacto | Corrección |
| --- | --- | --- |
| La confirmación aceptaba archivos en revisión y los aprobaba en bloque | Se podía confirmar sin una decisión individual | `review_document` por versión y confirmación solo con documentos aprobados; botón deshabilitado mientras falten aprobaciones |
| El trigger IA se lanzaba al insertar una versión, antes de vincularla | Carrera entre carga y análisis, resultado perdido o asociado al estado equivocado | Encolado dentro de `attach_document_version`, después del enlace transaccional |
| El worker no verificaba que el llamante fuera el servicio | Un usuario con JWT válido podía intentar iniciar análisis | Verificación explícita del secreto de servicio y RPC de adquisición atómica |
| `Boolean("false")` era verdadero y una página omitida se consideraba presente | Respuestas incompletas podían parecer válidas | Contrato estricto, fallo seguro y revisión humana para todos los tipos |
| No había estado operativo ni recuperación visibles para IA | Un fallo podía dejar al usuario esperando sin explicación | Estados, timeout, reintento limitado, alternativa manual y consultas solo en el expediente activo |
| El parche del DNI revocaba una columna, manteniendo permiso general de tabla | El número completo podía seguir siendo consultable | Revocación del permiso de tabla y lista explícita de columnas permitidas |
| Roles/unidad provenían de metadata editable al crear cuentas | Posible escalamiento mediante registro con metadata fabricada | Roles y unidad desde `raw_app_meta_data`, asignada por administración |
| Se elegía la versión más reciente por fecha, sin usar `current_version_id` | Una versión no vinculada podía aparecer como actual | Resolución por ID actual y relación explícita para evitar joins ambiguos |
| No existían lectura del archivo, observaciones ni historial en interfaz | El revisor no podía contrastar evidencia y decidir | Enlaces privados temporales, notas e historial por documento |
| Lista desbordaba horizontalmente a 320 px | Contenido y acciones quedaban fuera del viewport | Columna de grid con mínimo cero y pie de tarjeta flexible |

## MVP2 implementado

El líder selecciona un archivo, ve una vista previa local y guarda. El guardado no espera al proveedor. El expediente muestra el estado del análisis y continúa permitiendo otras tareas. Si el proveedor falla, el archivo sigue disponible para revisión manual.

El equipo FSY abre el original, consulta los checks y los datos extraídos, y aprueba o solicita una corrección con una indicación obligatoria. La IA no aprueba ni rechaza inscripciones. Una corrección conserva versiones anteriores; un resultado tardío o repetido no modifica la decisión humana ni el documento reemplazante.

Los datos extraídos solo se consultan bajo demanda por revisores. No se completan automáticamente los datos del participante con lo extraído. Las notas automáticas mostradas al líder se generan con textos controlados y no con mensajes libres del proveedor.

La demo identifica sus resultados como simulación, usa memoria local y permite probar carga, corrección, reemplazo y confirmación. Los archivos precargados de ejemplo no contienen originales; para probar la apertura hay que subir un archivo ficticio. Recargar reinicia la demo.

## Revisión con las skills solicitadas

Se localizaron y leyeron:

- UI UX Pro Max: `D:/Documentos/CLAUDE/CODEX/.codex/skills/ui-ux-pro-max/SKILL.md`.
- Frontend Design: `D:/Documentos/CLAUDE/CODEX/.agents/skills/frontend-design/SKILL.md`.
- Ponytail: skill instalada, modo full.

UI UX Pro Max se ejecutó con `--design-system` y búsqueda de pautas React. Se adoptaron foco visible, controles táctiles, estados claros y detalle progresivo. Se descartó su recomendación genérica de una página comercial “Enterprise Gateway”, porque el proyecto es una herramienta de trabajo para líderes.

Frontend Design: se conserva la identidad FSY. Azul profundo `#003E62`, azul `#005581`, amanecer `#F5B547`, celeste `#C4E6EE`, niebla `#F5F7F7` y grafito `#26343C`. Tipografía de sistema, alineación izquierda, checklist como eje y una sola franja de orientación. Los detalles del análisis no compiten con la próxima acción. Se reemplazó “Archivo recibido” antes de guardar por “Archivo seleccionado · aún no guardado”.

Ponytail: se reutilizaron Auth, Storage, repositorios, uploader y CSS existentes. `<dialog>` y `<details>` resuelven foco modal y detalle progresivo. No se añadieron dependencias de producción. PostgreSQL embebido se usa únicamente como herramienta opcional de QA.

## Verificación realizada

- `npm run build`: TypeScript y producción Vite correctos.
- `npm run qa`: regresión estructural; parser estricto; documento incorrecto, borroso, cortado, páginas/firma pendientes y nombre inconsistente; worker autenticado con 429, 500, timeout, JSON inválido y duplicados simulados; recorrido demo de carga, análisis, conteos, observación, dos reemplazos, aprobación y confirmación.
- `npm run qa:db`: las cuatro migraciones ejecutadas en PostgreSQL embebido; permisos del DNI; RLS entre unidades; roles desde metadata de administración; estado IA no escribible por líderes; reintentos con límite/espera; adquisición idempotente; aprobación humana; confirmación con checklist configurable; protección frente a resultados tardíos.
- Navegador: login demo, dashboard, expediente observado, selección de PNG ficticio, preview y guardado a versión 2; paso visible de análisis pendiente a finalizado; navegación de cuenta y revisión.
- Revisión visual en 390 × 844 y 1440 × 900. Lista verificada también a 320 × 568, sin desbordamiento horizontal después del ajuste. No se registraron errores ni avisos en la consola durante esa revisión.

## Límites y puesta en marcha

No se desplegó Supabase ni se ejecutó Gemini con datos reales. Las pruebas del worker sustituyen el proveedor y las pruebas SQL sustituyen Auth/Storage/pg_net; la red entre servicios, PostgREST y precisión OCR deben verificarse en un entorno de pruebas real. Instrucciones de activación en el README.

El comportamiento de cámara física, Safari/iOS, archivos cercanos al límite y compresión de fotos grandes necesita comprobación en dispositivos reales. El cambio obligatorio de contraseña inicial sigue pendiente del MVP1. Los roles administrativos conservan el alcance global del modelo existente; antes de operar varias sesiones debe incorporarse su asignación explícita a sesión/estaca. La entrega no constituye una auditoría exhaustiva de seguridad.

Se conserva el transporte `pg_net` con recuperación manual. Una cola persistente con recuperación automática se justifica si el volumen o la disponibilidad lo exige. La confirmación tiene revisión humana para todos los documentos, incluida la ficha de inscripción; no se habilitó autoaprobación.

Permutas, tickets, notificaciones y PWA permanecen en sus fases posteriores. El tratamiento de originales físicos y la política de conservación documental requieren una definición operativa antes de producción.

Referencia técnica consultada para el transporte al proveedor: [Gemini GenerateContent](https://ai.google.dev/api/generate-content).
