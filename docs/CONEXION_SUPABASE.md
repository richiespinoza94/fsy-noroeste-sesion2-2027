# Conexión Supabase · 16/09/2026

Proyecto: FSY-LimaNoroeste-Sesion2-Lideres y Padres (`dshunrsnkkioxpdazaxx`).
URL API: https://dshunrsnkkioxpdazaxx.supabase.co

## Aplicado y verificado

- Base inicialmente vacía, sin usuarios ni buckets.
- Migraciones locales 001–005 instaladas juntas mediante MCP: versión remota 20260916182732, nombre fsy_mvp3_initial_schema.
- Corrección acotada de permisos de las tres RPC internas de IA: versión remota 20260916183121, nombre explicit_api_permissions. Archivo local generado por CLI: 20260916182955_explicit_api_permissions.sql.
- Configuración del frontend en .env.local, con clave publicable. Archivo ignorado por Git; ninguna clave de servicio en el navegador.
- Auth respondió 200. Consulta REST anónima de participantes devolvió lista vacía. Las tres RPC internas rechazaron al cliente anónimo con 401. SQL confirmó que claim/finish mantienen EXECUTE para service_role.
- Bucket documental privado y controles de esquema verificados. Las pruebas locales reproducen ahora los permisos directos predeterminados de funciones de Supabase.

El historial remoto usa un paquete inicial. No ejecutar db push ciegamente sobre este proyecto con 001–005: antes de adoptar CLI para despliegues, reconciliar ese historial con los archivos locales. No volver a ejecutar las migraciones ya aplicadas.

## Pendiente para operación

- La cuenta administradora elegida ya existe y fue confirmada. El 17/09/2026 se asignó SUPER_ADMIN en profiles y app_metadata exclusivamente a la cuenta de correo confirmada por el usuario. No se creó ni modificó su contraseña.
- Importar los participantes previamente inscritos desde el CSV del formulario, conservando todos los campos de origen. El importador está implementado; falta el archivo real. El usuario ya confirmó las 3 estacas y 18 unidades en [ESTACAS_Y_UNIDADES.md](ESTACAS_Y_UNIDADES.md); queda precargarlas al configurar la sesión y conciliar los nombres del CSV con ese catálogo.
- Configurar y publicar el plazo desde administración. Referencias indicadas por el usuario el 17/09/2026: cierre previsto el 17/01/2027 e inicio de sesión el 18/01/2027. Por solicitud del usuario, la configuración del plazo queda pendiente; estas fechas no se han aplicado a la base. No se ejecutó seed.sql: sus datos son ejemplos.
- Configurar y desplegar el worker de IA y sus secretos. No se ejecutó OCR real.
- Probar inicio de sesión, carga privada y aprobación con cuentas reales. Las verificaciones realizadas no equivalen a esa prueba integral.

## Observaciones de seguridad

La propuesta inicial amplia de permisos fue rechazada por la revisión automática. Se sustituyó por un cambio explícito limitado a las tres funciones internas, aplicado correctamente, que conserva los permisos del servicio.

El asesor también señaló pg_net en public (la extensión instalada no es trasladable) y funciones SECURITY DEFINER accesibles por roles del cliente. Las funciones operativas comprueban rol/unidad internamente; se conserva este hallazgo para revisión adicional antes de producción. Referencias: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public y https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable .

GitHub usa main para este portal. master contiene la aplicación previa de Firebase y no fue modificada.

## Flujo de importación acordado · 17/09/2026

El CSV exportado de la inscripción será la fuente inicial de participantes y barrios. La implementación deberá conservar todas las respuestas originales, mapear los campos que utiliza el portal y mostrar una vista previa con errores y posibles duplicados antes de guardar. Si existen barrios con el mismo nombre, se distinguirán por su estaca u otro identificador del archivo; no se fusionarán solo por nombre. Una segunda carga no deberá duplicar participantes ya importados.

Ya se implementó el importador CSV con vista previa y almacenamiento de las 28 respuestas del formulario: [CAMPOS_IMPORTACION_INSCRITOS.md](CAMPOS_IMPORTACION_INSCRITOS.md). Migración local `20260917052532_csv_registration_import.sql` aplicada mediante MCP; no cargar datos reales hasta disponer de cuenta administradora, sesión y archivo. La configuración y publicación del plazo siguen pendientes; la pantalla actual muestra la fecha guardada en la sesión y un contador, pero todavía no ofrece un editor administrativo del plazo.

El asesor señala que la nueva RPC SECURITY DEFINER es ejecutable por authenticated; es el punto de entrada previsto y valida `auth.uid()` y `can_manage_session()` antes de escribir. Pruebas locales verifican rechazo a líderes y revocación a anon. [Referencia del asesor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Usuarios y supervisores · 17/09/2026

- Operación → Usuarios permite al administrador principal crear una cuenta de barrio o un supervisor. La función `create-portal-user` está desplegada con verificación JWT y comprueba además la identidad con Auth y el rol actual en profiles. Solo acepta UNIT_LEADER y REVIEWER; no permite crear administradores principales.
- El usuario del portal se asocia internamente a `usuario@fsy.local`, con contraseña indicada en el formulario. No se envían invitaciones ni se devuelven contraseñas. Cuenta → Cambiar contraseña permite al titular actualizarla. No existe todavía recuperación por correo para estas cuentas internas ni restablecimiento desde el portal.
- Migración local `20260917060224_unit_accounts.sql` aplicada mediante MCP: índice único para una cuenta UNIT_LEADER asignada por unidad. También limita la escritura de requisitos documentales a administradores; un supervisor conserva la lectura y revisión.
- El supervisor (REVIEWER) consulta expedientes de todas las unidades, observa/aprueba documentos, confirma expedientes completos y decide permutas. No carga inscritos ni crea cuentas. El alcance actual es global para el portal, no restringido por estaca o sesión. «Casos» se refiere a expedientes observados y permutas; no hay todavía tickets generales.
- Los originales completos del CSV siguen restringidos a administración. El supervisor consulta los datos y documentos disponibles en el expediente, no todas las respuestas originales médicas del CSV.
- Verificado: build y QA completos; permisos, índice único y prohibición de elevar roles en pruebas de base; autenticación y validación de creación en pruebas aisladas; endpoint real rechaza anónimos con 401. Interfaz revisada a 375 y 1440 px. Aún falta crear e iniciar sesión con una cuenta real de barrio y otra de supervisor desde el portal.
- Las 18 cuentas de barrio todavía no están creadas: primero debe configurarse la sesión y vincular las 18 unidades confirmadas. La configuración del plazo sigue pendiente por indicación del usuario.
