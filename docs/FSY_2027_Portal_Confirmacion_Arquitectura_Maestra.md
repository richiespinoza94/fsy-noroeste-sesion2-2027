# FSY 2027 — Portal de Confirmación de Inscripciones
## Especificación funcional, UX/UI, arquitectura técnica y reglas de implementación
### Sesión: FSY Lima Noroeste · Sesión 2 · 2027

> **Propósito de este documento**  
> Este archivo está diseñado para que cualquier agente de IA, arquitecto de software, diseñador UX/UI o equipo de desarrollo pueda comprender, replicar e implementar la aplicación sin depender del contexto previo de conversación.
>
> El sistema NO debe concebirse como una simple web para subir archivos. Debe funcionar como un **Portal de Confirmación FSY 2027 para líderes de unidad**, orientado a la autogestión, con una experiencia premium, simple, rápida y clara, especialmente en dispositivos móviles.

---

# 1. Contexto del proyecto

Para FSY 2027, cada unidad de la Iglesia (barrios o ramas) pertenecerá a una estaca y tendrá una lista de jóvenes que se han inscrito inicialmente para participar en:

**FSY Lima Noroeste · Sesión 2 · 2027**

Ejemplo:

- Estaca: Ventanilla
- Unidad: Barrio Ventanilla
- Participante: Pepito Salas

La lista inicial de inscritos por unidad será cargada **manualmente por el equipo administrador**.

A cada líder de unidad se le entregará un usuario y contraseña para ingresar al sistema.

Cuando el líder inicie sesión deberá visualizar únicamente a los jóvenes pertenecientes a su unidad.

Ejemplo:

```text
Usuario:
barrio.ventanilla

Unidad:
Barrio Ventanilla

Participantes visibles:
- Pepito Salas
- Ana Torres
- José Pérez
...
```

El usuario de una unidad no debe poder consultar participantes de otra unidad.

Esta restricción debe aplicarse en backend y base de datos, no solamente en frontend.

---

# 2. Fuente funcional: requisitos FSY 2027

El documento de referencia **INSCRIPCIONES FSY 2027.pdf** indica, entre otros elementos:

## Participantes

Los participantes deben cumplir requisitos como:

- miembros o amigos de la Iglesia;
- rango de edad correspondiente a FSY 2027;
- entrevista y aprobación de su líder del sacerdocio;
- aprobación de padres o tutores;
- disposición a cumplir las normas de conducta FSY.

## Formularios requeridos

En la última página del documento se identifican tres formularios:

1. **Formulario de inscripción**
2. **Autorización para uso de imagen**
3. **Formulario de permiso y autorización para la atención médica**

El material también señala la entrega de copias de documento de identidad.

Además, el documento indica que durante la inscripción se solicita el número de documento de identidad:

- del participante;
- del padre, madre o tutor legal.

Por ello, la arquitectura debe soportar como máximo esperado el siguiente checklist documental:

```text
1. Formulario de inscripción
2. Autorización para uso de imagen
3. Formulario de permiso y autorización médica
4. DNI participante - frente
5. DNI participante - reverso
6. DNI padre/tutor - frente
7. DNI padre/tutor - reverso
```

> IMPORTANTE:
> Si posteriormente la organización determina que el portal solo requiere el DNI del participante, debe configurarse el checklist sin necesidad de cambiar la arquitectura.

---

# 3. Objetivo del producto

La promesa de producto debe ser:

> **“Aquí están tus jóvenes. Nosotros te mostramos qué falta. Tú completas lo pendiente.”**

La aplicación debe permitir que un líder:

1. ingrese con su usuario de unidad;
2. vea todos los jóvenes inscritos a nombre de su barrio;
3. vea qué participantes tienen el expediente completo o incompleto;
4. cargue formularios y documentos de identidad;
5. reciba validación asistida por IA;
6. corrija documentos observados;
7. solicite permutas o reemplazos;
8. registre todos los datos del nuevo participante;
9. cargue la documentación del participante reemplazante;
10. vea si una inscripción está confirmada;
11. vea qué debe resolver;
12. conozca el deadline;
13. pueda comunicarse con soporte.

La experiencia ideal debe permitir que un líder sin capacitación previa pueda usar el sistema correctamente.

---

# 4. Principio UX principal

La aplicación debe responder permanentemente tres preguntas:

1. **¿Quiénes son mis jóvenes?**
2. **¿Qué le falta a cada uno?**
3. **¿Qué tengo que hacer ahora?**

La aplicación no debe exponer complejidad administrativa innecesaria.

No debe comportarse como un ERP.

No debe obligar al usuario a entender códigos internos, nomenclaturas técnicas ni procesos administrativos.

---

# 5. Arquitectura funcional

