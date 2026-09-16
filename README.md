> Conexión real configurada el 16/09/2026 en `dshunrsnkkioxpdazaxx`. Ver `docs/CONEXION_SUPABASE.md` para migraciones aplicadas y pendientes operativos. `.env.local` está excluido de Git.

# Entrega actual: MVP3 (0.3.0)

Permutas disponibles desde cada expediente; solicitudes e historial en **Operación → Permutas**. Preparar entrante, completar documentos, solicitar revisión y aprobar el cambio conserva el mismo cupo. Cancelar o no aprobar mantiene al titular anterior. El modo demo pierde sus datos al recargar.

Aplicar también `supabase/migrations/005_replacements.sql` después de las migraciones anteriores. Incluye permisos, validaciones, transacciones y la corrección de acceso para perfiles sin unidad. No se ha aplicado a un proyecto remoto.

Paleta vigente: Neutral 5 `#EFEFE7`, Yellow 10 `#FFB81C`, Blue 25 `#007DA5`, con blanco/negro exentos. Ver `design-system/fsy-2027-portal/MVP3.md` y `docs/MVP3_REVISION_Y_ENTREGA.md`.

## Funcionalidad documental del MVP2 conservada

Portal de Confirmación FSY Lima Noroeste · Sesión 2 · 2027.

## Novedades del MVP2

- Análisis asíncrono con Gemini: clasificación, legibilidad, páginas, nombres, firmas y extracción orientativa.
- Resultados por versión; notas comprensibles y datos extraídos disponibles solo para revisores.
- Aprobación o solicitud de corrección por documento. Confirmación únicamente cuando todos los requisitos estén aprobados.
- Archivos privados mediante enlaces de 60 segundos, historial y vista previa local antes de guardar.
- Reintentos limitados, timeout del proveedor y revisión manual cuando IA no está disponible.
- Demo explícitamente simulada: no ejecuta OCR, no transmite archivos y se reinicia al recargar.

Consulta [la revisión y entrega del MVP2](docs/MVP2_REVISION_Y_ENTREGA.md) para el alcance, pruebas y límites.

## Base del MVP1 conservada

- Login para cuenta de unidad.
- Modo demo inmediato cuando Supabase no está configurado.
- Carga administrativa inicial, participante por participante, con creación transaccional de su cupo.
- Dashboard orientado a pendientes y deadline.
- Lista de jóvenes: tabla desktop + cards mobile.
- Expediente individual con checklist configurable de 7 documentos.
- Carga de JPG / PNG / WebP / PDF. Las fotos grandes se optimizan en cliente; el archivo final y los PDF tienen límite de 12 MB.
- Reemplazo de documentos observados sin borrar versiones previas.
- Estados humanos: requiere completar, enviado, en revisión, requiere corrección, confirmado.
- Bandeja mínima de revisión FSY y confirmación.
- Separación de permisos: líderes ven su unidad; revisión y carga inicial requieren roles administrativos.
- Base Supabase con `registration_slots`, documentos versionados, bucket privado y RLS por unidad.
- Responsive mobile-first y navegación inferior de 4 destinos.

## Deliberadamente fuera de este MVP

- Tickets, notificaciones, analytics y PWA instalable → MVP 4.

## Stack

- React 19 + TypeScript + Vite.
- CSS propio, sin framework visual.
- Supabase Auth + PostgreSQL + Storage cuando se configuran variables.

No se agregó React Router, Tailwind, React Hook Form, Zod ni TanStack Query todavía: este primer flujo no los necesita para funcionar y añadirlos ahora aumentaría superficie de código sin resolver un problema real.

## Llevarlo al repositorio vacío

El repositorio remoto está vacío, así que este paquete puede convertirse directamente en el primer commit:

```bash
git clone https://github.com/Richiboy94/fsy_2027.git
cd fsy_2027
# Copia aquí el contenido de este paquete
npm install
npm run qa
npm run build
git add .
git commit -m "feat: bootstrap FSY 2027 MVP 1"
git branch -M main
git push -u origin main
```

## Arranque local

```bash
npm install
npm run dev
```

Sin `.env`, la app inicia en **modo demo** y ofrece accesos “Ver como líder” y “Ver revisión FSY”.

## Conectar Supabase

