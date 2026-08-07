// Supabase Edge Function: create-worker
//
// Called by the admin Workers page. Runs server-side with the service_role
// key (set as a function secret, never shipped to the browser) so it can
// create a Supabase Auth account for the new worker. The caller's own JWT
// is verified first to make sure only an admin of a business can add
// workers to that business.
//
// Deploy: supabase functions deploy create-worker
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the Supabase platform for every Edge
// Function — no manual secrets needed for this one. See SETUP.md.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: callerProfile, error: callerError } = await callerClient
    .from('users')
    .select('role, business_id')
    .eq('auth_id', user.id)
    .single()

  if (callerError || !callerProfile || callerProfile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Only an admin can add workers' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { name, email, hourly_rate } = await req.json()

  if (!name || !email) {
    return new Response(JSON.stringify({ error: 'name and email are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Admin client with the service role key, used only after the caller has
  // been confirmed to be an admin above.
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email)

  if (inviteError || !invited.user) {
    return new Response(JSON.stringify({ error: inviteError?.message ?? 'Failed to invite worker' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: insertError } = await adminClient.from('users').insert({
    auth_id: invited.user.id,
    name,
    email,
    role: 'worker',
    business_id: callerProfile.business_id,
    hourly_rate: hourly_rate ?? null,
  })

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