```text
FSY 2027
│
├── 1. Autenticación
│
├── 2. Inicio / Dashboard
│
├── 3. Mis jóvenes
│
├── 4. Expediente del participante
│      ├── Datos personales
│      ├── Padre/tutor
│      ├── Formularios
│      ├── DNI
│      ├── Validaciones
│      └── Historial
│
├── 5. Permutas / reemplazos
│
├── 6. Centro de ayuda
│
└── 7. Administración FSY
       ├── Sesiones
       ├── Estacas
       ├── Unidades
       ├── Usuarios
       ├── Inscritos
       ├── Documentos
       ├── Validaciones
       ├── Permutas
       ├── Soporte
       └── Auditoría
```

---

# 6. Jerarquía organizacional

La jerarquía debe modelarse explícitamente:

```text
FSY Lima Noroeste
        │
        └── Sesión 2 - 2027
                │
                ├── Estaca Ventanilla
                │      ├── Barrio Ventanilla
                │      ├── Barrio Pachacútec
                │      └── ...
                │
                ├── Estaca Puente Piedra
                │      └── ...
                │
                └── ...
```

Cada participante debe estar relacionado con:

```text
sessionId
stakeId
unitId
participantId
```

---

# 7. Concepto de cupo independiente del participante

No se debe tratar al participante como si fuera el cupo.

Debe existir una entidad separada:

```text
RegistrationSlot
```

Ejemplo:

```text
Cupo:
BVENT-017

Unidad:
Barrio Ventanilla

Sexo:
Hombre

Participante actual:
Pepito Salas
```

Si ocurre una permuta:

```text
ANTES
BVENT-017 -> Pepito Salas

DESPUÉS
BVENT-017 -> Juan Pérez
```

Esto permite conservar trazabilidad y evita sobrescribir datos históricos.

---

# 8. Estados del cupo / inscripción

Estados internos sugeridos:

```text
REGISTERED
DOCUMENTS_PENDING
DOCUMENTS_COMPLETE
UNDER_REVIEW
OBSERVED
CONFIRMED
REPLACEMENT_REQUESTED
REPLACED
CANCELLED
```

El frontend debe traducirlos a lenguaje humano.

Estados visibles recomendados:

```text
Requiere completar
Enviado
En revisión
Requiere corrección
Confirmado
```

Nunca mostrar al líder:

```text
Estado 4
Pending L2
OCR_REJECTED
ValidationCode 23
```

---

# 9. Autenticación

## Modelo inicial

Cada unidad recibe una cuenta:

```text
usuario:
barrio.ventanilla

contraseña:
temporal
```

Primer acceso:

```text
Contraseña temporal
       ↓
Crear contraseña nueva
```

Registrar:

```text
last_login_at
last_login_ip
device
user_agent
```

## Evolución recomendada

La arquitectura debe permitir en el futuro:

```text
Agregar otro líder autorizado
```

sin compartir la misma contraseña.

---

# 10. Roles

```text
SUPER_ADMIN
SESSION_ADMIN
STAKE_COORDINATOR
UNIT_LEADER
REVIEWER
SUPPORT
```

## UNIT_LEADER

Debe estar restringido a:

```text
unit_id = usuario.unit_id
```

Puede:

- ver participantes de su unidad;
- completar datos autorizados;
- cargar documentos;
- reemplazar archivos observados;
- solicitar permutas;
- abrir tickets de soporte.

No puede:

- consultar otras unidades;
- aprobar expedientes;
- modificar reglas de sesión;
- eliminar auditoría.

---

# 11. Dashboard principal del líder

La pantalla debe priorizar tareas, no gráficos.

Ejemplo:

```text
Hola, Barrio Ventanilla

FSY Lima Noroeste · Sesión 2 · 2027

Faltan 18 días para cerrar expedientes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tus participantes
24 jóvenes

✓ 15 Confirmados
!  6 Requieren atención
○  3 En revisión

─────────────────────────────

Necesitan tu atención

⚠ Pepito Salas
   Falta autorización médica
   Falta DNI reverso

   [ Completar expediente ]

⚠ Ana Torres
   Formulario observado

   [ Corregir ]

─────────────────────────────

[ Ver los 24 participantes ]
```

Regla:

> Problemas primero. Estadísticas después.

---

# 12. Deadline

No mostrar únicamente una fecha.

Debe existir comunicación contextual:

```text
18
días

para completar tus expedientes

12 julio 2027
```

Cuando falte poco:

```text
7 días restantes
```

Luego:

```text
⚠ Faltan 48 horas
```

El dashboard debe correlacionar deadline con pendientes:

```text
Faltan 48 horas
6 jóvenes todavía requieren acción
```

---

# 13. Pantalla “Mis jóvenes”

## Desktop

Puede utilizar tabla:

