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

- Crear la cuenta administradora elegida por el usuario en Supabase Auth y asignar su rol en profiles mediante administración. No se han creado contraseñas ni enviado invitaciones.
- Cargar sesión, plazo y unidades reales. No se ejecutó seed.sql: sus datos son ejemplos.
- Configurar y desplegar el worker de IA y sus secretos. No se ejecutó OCR real.
- Probar inicio de sesión, carga privada y aprobación con cuentas reales. Las verificaciones realizadas no equivalen a esa prueba integral.

## Observaciones de seguridad

La propuesta inicial amplia de permisos fue rechazada por la revisión automática. Se sustituyó por un cambio explícito limitado a las tres funciones internas, aplicado correctamente, que conserva los permisos del servicio.

El asesor también señaló pg_net en public (la extensión instalada no es trasladable) y funciones SECURITY DEFINER accesibles por roles del cliente. Las funciones operativas comprueban rol/unidad internamente; se conserva este hallazgo para revisión adicional antes de producción. Referencias: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public y https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable .

GitHub usa main para este portal. master contiene la aplicación previa de Firebase y no fue modificada.
