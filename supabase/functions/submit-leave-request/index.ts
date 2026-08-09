// Supabase Edge Function: submit-leave-request
//
// Called when a worker requests time off. Runs server-side with the
// service_role key for the same two reasons as submit-worker-note: it
// needs to look up the business's admin email addresses to notify (a
// worker's own RLS-scoped client can't see other users' emails), and it
// sends that notification via Resend, which needs a secret API key that
// must never reach the browser.
//
// The request is always saved even if the email notification fails — the
// notification is a best-effort nicety layered on top of the actual
// record, not a requirement for the feature to "work".
//
// Deploy: supabase functions deploy submit-leave-request
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the Supabase platform for every Edge
// Function. RESEND_API_KEY is the same secret already used by
// submit-worker-note — no separate setup needed if that's already
// configured. See SETUP.md.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function formatDateLabel(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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

  const { start_date, end_date, reason, site_url } = await req.json()

  if (typeof start_date !== 'string' || typeof end_date !== 'string' || !start_date || !end_date) {
    return json({ error: 'start_date and end_date are required' }, 400)
  }
  if (end_date < start_date) {
    return json({ error: 'end_date must be on or after start_date' }, 400)
  }
  if (typeof reason !== 'undefined' && reason !== null && typeof reason !== 'string') {
    return json({ error: 'reason must be a string' }, 400)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const trimmedReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null

  const { error: insertError } = await adminClient.from('leave_requests').insert({
    user_id: callerProfile.id,
    business_id: callerProfile.business_id,
    start_date,
    end_date,
    reason: trimmedReason,
  })

  if (insertError) {
    return json({ error: insertError.message }, 400)
  }

  const dateRangeLabel =
    start_date === end_date
      ? formatDateLabel(start_date)
      : `${formatDateLabel(start_date)} – ${formatDateLabel(end_date)}`

  // Best-effort email notification — never fails the request. The
  // request above is already saved and visible in the app either way.
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
        const link = `${site_url || ''}/admin/leave`
        const subject = `${callerProfile.name} requested leave on Crewclock`
        const reasonHtml = trimmedReason
          ? `<p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap;">"${trimmedReason}"</p>`
          : ''

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Crewclock <noreply@crewclocknz.com>',
            to: adminEmails,
            subject,
            html: `
              <div style="background-color:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
                  <p style="margin:0 0 16px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:#0f172a;">Crewclock</p>
                  <h1 style="margin:0 0 8px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;color:#0f172a;">${subject}</h1>
                  <p style="margin:0 0 12px 0;font-size:13px;color:#64748b;">${dateRangeLabel}</p>
                  ${reasonHtml}
                  <a href="${link}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:#0f172a;color:#ffffff;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">Review in Crewclock</a>
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