| Participante | Sexo | Documentos | Estado | Acción |
|---|---|---:|---|---|
| Pepito Salas | Hombre | 5/7 | Requiere completar | Revisar |
| Ana Torres | Mujer | 7/7 | En revisión | Ver |
| José Pérez | Hombre | 7/7 | Confirmado | Ver |

## Mobile

No comprimir una tabla.

Usar cards:

```text
Pepito Salas
17 años · Hombre

Documentos
████████░░ 5 de 7

⚠ Requiere completar

Faltan 2 documentos

[ Continuar ]
```

---

# 14. Expediente del participante

Ejemplo:

```text
‹ Participantes

Pepito Salas

⚠ Expediente incompleto

5 de 7 documentos completos
██████████████░░░░

DATOS
✓ Datos personales

DOCUMENTOS
✓ Formulario de inscripción
✓ Autorización de imagen
! Autorización médica

IDENTIFICACIÓN
✓ DNI participante · Frente
! DNI participante · Reverso

[ Continuar completando ]
```

No mostrar siete cargadores de archivos simultáneamente.

El sistema debe guiar una tarea a la vez.

---

# 15. Checklist documental configurable

Tipos documentales sugeridos:

```text
REGISTRATION_FORM
IMAGE_AUTHORIZATION
MEDICAL_AUTHORIZATION
PARTICIPANT_DNI_FRONT
PARTICIPANT_DNI_BACK
GUARDIAN_DNI_FRONT
GUARDIAN_DNI_BACK
```

La obligatoriedad debe configurarse por sesión.

Ejemplo:

```json
{
  "documentType": "GUARDIAN_DNI_BACK",
  "required": true
}
```

---

# 16. Experiencia de carga documental

## Paso 1

Mostrar nombre del documento:

```text
Autorización para atención médica
```

## Paso 2

Opciones:

```text
¿Cómo deseas agregarlo?

[ Tomar una foto ]
[ Elegir desde el teléfono ]
[ Subir PDF ]
```

## Paso 3

Feedback inmediato:

```text
Archivo recibido
```

## Paso 4

Procesamiento:

```text
Analizando documento…
```

## Paso 5

Resultado:

```text
✓ Documento legible
✓ Corresponde al formato esperado
✓ Nombre identificado
✓ Firma detectada
✓ Todas las páginas presentes

Documento listo

[ Guardar y continuar ]
```

---

# 17. Error documental bien diseñado

Nunca:

```text
OCR Error 0.63
```

Mostrar:

```text
Necesitamos una nueva foto

La esquina inferior derecha
del documento quedó fuera de la imagen.

Consejo:
colócalo sobre una superficie plana
y asegúrate de mostrar las 4 esquinas.

[ Tomar otra foto ]
```

La IA debe explicar el problema en lenguaje humano.

---

# 18. Validación con IA

La IA debe actuar como **copiloto documental**.

No debe tener autoridad absoluta para confirmar una inscripción.

Pipeline:

```text
Archivo
 ↓
Seguridad
 ↓
Tipo de documento
 ↓
Calidad de imagen
 ↓
Extracción
 ↓
Validaciones automáticas
 ↓
Score de confianza
 ↓
Motor de reglas
 ↓
Revisión humana cuando corresponda
```

---

# 19. Validaciones IA

## Calidad

- desenfoque;
- baja resolución;
- documento cortado;
- iluminación deficiente;
- reflejos;
- página faltante;
- orientación incorrecta.

## Clasificación

Identificar:

```text
Formulario de inscripción
Autorización de imagen
Autorización médica
DNI frente
DNI reverso
```

## Extracción

Cuando corresponda:

- nombres;
- apellidos;
- DNI;
- fechas;
- firmas;
- padre/tutor;
- campos obligatorios.

## Consistencia

Ejemplo:

```text
Participante registrado:
Pepito Salas

Documento:
Pepito Carlos Salas Ramos
```

Resultado:

```text
Revisar coincidencia del nombre
```

No rechazar automáticamente.

---

# 20. Bandas de confianza IA

Referencia inicial:

```text
>= 95 %
Validación automática posible

80 - 94 %
Validación automática + posible revisión

< 80 %
Revisión humana
```

Determinadas reglas críticas deben poder exigir revisión humana independientemente de la confianza IA.

Especialmente:

- identidad;
- firmas;
- consentimiento;
- información médica.

---

# 21. DNI

Componente específico:

```text
Documento de identidad

Frente
✓ Listo

Reverso
○ Pendiente
```

Captura mobile:

```text
┌──────────────────────────┐
│                          │
│      ┌────────────┐      │
│      │            │      │
│      │    DNI     │      │
│      │            │      │
│      └────────────┘      │
│                          │
│ Centra el documento      │
│ dentro del marco         │
└──────────────────────────┘
```

