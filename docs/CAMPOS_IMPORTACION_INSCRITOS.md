# Campos de importación de inscritos

Fuente: `D:/Descargas/Home (1).pdf`, formulario «Perú Lima Noroeste sesión 2 2027», seis páginas, revisado visualmente el 17/09/2026. Esta es la estructura propuesta para el futuro CSV, no una importación ejecutada.

La interfaz usará **Estaca** y **Barrio**, según lo solicitado. Se conservarán también los valores de distrito, misión o rama que traiga el formulario. Los barrios se identificarán dentro de su estaca y sesión; nombres de barrio iguales en estacas distintas no se fusionarán.

## Diccionario de los 28 campos

«Sí» en obligatorio indica el asterisco del formulario. No determina todavía el rechazo de una fila importada: la vista previa deberá señalar los faltantes sin inventar respuestas.

| Columna propuesta | Etiqueta del formulario | Página | Obligatorio | Formato y conservación |
| --- | --- | --- | --- | --- |
| Estaca | Estaca / Distrito / Misión | 2 | Sí | Texto completo |
| Barrio | Barrio / Rama | 2 | Sí | Texto completo |
| Nombre de pila | Nombre de pila | 1 | Sí | Conservar nombres compuestos sin dividirlos automáticamente |
| Apellido | Apellido | 1 | Sí | Conservar apellidos completos sin dividirlos automáticamente |
| Nombre preferido | Nombre que se prefiere | 1 | Sí | Texto |
| Fecha de nacimiento | Cumpleaños | 1 | Sí | AAAA-MM-DD; formato distinto requiere mapeo explícito |
| Sexo | Sexo | 1 | Sí | Hombre / Mujer |
| Tipo de solicitud | Tipo de solicitud | 1 | Sí | Participante / Consejero |
| Teléfono | Número de teléfono | 1 | Sí | Texto, conservar prefijo y ceros |
| Correo electrónico | Correo electrónico | 1 | Sí | Texto |
| Contacto emergencia 1 nombre | Contacto de emergencia 1: Nombre | 2 | Sí | Texto completo |
| Contacto emergencia 1 correo | Contacto de emergencia 1: Correo electrónico | 2 | Sí | Texto |
| Contacto emergencia 1 teléfono | Contacto de emergencia 1: Número de teléfono | 2 | Sí | Texto |
| Contacto emergencia 2 nombre | Contacto de emergencia 2: Nombre | 2 | Sí | Texto completo |
| Contacto emergencia 2 correo | Contacto de emergencia 2: Correo electrónico | 2 | Sí | Texto |
| Contacto emergencia 2 teléfono | Contacto de emergencia 2: Número de teléfono | 2 | Sí | Texto |
| Obispo | Obispo | 2 | Sí | Texto completo |
| Información médica | Información médica | 3 | Sí | Respuesta completa, incluidos saltos de línea |
| Información alimentaria | Información alimentaria | 3 | No | Respuesta completa |
| Talla de camiseta | Talla de camiseta | 3 | Sí | XS / S / M / L / XL / 2XL / 3XL; todas unisex |
| Grupo sanguíneo y RH | Grupo sanguíneo y factor (RH) | 3 | Sí | Respuesta original; no deducir grupo ni factor |
| Alergias | ¿Sufres de algún tipo de alergia? Por favor descríbelas | 3 | Sí | Respuesta y descripción completas; vacío no equivale a «No» |
| Tratamiento médico | ¿Recibes algún tipo de tratamiento médico? Por favor descríbelo | 3 | Sí | Respuesta y descripción completas |
| Diabetes o asma | ¿Eres diabético o asmático? Por favor especifica | 3 | Sí | Respuesta completa; no reducir a un único sí/no |
| Seguro médico | ¿Con qué seguro médico cuentas? | 3 | Sí | Conservar compañía y número de póliza si se proporcionan |
| Acepta condiciones y conducta | Acepto las Condiciones y las normas de conducta en las actividades de la Iglesia | 6 | Sin asterisco | Sí / No / vacío según la fuente; nunca asumir aceptación |
| Nombre del firmante | Tu nombre | 6 | Sin asterisco | Texto; no asumir que corresponde al participante o tutor |
| Referencia de firma | Tu firma | 6 | Sin asterisco | Referencia privada al documento o archivo firmado; CSV no contiene una firma manuscrita |

## Interpretaciones que deben conservarse

- La página 4 contiene el texto de condiciones; la única casilla de aceptación visible está en la página 6. No crear una segunda aceptación como si se hubiera respondido por separado.
- Los contactos de emergencia no se convertirán automáticamente en padres o tutores legales.
- El formulario no pide DNI, número de inscripción ni parentesco. No inventar esos valores ni hacer del DNI un requisito de esta fuente. Si el futuro CSV aporta columnas adicionales, conservarlas y mapearlas sin descartarlas.
- El tipo «Consejero» no equivale a participante juvenil, no asigna un cupo juvenil ni concede un rol de acceso al portal. Debe distinguirse en la vista previa.
- Las páginas 1 y 4 contienen rangos de nacimiento y condiciones que mencionan líderes adultos. Son contenido del formulario; no se adoptarán automáticamente como nuevas reglas de elegibilidad ni como autorización de envío a Gemini.
- Una firma o casilla importada no equivale a una aprobación documental del portal.

## Implementación · 17/09/2026

Implementado en Operación → Carga inicial: plantilla descargable de 28 columnas, CSV UTF-8 con comas o punto y coma, vista previa expandible, hasta 500 filas y 2 MB. Reconoce los encabezados de esta propuesta y los alias básicos del formulario. Columnas adicionales se conservan. No incluye aún un editor visual para mapear encabezados arbitrarios.

La RPC `import_registration_csv` crea estacas, barrios, participantes y sus cupos en una transacción. La tabla `registration_forms` conserva todas las respuestas de cada fila, incluidas las médicas, con lectura restringida a administración y escritura únicamente por la RPC. No se crean tutores a partir de contactos de emergencia. Los registros de consejeros bloquean la carga para separarlos del listado juvenil.

La migración se aplicó en Supabase y se verificaron RLS y permisos. Pruebas locales cubren conservación de campos adicionales y respuestas multilínea, reintentos sin duplicación, coincidencias bloqueadas, reversión integral y denegación a líderes. Build y QA completos pasan; vista previa comprobada en navegador a 375 y 1440 px sin desbordamiento horizontal. No se han importado personas reales; sigue pendiente la prueba autenticada con el CSV real y una sesión configurada.

La importación detecta filas repetidas y posibles coincidencias por nombres, apellidos y fecha de nacimiento. No fusiona ni sobrescribe personas automáticamente: una coincidencia distinta bloquea toda la carga para revisión. Reintentar una fila exactamente idéntica omite esa fila. Cuando el exportador entregue un identificador estable, se podrá usar para reconocer actualizaciones posteriores.

La estructura final se ajustará a los encabezados del CSV real. Las fechas siguen pendientes de configuración y publicación: cierre previsto 17/01/2027 e inicio 18/01/2027, según indicación del usuario.
