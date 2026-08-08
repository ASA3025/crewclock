// Supabase Edge Function: submit-worker-note
//
// Called when a worker flags a shift or sends a short note to their
// admin from inside the app. Runs server-side with the service_role key
// for two reasons: it needs to look up the business's admin email
// addresses to notify (a worker's own RLS-scoped client can't see other
// users' emails), and it sends that notification via Resend, which needs
// a secret API key that must never reach the browser.
//
// The note is always saved even if the email notification fails — the
// notification is a best-effort nicety layered on top of the actual
// record, not a requirement for the feature to "work".
//
// Deploy: supabase functions deploy submit-worker-note
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the Supabase platform for every Edge
// Function. RESEND_API_KEY is NOT automatic — it must be set manually
// (supabase secrets set RESEND_API_KEY=...) or the note will still save
// but no email will send. See SETUP.md.

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
    .select('id, name, business_id')
    .eq('auth_id', user.id)
    .single()

  if (callerError || !callerProfile) {
    return json({ error: 'Could not identify your account' }, 403)
  }

  const { message, shift_id, site_url } = await req.json()

  if (typeof message !== 'string' || !message.trim()) {
    return json({ error: 'message is required' }, 400)
  }

  // Admin client with the service role key, used only after the caller's
  // own identity has been confirmed above.
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  let shiftClockIn: string | null = null

  if (shift_id) {
    const { data: shift, error: shiftError } = await adminClient
      .from('shifts')
      .select('user_id, business_id, clock_in_time')
      .eq('id', shift_id)
      .single()

    if (
      shiftError ||
      !shift ||
      shift.user_id !== callerProfile.id ||
      shift.business_id !== callerProfile.business_id
    ) {
      return json({ error: 'Shift not found' }, 404)
    }
    shiftClockIn = shift.clock_in_time
  }

  const { error: insertError } = await adminClient.from('worker_notes').insert({
    user_id: callerProfile.id,
    business_id: callerProfile.business_id,
    shift_id: shift_id ?? null,
    message: message.trim(),
  })

  if (insertError) {
    return json({ error: insertError.message }, 400)
  }

  // Best-effort email notification — never fails the request. The note
  // above is already saved and visible in the app either way.
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (resendApiKey) {
      const { data: admins } = await adminClient
        .from('users')
        .select('email')
        .eq('business_id', callerProfile.business_id)
        .eq('role', 'admin')

      const adminEmails = (admins ?? []).map((a) => a.email)

      if (adminEmails.length > 0) {
        const link = `${site_url || ''}/admin/overview`
        const subject = shiftClockIn
          ? `${callerProfile.name} flagged a shift on Crewclock`
          : `${callerProfile.name} sent a note on Crewclock`
        const shiftLine = shiftClockIn
          ? `<p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;">About the shift starting ${new Date(shiftClockIn).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' })}.</p>`
          : ''

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // Resend's shared test address only reliably delivers to the
            // account owner's own verified email. Replace this once a
            // custom sending domain is verified in Resend — see SETUP.md.
            from: 'Crewclock <onboarding@resend.dev>',
            to: adminEmails,
            subject,
            html: `
              <div style="background-color:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
                  <p style="margin:0 0 16px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:#0f172a;">Crewclock</p>
                  <h1 style="margin:0 0 8px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;color:#0f172a;">${subject}</h1>
                  ${shiftLine}
                  <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap;">"${message.trim()}"</p>
                  <a href="${link}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:#0f172a;color:#ffffff;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">View in Crewclock</a>
                  <p style="margin:20px 0 0 0;font-size:12px;color:#64748b;">You're receiving this because you're an admin on Crewclock.</p>
                </div>
              </div>
            `,
          }),
        })
      }
    }
  } catch {
    // Swallow notification errors — see comment above.
  }

  return json({ ok: true }, 200)
})