Comprimir imagen en cliente antes del upload.

No enviar fotografías de cámara de 8-20 MB sin necesidad.

---

# 22. Permutas / reemplazos

Una permuta nunca debe sobrescribir al participante saliente.

Debe crearse una entidad:

```text
replacement_request
```

Ejemplo:

```text
Permuta #PM-000123

Participante saliente:
Pepito Salas

Participante entrante:
Juan Pérez
```

---

# 23. Flujo de permuta

## Paso 1

Desde participante:

```text
···
Solicitar reemplazo
```

## Paso 2

Mostrar participante saliente:

```text
Pepito Salas
Hombre · 17 años
```

## Paso 3

Explicar regla:

```text
El nuevo participante deberá cumplir
los requisitos establecidos y ser del mismo sexo.
```

## Paso 4

Formulario completo del participante entrante.

Debe reutilizar el mismo modelo de datos de la inscripción original.

Campos exactos deben definirse cuando se disponga del formulario oficial completo.

## Paso 5

Completar documentos del entrante.

## Paso 6

Revisión:

```text
Pepito Salas
       ↓
Juan Pérez

✓ Ambos: Hombre

[ Solicitar permuta ]
```

## Paso 7

Resultado:

```text
Solicitud enviada

PM-000123

Revisaremos el cambio.
```

---

# 24. Regla crítica de permuta

La igualdad de sexo debe comprobarse server-side.

Ejemplo:

```text
outgoing.sex == incoming.sex
```

Si no:

```text
PERMUTA_NOT_ALLOWED
```

No confiar únicamente en validación frontend.

---

# 25. Reutilización de componentes — principio Ponytail

No desarrollar dos sistemas separados para:

- participante original;
- participante entrante por permuta.

Reutilizar:

```text
ParticipantForm
GuardianForm
DocumentUploader
DniUploader
ParticipantChecklist
ValidationEngine
ValidationResult
DocumentStatus
ParticipantStatus
DeadlineBanner
```

Arquitectura:

```text
ParticipantEnrollment
       ↑
       │
 ┌─────┴──────────┐
 │                │
Initial        Replacement
Enrollment     Enrollment
```

Esto reduce:

- duplicación;
- deuda técnica;
- divergencia funcional;
- bugs;
- costos de QA.

---

# 26. Panel administrativo

Dashboard:

```text
FSY Lima Noroeste · Sesión 2

1,248 participantes

982 Confirmados
142 En revisión
89 Incompletos
35 Observados
```

Drill-down:

```text
Sesión
 ↓
Estaca
 ↓
Unidad
 ↓
Participante
 ↓
Documento
```

Ejemplo:

| Unidad | Confirmados | Pendientes |
|---|---:|---:|
| Barrio Ventanilla | 89% | 11% |
| Barrio Pachacútec | 92% | 8% |

---

# 27. Bandeja de revisión

No obligar al equipo FSY a buscar documentos uno por uno.

Crear:

```text
Requieren revisión
18 documentos

[ Más antiguos primero ]
```

Detalle:

```text
Pepito Salas
Barrio Ventanilla

Autorización médica

[ Vista del documento ]

IA
✓ Nombre coincide
✓ Firma detectada
⚠ Fecha poco legible

[ Aprobar ]

[ Solicitar corrección ]
```

---

# 28. Observaciones estructuradas

Opciones:

```text
Documento ilegible
Documento incompleto
Falta firma
Datos no coinciden
Documento incorrecto
Otro
```

Permitir comentario libre solo cuando sea necesario.

Esto mantiene mensajes consistentes.

---

# 29. Centro de soporte

Debe estar visible desde toda la aplicación.

Ejemplo:

```text
? Ayuda
```

Formulario:

```text
¿Cómo podemos ayudarte?

○ Problemas con documentos
○ Permutas
○ Datos incorrectos
○ No puedo ingresar
○ Otro

Describe brevemente lo sucedido

[ Adjuntar captura ]

[ Enviar solicitud ]
```

Adjuntar automáticamente contexto técnico:

```text
userId
unitId
sessionId
participantId
route
browser
device
timestamp
```

---

# 30. Navegación mobile

Máximo recomendado:

```text
Inicio
Jóvenes
Ayuda
Cuenta
```

Ejemplo:

```text
Inicio    Jóvenes    Ayuda    Cuenta
  ⌂         ♙          ?       ○
```

Las permutas viven dentro del expediente del joven.

Evitar un menú con demasiadas secciones.

---

# 31. Navegación desktop

```text
┌────────────┬─────────────────────────────────┐
│ FSY 2027   │                                 │
│            │ Hola, Barrio Ventanilla          │
│ Inicio     │                                 │
│ Jóvenes    │                                 │
│ Ayuda      │           contenido              │
│            │                                 │
│────────────│                                 │
│ Cuenta     │                                 │
└────────────┴─────────────────────────────────┘
```

