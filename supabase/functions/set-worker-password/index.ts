// Supabase Edge Function: set-worker-password
//
// Called by the admin Workers page. Lets an admin directly set (or reset)
// a worker's password — a fallback that doesn't depend on the worker
// receiving or clicking any email at all, for cases where invite/reset
// links aren't reaching them. Runs server-side with the service_role key
// so it can update the worker's Supabase Auth account directly. The
// caller's own JWT is verified first to make sure only an admin of a
// business can set passwords for that business's own workers.
//
// Deploy: supabase functions deploy set-worker-password
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the Supabase platform for every Edge
// Function — no manual secrets needed for this one. See SETUP.md.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Client scoped to the caller's own JWT, used only to verify who's asking.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await callerClient.auth.getUser()

  if (!user) {
    return json({ error: 'Not authenticated' }, 401)
  }

  const { data: callerProfile, error: callerError } = await callerClient
    .from('users')
    .select('role, business_id')
    .eq('auth_id', user.id)
    .single()

  if (callerError || !callerProfile || callerProfile.role !== 'admin') {
    return json({ error: "Only an admin can set a worker's password" }, 403)
  }

  const { worker_id, password } = await req.json()

  if (!worker_id || typeof password !== 'string') {
    return json({ error: 'worker_id and password are required' }, 400)
  }

  // Mirrors src/utils/passwordStrength.ts — the client already gates
  // submission on this, but this endpoint doesn't otherwise trust the
  // client, so it's enforced again here.
  const meetsRequirements =
    password.length >= 8 && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)

  if (!meetsRequirements) {
    return json(
      { error: 'Password must be at least 8 characters and include a number and a special character' },
      400
    )
  }

  // Admin client with the service role key, used only after the caller has
  // been confirmed to be an admin above.
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: targetUser, error: targetError } = await adminClient
    .from('users')
    .select('auth_id, business_id, role')
    .eq('id', worker_id)
    .single()

  // Same "not found" response whether the row is missing or just belongs to
  // another business, so a caller can't probe for other businesses' workers.
  if (targetError || !targetUser || targetUser.business_id !== callerProfile.business_id) {
    return json({ error: 'Worker not found' }, 404)
  }

  if (targetUser.role !== 'worker') {
    return json({ error: "Only workers' passwords can be set this way" }, 400)
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUser.auth_id, {
    password,
  })

  if (updateError) {
    return json({ error: updateError.message }, 400)
  }

  return json({ ok: true }, 200)
})
