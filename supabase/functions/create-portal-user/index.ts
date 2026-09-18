import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return reply({ error: 'UNAUTHORIZED' }, 401)
  try {
    const { data: identity, error: authError } = await db.auth.getUser(token)
    if (authError || !identity.user) return reply({ error: 'UNAUTHORIZED' }, 401)
    // Live database role, never a user-editable claim or a stale UI role.
    const actor = await db.from('profiles').select('role').eq('id', identity.user.id).single()
    if (actor.error || actor.data?.role !== 'SUPER_ADMIN') return reply({ error: 'NOT_ALLOWED' }, 403)
    const bodyText = await req.text()
    if (bodyText.length > 4096) return reply({ error: 'INVALID_INPUT' }, 400)
    let input: Record<string, unknown>
    try { input = JSON.parse(bodyText) } catch { return reply({ error: 'INVALID_INPUT' }, 400) }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({ error: 'INVALID_INPUT' }, 400)
    if (input.action === 'reset_password') {
      const { userId, password } = input
      if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)
        || typeof password !== 'string' || password.length < 12 || password.length > 128) return reply({ error: 'INVALID_INPUT' }, 400)
      const target = await db.from('profiles').select('role').eq('id', userId).single()
      if (target.error || !target.data || !['UNIT_LEADER', 'REVIEWER', 'SESSION_ADMIN'].includes(target.data.role)) return reply({ error: 'RESET_NOT_ALLOWED' }, 403)
      const result = await db.auth.admin.updateUserById(userId, { password, app_metadata: {
        password_reset_by: identity.user.id, password_reset_at: new Date().toISOString(),
      } })
      if (result.error) return reply({ error: 'RESET_FAILED' }, 503)
      return reply({ id: userId, reset: true })
    }
    if (input.action && input.action !== 'create') return reply({ error: 'INVALID_INPUT' }, 400)
    const { username, password, displayName, role, unitId } = input
    if (typeof username !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)
      || typeof password !== 'string' || password.length < 12 || password.length > 128
      || typeof displayName !== 'string' || !displayName.trim() || displayName.length > 100
      || !['UNIT_LEADER', 'REVIEWER'].includes(String(role))) return reply({ error: 'INVALID_INPUT' }, 400)
    if (role === 'UNIT_LEADER') {
      if (typeof unitId !== 'string' || !/^[0-9a-f-]{36}$/i.test(unitId)) return reply({ error: 'UNIT_REQUIRED' }, 400)
      const unit = await db.from('units').select('id').eq('id', unitId).maybeSingle()
      if (unit.error || !unit.data) return reply({ error: 'UNIT_REQUIRED' }, 400)
      const existing = await db.from('profiles').select('id').eq('role', 'UNIT_LEADER').eq('unit_id', unitId).maybeSingle()
      if (existing.error) return reply({ error: 'CHECK_FAILED' }, 503)
      if (existing.data) return reply({ error: 'UNIT_HAS_ACCOUNT' }, 409)
    } else if (unitId) return reply({ error: 'INVALID_INPUT' }, 400)
    const existing = await db.from('profiles').select('id').eq('username', username).maybeSingle()
    if (existing.error) return reply({ error: 'CHECK_FAILED' }, 503)
    if (existing.data) return reply({ error: 'USERNAME_EXISTS' }, 409)
    const { data, error } = await db.auth.admin.createUser({
      email: `${username}@fsy.local`, password, email_confirm: true,
      user_metadata: { username, display_name: displayName.trim() },
      app_metadata: { role, unit_id: role === 'UNIT_LEADER' ? unitId : null, created_by: identity.user.id },
    })
    if (error || !data.user) return reply({ error: 'CREATE_FAILED' }, 409)
    // Auth and its profile trigger commit together. No credentials are returned or logged.
    return reply({ id: data.user.id, username, role }, 201)
  } catch { return reply({ error: 'SERVICE_UNAVAILABLE' }, 503) }
})