Sidebar discreta.

El contenido debe ser protagonista.

---

# 32. Diseño premium — inspiración Apple

La aplicación debe sentirse:

- limpia;
- silenciosa;
- rápida;
- predecible;
- con mucha jerarquía visual;
- sin ruido;
- con feedback inmediato.

Usar:

- mucho espacio en blanco;
- tipografía fuerte;
- bloques simples;
- microinteracciones discretas;
- controles táctiles grandes;
- bottom sheets;
- skeleton loading;
- transiciones de 150-250 ms;
- copy humano.

Evitar:

- glassmorphism excesivo;
- sombras fuertes;
- tarjetas dentro de tarjetas;
- contornos innecesarios;
- gradientes decorativos excesivos;
- dashboards llenos de gráficos;
- iconos puramente decorativos;
- confeti infantil.

---

# 33. Diseño responsive

Debe funcionar correctamente en:

- iPhone;
- Android;
- iPad;
- tablets Android;
- laptop;
- desktop.

Mobile-first.

Tamaños táctiles:

```text
mínimo recomendado:
44 x 44 px
```

Breakpoints deben definirse por necesidad de contenido y no solamente por dispositivos nominales.

---

# 34. Tipografía

Preferencia:

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Inter,
  system-ui,
  sans-serif;
```

Priorizar system fonts para velocidad.

---

# 35. Paleta FSY 2027

Fuente de diseño: `FSY_2027_Paleta_y_Reglas_de_Color.md`.

## Tokens principales

```css
:root {
  --fsy-navy: #002F50;
  --fsy-deep-blue: #003E62;
  --fsy-blue: #005581;
  --fsy-sky: #C4E6EE;
  --fsy-green: #9BC784;
  --fsy-sunrise: #F5B547;
  --fsy-white: #F5F7F7;
  --fsy-graphite: #26343C;

  --fsy-info: #00A9B7;
  --fsy-community: #70AD47;
  --fsy-creative: #E85D75;
  --fsy-event: #F28C28;
  --fsy-alert: #8B1538;
}
```

## Uso dentro de la app

```text
Background:
#F5F7F7

Primary:
#003E62

Secondary / navigation:
#005581

CTA:
#F5B547

Success:
#70AD47

Info:
#C4E6EE

Text:
#26343C
```

No usar el amarillo como color dominante permanente.

Utilizarlo para:

- deadlines;
- prioridades;
- CTA;
- información importante.

---

# 36. Arquitectura técnica recomendada

## Tipo de producto

Primera versión:

```text
Responsive Web App + PWA
```

No construir inicialmente:

```text
App iOS nativa
+
App Android nativa
```

La PWA permite:

- funcionamiento web;
- uso móvil;
- instalación en home screen;
- un solo código base;
- menor complejidad de mantenimiento.

---

# 37. Stack sugerido

## Frontend

```text
React
TypeScript
Vite
TanStack Query
React Hook Form
Zod
```

## UI

```text
Tailwind CSS
Radix UI / shadcn como primitivas
componentes propios
Framer Motion limitado
```

## Backend

```text
Supabase
PostgreSQL
Supabase Auth
Supabase Storage
Edge Functions
```

## IA

```text
OCR / Vision API
+
motor de reglas propio
```

## Observabilidad

```text
Sentry
PostHog
```

---

# 38. Arquitectura lógica

```text
             ┌──────────────┐
             │   Web / PWA  │
             └──────┬───────┘
                    │
                 HTTPS
                    │
       ┌────────────▼────────────┐
       │   Application Layer     │
       ├─────────────────────────┤
       │ Auth                    │
       │ Participants            │
       │ Documents               │
       │ Replacements            │
       │ Support                 │
       │ Notifications           │
       └──────┬──────────┬───────┘
              │          │
      ┌───────▼───┐  ┌──▼────────────┐
      │ PostgreSQL│  │ Object Storage│
      └───────────┘  └──────┬────────┘
                             │
                       ┌─────▼─────┐
                       │ AI Worker │
                       └─────┬─────┘
                             │
                       Validation
```

---

# 39. Procesamiento asíncrono

No bloquear upload esperando IA.

Incorrecto:

```text
Upload
→ IA
→ esperar 8 segundos
→ respuesta
```

Correcto:

```text
Upload
↓
Storage
↓
Respuesta inmediata:
"Archivo recibido"

       ↓ async

IA
↓
Validación
↓
actualización de estado
```

---

# 40. Modelo de datos preliminar

Tablas sugeridas:

```text
sessions
stakes
units
users

participants
registration_slots

participant_guardians
participant_contacts

documents
document_versions
document_validations