1. Crea un proyecto Supabase.
2. Ejecuta las migraciones `001`, `002`, `003`, `004` y `005` de `supabase/migrations`, en ese orden. Si ya aplicaste algunas, ejecuta únicamente las pendientes. La interfaz actual necesita `005`. Después ejecuta `supabase/check_mvp3.sql`: todas las comprobaciones deben devolver `true`. Esta consulta es de solo lectura y no prueba por sí sola la integración completa.
3. Opcionalmente ejecuta `supabase/seed.sql` para crear la sesión/estaca/unidad de ejemplo.
4. Copia `.env.example` a `.env.local`.
5. Completa:

```env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY
```

6. Crea usuarios de Auth. Para mantener el login por nombre de unidad, usa email interno:

```text
barrio.ventanilla@fsy.local
```

El usuario escribe solo `barrio.ventanilla`; el frontend añade `@fsy.local`.

Crea las cuentas mediante Auth Admin API. Los campos de presentación van en `user_metadata`; los permisos deben ir en `app_metadata`, que solo puede asignar un administrador:

```json
{
  "user_metadata": {
    "username": "barrio.ventanilla",
    "display_name": "Barrio Ventanilla"
  },
  "app_metadata": {
    "role": "UNIT_LEADER",
    "unit_id": "20270000-0000-4000-8000-000000000201"
  }
}
```

El trigger `handle_new_auth_user` crea `profiles` automáticamente.

## Activar análisis real

1. Despliega `supabase/functions/validate-document` en el proyecto Supabase, con verificación JWT habilitada.
2. Configura `GEMINI_API_KEY` como secret de la Edge Function. Opcional: `GEMINI_MODEL` para fijar un modelo disponible en tu cuenta; por defecto usa `gemini-flash-latest`.
3. En SQL Editor, completa las filas de `private.app_config`: `edge_function_url` con la URL HTTPS de `validate-document` y `service_role_key` con la clave JWT `service_role` del mismo proyecto. No uses una clave publicable ni guardes secretos en el frontend o repositorio.
4. Prueba un documento ficticio y revisa `ai_status`, el resultado y el flujo humano. Los originales se descargan del bucket privado y se envían al proveedor configurado exclusivamente desde la función.

Sin esta configuración, los documentos quedan disponibles para revisión manual. Si la función no responde, tras dos minutos se permite reintentar; hay un máximo de tres intentos de análisis por versión. Cada intento hace hasta dos solicitudes al proveedor ante 429/5xx, con timeout de 25 segundos por solicitud.

El despliegue y una llamada real al proveedor no se realizaron en esta entrega local. Revisa los perfiles ya existentes si fueron creados antes de `004`, pues la migración no reasigna permisos históricos.

## Seguridad MVP

- Bucket `participant-documents` privado.
- Sin URLs públicas de documentos.
- RLS restringe participantes/documentos a `unit_id` del usuario.
- La confirmación final se realiza mediante RPC y exige rol administrativo.
- El líder puede enviar documentos, no aprobar participantes ni enlazar versiones arbitrarias: esa operación pasa por una RPC validada en servidor.
- El frontend enmascara el DNI en listas.
- Las versiones documentales no se sobrescriben.
- El checklist documental se resuelve por sesión, evitando mezclar requisitos de sesiones futuras.

> El modo demo es solo una maqueta funcional local y nunca debe contener datos reales.

## QA

```bash
npm run qa
npm run build
```

`npm run qa` ejecuta regresión estructural, contrato IA, worker con proveedor simulado, flujo demo de documentos/permutas y comprobación de paleta/contraste. Requiere Node 24 o superior.

Para las pruebas SQL locales opcionales:

```bash
npm install --prefix .qa-tools --no-save --no-package-lock @electric-sql/pglite
npm run qa:db
```

Estas pruebas usan PostgreSQL embebido con stubs de Auth, Storage y transporte `pg_net`; no sustituyen una prueba integrada en Supabase. `.qa-tools` no es una dependencia del producto.

## Fuente de verdad

`docs/FSY_2027_Portal_Confirmacion_Arquitectura_Maestra.md`

La implementación debe conservar el principio:

**Participante → Checklist → Próxima acción → Validación → Confirmación.**
