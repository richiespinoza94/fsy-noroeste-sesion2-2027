import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = path.resolve(import.meta.dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const app = read('src/App.tsx')
const styles = read('src/styles.css')
const sql = read('supabase/migrations/001_mvp.sql')
const types = read('src/types.ts')

const checks = [
  ['7 tipos documentales', (types.match(/_DNI_|REGISTRATION_FORM|IMAGE_AUTHORIZATION|MEDICAL_AUTHORIZATION/g) ?? []).length >= 7],
  ['navegación mobile de 4 destinos', app.includes("{ page: 'home'") && app.includes("{ page: 'participants'") && app.includes("{ page: 'help'") && app.includes("{ page: 'account'")],
  ['touch target mínimo 44px', styles.includes('min-height: 44px')],
  ['reduced motion', styles.includes('prefers-reduced-motion')],
  ['tabla desktop + cards mobile', app.includes('desktop-participants') && app.includes('mobile-participants')],
  ['bucket privado', sql.includes("'participant-documents'") && /public\s*=\s*false/.test(sql)],
  ['RLS participantes', sql.includes('alter table public.participants enable row level security') && sql.includes('participants visible by unit')],
  ['RLS documentos', sql.includes('alter table public.documents enable row level security') && sql.includes('documents visible by participant unit')],
  ['cupo independiente', sql.includes('create table if not exists public.registration_slots')],
  ['carga inicial transaccional', sql.includes('function public.create_participant_with_slot') && app.includes('Carga inicial') && app.includes('Agregar participante')],
  ['operación admin accesible en mobile', app.includes("label: 'Operación'") && app.includes('mobileNav.map')],
  ['versionado documental', sql.includes('create table if not exists public.document_versions') && sql.includes('unique (document_id, version_number)')],
  ['checklist aislado por sesión', read('src/data/supabaseRepository.ts').includes('item.session_id === row.session_id')],
  ['enlace de versión validado server-side', sql.includes('function public.attach_document_version') && !sql.includes('leaders attach submitted versions') && read('src/data/supabaseRepository.ts').includes("rpc('attach_document_version'")],
  ['confirmación server-side', sql.includes('function public.confirm_participant') && sql.includes("if not public.is_admin()")],
  ['IA asíncrona con revisión humana', app.includes('análisis asistido') && read('src/DocumentReview.tsx').includes('Aprobar documento')],
]

for (const [name, ok] of checks) {
  assert.ok(ok, `QA falló: ${name}`)
  console.log(`✓ ${name}`)
}

console.log(`\n${checks.length}/${checks.length} checks de regresión OK`)