replacement_requests

support_tickets
notifications
audit_logs
```

Relación:

```text
Session
  └─ Stake
      └─ Unit
          └─ RegistrationSlot
                 └─ Participant
                      ├─ Guardian
                      ├─ Documents
                      └─ Validations
```

---

# 41. Tabla participants

Campos conceptuales:

```text
id
session_id
stake_id
unit_id

first_name
middle_name
last_name
second_last_name

preferred_name

birth_date
sex

document_type
document_number

phone
email

registration_source

status

created_at
updated_at
```

Los campos finales deben ajustarse al formulario oficial.

---

# 42. Tabla registration_slots

```text
id
session_id
stake_id
unit_id

slot_code
sex

current_participant_id

status

created_at
updated_at
```

---

# 43. Guardian

```text
participant_guardians

id
participant_id

relationship
first_name
last_name

document_type
document_number

phone
email

created_at
updated_at
```

---

# 44. Documents

No utilizar columnas independientes como:

```text
dni_front_url
dni_back_url
medical_form_url
image_form_url
```

Usar modelo normalizado:

```text
documents

id
participant_id
document_type
current_version_id
status
created_at
updated_at
```

---

# 45. Versionado documental

```text
document_versions

id
document_id
version_number
storage_path
mime_type
file_size
uploaded_by
uploaded_at
status
```

Ejemplo:

```text
Versión 1
OBSERVED

Versión 2
UNDER_REVIEW

Versión 3
APPROVED
```

Nunca eliminar silenciosamente el historial.

---

# 46. Validación documental

```text
document_validations

id
document_version_id

validation_type
validation_status
confidence_score

detected_document_type
extracted_data_json

issues_json

review_required

created_at
```

---

# 47. Permutas

```text
replacement_requests

id

slot_id

outgoing_participant_id
incoming_participant_id

requested_by
requested_at

status

reviewed_by
reviewed_at

reason

created_at
updated_at
```

Estados:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
APPROVED
REJECTED
CANCELLED
```

---

# 48. Auditoría

Tabla:

```text
audit_logs
```

Registrar:

```text
user_id
action
entity_type
entity_id
before_json
after_json
ip
user_agent
created_at
```

Acciones relevantes:

```text
LOGIN
UPLOAD_DOCUMENT
REPLACE_DOCUMENT
SUBMIT_PARTICIPANT
REQUEST_REPLACEMENT
APPROVE_DOCUMENT
OBSERVE_DOCUMENT
CONFIRM_PARTICIPANT
```

---

# 49. Seguridad

El sistema manejará datos de menores, documentos de identidad y potencialmente información médica.

Debe considerarse un requerimiento central.

## Obligatorio

- HTTPS;
- cifrado en reposo;
- buckets privados;
- URLs firmadas temporales;
- Row Level Security;
- rate limiting;
- password hashing;
- protección brute-force;
- control de MIME;
- límites de tamaño;
- malware scanning cuando sea posible;
- auditoría;
- control de roles;
- expiración de sesiones.

Nunca:

```text
/public/dni/pepito.jpg
```

---

# 50. Visualización segura de DNI

En listas:

```text
DNI ••••••42
```

No mostrar el número completo salvo que el rol y contexto lo justifiquen.

---

# 51. Row Level Security

Ejemplo conceptual:

```text
UNIT_LEADER:
participant.unit_id == auth.user.unit_id
```

El backend debe negar el acceso aunque el usuario intente consultar directamente otro ID.

---

# 52. Performance

Objetivos recomendados:

```text
LCP:
< 2 segundos en 4G razonable

Feedback visual:
< 100 ms

Cambio de vista:
percepción instantánea

Feedback de upload:
< 300 ms
```

Técnicas:

```text
route code splitting
lazy loading
query caching
prefetch
image compression
direct-to-storage uploads
background processing
optimistic UI
skeleton loading
pagination
virtualización cuando sea necesario
```

---

# 53. Regla de carga de datos

No cargar expedientes completos al entrar al dashboard.

Dashboard obtiene solamente un resumen:

```json
{
  "total": 24,
  "confirmed": 15,
  "pending": 6,
  "underReview": 3
}
```

Cargar expediente detallado bajo demanda.

---

# 54. Optimización de imágenes

Antes de upload:

- redimensionar si excede resolución razonable;
- comprimir JPEG/WebP;
- conservar legibilidad;
- no destruir datos OCR;
- usar carga directa a storage;
- mostrar preview local.

---

# 55. Notificaciones

Eventos:

```text
DOCUMENT_OBSERVED
DOCUMENT_APPROVED
PARTICIPANT_CONFIRMED
REPLACEMENT_APPROVED
REPLACEMENT_REJECTED
DEADLINE_APPROACHING
SUPPORT_RESPONSE
```

