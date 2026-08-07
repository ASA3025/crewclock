// Supabase Edge Function: delete-worker
//
// Called by the admin Workers page. Runs server-side with the service_role
// key (set as a function secret, never shipped to the browser) so it can
// remove a worker's Supabase Auth account. The caller's own JWT is verified
// first to make sure only an admin of a business can remove workers from
// that business.
//
// Deleting the auth.users row cascades (see schema.sql) to the matching
// public.users row, and from there to that worker's shifts and roster
// entries — removing a worker also permanently erases their shift history.
//
// Deploy: supabase functions deploy delete-worker
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
    return json({ error: 'Only an admin can remove workers' }, 403)
  }

  const { worker_id } = await req.json()

  if (!worker_id) {
    return json({ error: 'worker_id is required' }, 400)
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
    return json({ error: 'Only workers can be removed this way' }, 400)
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUser.auth_id)

  if (deleteError) {
    return json({ error: deleteError.message }, 400)
  }

  return json({ ok: true }, 200)
})
