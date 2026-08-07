// Supabase Edge Function: resend-invite
//
// Called by the admin Workers page as a fallback when an emailed invite
// link doesn't reach the worker — bounced, prescanned/burned by an email
// provider's link scanner before the worker clicked it, or the original
// email was just never seen. Runs server-side with the service_role key
// so it can trigger a fresh password-setup email for a worker who already
// has an (unconfirmed) Auth account, without the worker having to find
// and click a "forgot password" link themselves.
//
// Deploy: supabase functions deploy resend-invite
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
    return json({ error: 'Only an admin can resend invites' }, 403)
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
    .select('email, business_id, role')
    .eq('id', worker_id)
    .single()

  // Same "not found" response whether the row is missing or just belongs to
  // another business, so a caller can't probe for other businesses' workers.
  if (targetError || !targetUser || targetUser.business_id !== callerProfile.business_id) {
    return json({ error: 'Worker not found' }, 404)
  }

  if (targetUser.role !== 'worker') {
    return json({ error: 'Only workers can be re-invited this way' }, 400)
  }

  // The worker's Auth account already exists from the original invite
  // (unconfirmed, no password set yet) — a password-recovery email works
  // for that exactly the same as it would for a confirmed account, and
  // lands them on the same "set your password" screen the invite does.
  const { error: resendError } = await adminClient.auth.resetPasswordForEmail(targetUser.email)

  if (resendError) {
    return json({ error: resendError.message }, 400)
  }

  return json({ ok: true }, 200)
})