Canales futuros:

```text
in-app
email
WhatsApp
push PWA
```

---

# 56. Confirmación de inscripción

Después de completar:

```text
✓

Expediente enviado

Pepito Salas

Ya recibimos toda la información.
Ahora será revisada por el equipo FSY.
```

Después de aprobación:

```text
✓

Inscripción confirmada

Pepito Salas está listo para
FSY Lima Noroeste · Sesión 2 · 2027
```

Usar microanimación elegante.

No confeti infantil.

---

# 57. Flujo completo

```text
                    IMPORTACIÓN MANUAL
                           │
                           ▼
                  JÓVENES REGISTRADOS
                           │
                           ▼
                    PORTAL DE UNIDAD
                           │
               ┌───────────┴───────────┐
               │                       │
         PARTICIPARÁ                NO IRÁ
               │                       │
               ▼                       ▼
        COMPLETAR DOCS              PERMUTA
               │                       │
               │                 NUEVO JOVEN
               │                       │
               └───────────┬───────────┘
                           ▼
                    VALIDACIÓN IA
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
          OK         REVISIÓN HUMANA   ERROR
            │              │              │
            │              ▼              │
            │             OK              │
            │              │              │
            └──────────────┼──────────────┘
                           ▼
                       ENVIADO
                           │
                           ▼
                    REVISIÓN FSY
                           │
               ┌───────────┴──────────┐
               │                      │
               ▼                      ▼
           OBSERVADO             CONFIRMADO
               │
               ▼
            CORREGIR
               │
               └─────────────► REVISIÓN
```

---

# 58. Diferencia entre el PDF y la solución digital

El material FSY de referencia señala que los formularios se entregan físicamente.

Por tanto, la organización deberá definir uno de estos modelos:

## Modelo A — Prevalidación digital

```text
Carga digital
→ validación
→ original físico sigue siendo obligatorio
```

## Modelo B — Evidencia digital oficial

```text
Carga digital
→ documento almacenado
→ evidencia oficial
```

La arquitectura soporta ambos.

Pero esta decisión debe definirse antes de producción porque afecta:

- textos legales;
- conservación documental;
- consentimiento;
- auditoría;
- retención;
- almacenamiento.

---

# 59. Estrategia MVP

## MVP 1 — Operación base

```text
Login
Usuarios de unidad
Importación manual
Dashboard
Lista de jóvenes
Expediente
Carga de documentos
Estados
Panel administrativo
Confirmación
```

## MVP 2 — IA

```text
OCR
clasificación
calidad
extracción
validaciones
observaciones
```

## MVP 3 — Permutas

```text
Solicitud
nuevo participante
regla mismo sexo
documentos
aprobación
historial
```

## MVP 4 — Operación avanzada

```text
soporte
notificaciones
analytics
PWA
push
delegados
```

---

# 60. QA obligatorio

Cada entrega debe revisar regresión transversal.

## Autenticación

```text
[ ] Login válido
[ ] Login inválido
[ ] Sesión expirada
[ ] Cambio de contraseña inicial
[ ] Usuario de unidad no accede a otra unidad
```

## Participantes

```text
[ ] Lista correcta por unidad
[ ] Conteos coinciden
[ ] Filtros no pierden resultados
[ ] Estados visibles correctos
```

## Documentos

```text
[ ] Foto cámara
[ ] Galería
[ ] PDF
[ ] archivo grande
[ ] MIME inválido
[ ] reemplazo de archivo
[ ] versionado
[ ] observación
[ ] aprobación
```

## IA

```text
[ ] documento correcto
[ ] documento incorrecto
[ ] foto borrosa
[ ] documento cortado
[ ] baja confianza
[ ] error proveedor IA
[ ] timeout
[ ] reintento
```

## Permutas

```text
[ ] mismo sexo permitido
[ ] sexo distinto rechazado
[ ] participante saliente preservado
[ ] entrante creado correctamente
[ ] cupo reasignado
[ ] historial conservado
```

## Mobile

```text
[ ] iPhone pequeño
[ ] iPhone grande
[ ] Android pequeño
[ ] Android grande
[ ] landscape
[ ] teclado no tapa CTA
[ ] camera capture
```

## Desktop

```text
[ ] 1366x768
[ ] 1440x900
[ ] 1920x1080
```

---

# 61. Criterios de aceptación UX

El sistema debe lograr:

```text
Un líder nuevo:
1. inicia sesión;
2. entiende el dashboard;
3. identifica un pendiente;
4. abre al participante;
5. carga un documento;
6. entiende el resultado;
7. vuelve al dashboard;
```

sin manual de usuario.

Métrica conceptual:

> **Cero capacitación requerida para completar un expediente.**

---

# 62. Métricas de producto

Registrar:

```text
% participantes confirmados
% expedientes pendientes
% expedientes observados
tiempo medio hasta confirmar
documentos observados por tipo
promedio de reintentos por documento
tasa de éxito IA
tasa de revisión humana
permutas solicitadas
permutas aprobadas
tickets de soporte
tiempo de resolución
```

UX:

```text
time_to_first_action
upload_success_rate
form_completion_rate
drop_off_rate
```

---

# 63. Principios de implementación

Todo agente IA o desarrollador que trabaje en el proyecto debe respetar:

## 1. No romper lo existente

Antes de cambiar componentes compartidos, revisar impacto.

## 2. Reutilizar

Priorizar componentes comunes.

## 3. Mobile-first

Diseñar primero la experiencia táctil.

## 4. Server-side validation

Toda regla de negocio crítica también debe ejecutarse en backend.

## 5. Seguridad por defecto

Los documentos son privados.

## 6. Asincronía

No bloquear UI esperando OCR/IA.

## 7. Trazabilidad

No borrar historia de forma destructiva.

## 8. Copys humanos

El líder nunca debería interpretar códigos técnicos.

---

# 64. Prohibiciones de arquitectura

No:

```text
- almacenar documentos en bucket público;
- autorizar por frontend solamente;
- sobrescribir participantes en una permuta;
- borrar versiones observadas;
- duplicar formulario para permutas;
- duplicar uploader;
- enviar toda la base al cliente;
- depender de IA para decisiones críticas;
- bloquear el navegador esperando OCR;
- usar tablas desktop comprimidas en mobile;
```

---

# 65. Definición de éxito

La aplicación será exitosa si un obispo o líder puede abrirla desde su iPhone y ver:

```text
6 jóvenes necesitan atención
```

tocar uno:

```text
Pepito Salas
Faltan 2 documentos
```

subirlos:

```text
Archivo recibido
```

corregir lo necesario:

```text
Documento listo
```

y regresar al inicio para ver:

```text
5 jóvenes necesitan atención
```

sin capacitación previa.

---

# 66. Resumen de arquitectura

El centro del producto es:

```text
Participante
   ↓
Checklist
   ↓
Próxima acción
   ↓
Validación
   ↓
Confirmación
```

No:

```text
Archivo
↓
Carpeta
↓
Archivo
↓
Estado técnico
```

La experiencia debe orientarse al progreso de personas, no a gestión de archivos.

---

# 67. Fuentes del proyecto

## Fuente funcional

**INSCRIPCIONES FSY 2027.pdf**

Páginas relevantes:

- página 5: requisitos participantes;
- página 6: personas que pueden inscribir y documentos de identidad;
- página 7: formularios para participantes.

## Fuente de diseño

**FSY_2027_Paleta_y_Reglas_de_Color.md**

Colores principales:

```text
#003E62 Azul FSY Profundo
#005581 Azul FSY
#F5B547 Amanecer
#C4E6EE Luz Celeste
#9BC784 Verde Camino
#F5F7F7 Blanco Niebla
#26343C Grafito
```

---

# 68. Instrucción maestra para agentes IA

Cuando cualquier agente IA continúe este proyecto debe asumir:

> Se está desarrollando un Portal de Confirmación FSY 2027 para líderes de unidad. La lista inicial de participantes es cargada por administradores. Cada líder solo puede ver su unidad. El líder debe completar documentos, corregir observaciones, gestionar permutas y visualizar el estado de confirmación. El sistema debe validar documentos con IA como asistente, pero conservar revisión humana en decisiones críticas. Debe ser mobile-first, responsive, PWA, rápido, seguro y visualmente premium, inspirado en los principios de experiencia de Apple. Se debe reutilizar lógica compartida, realizar análisis de impacto antes de modificarla y aplicar QA de regresión transversal. La arquitectura debe priorizar Participante → Checklist → Próxima acción → Confirmación, evitando complejidad administrativa para el usuario final.

---

# 69. Próximos documentos recomendados

Después de esta arquitectura, se recomienda producir:

```text
01_DATA_MODEL.md
02_USER_FLOWS.md
03_INFORMATION_ARCHITECTURE.md
04_UI_DESIGN_SYSTEM.md
05_DATABASE_SCHEMA.sql
06_RLS_SECURITY_POLICIES.md
07_API_CONTRACTS.md
08_AI_DOCUMENT_VALIDATION.md
09_PERMUTATION_ENGINE.md
10_ADMIN_PORTAL.md
11_QA_TEST_PLAN.md
12_DEPLOYMENT_ARCHITECTURE.md
```

Estos documentos deben derivarse de esta especificación y no redefinir sus principios sin análisis de impacto.

---

**Documento base del proyecto**  
FSY Lima Noroeste · Sesión 2 · 2027
