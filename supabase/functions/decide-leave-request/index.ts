// Supabase Edge Function: decide-leave-request
//
// Called by the admin Leave page to approve or deny a worker's leave
// request. Runs server-side with the service_role key for two reasons:
// the caller's own JWT is verified first to make sure only an admin of
// the request's business can decide it, and after deciding it looks up
// the requesting worker's email to notify them of the outcome — a
// worker's own RLS-scoped client can't see another user's email, and an
// admin's browser client has no way to send email directly (that needs
// the RESEND_API_KEY secret, which must never reach the browser).
//
// The decision is always saved even if the email notification fails —
// the notification is a best-effort nicety layered on top of the actual
// record, not a requirement for the feature to "work".
//
// Deploy: supabase functions deploy decide-leave-request
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

// Anchored to UTC midnight, not noon — NZ is always *ahead* of UTC
// (+12/+13), so anchoring at noon UTC and adding that offset always
// crosses into the next calendar day once formatted in NZ time. Midnight
// UTC plus up to 13 hours never leaves the same NZ calendar day, matching
// the same approach as formatNzDate in the frontend (src/utils/datetime.ts).
function formatDateLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-NZ', {
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
    .select('id, role, business_id')
    .eq('auth_id', user.id)
    .single()

  if (callerError || !callerProfile || callerProfile.role !== 'admin') {
    return json({ error: 'Only an admin can decide a leave request' }, 403)
  }

  const { leave_request_id, decision, site_url } = await req.json()

  if (!leave_request_id) {
    return json({ error: 'leave_request_id is required' }, 400)
  }
  if (decision !== 'approved' && decision !== 'denied') {
    return json({ error: "decision must be 'approved' or 'denied'" }, 400)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: request, error: requestError } = await adminClient
    .from('leave_requests')
    .select('id, user_id, business_id, start_date, end_date')
    .eq('id', leave_request_id)
    .single()

  // Same "not found" response whether the row is missing or just belongs to
  // another business, so a caller can't probe for other businesses' requests.
  if (requestError || !request || request.business_id !== callerProfile.business_id) {
    return json({ error: 'Leave request not found' }, 404)
  }

  const { error: updateError } = await adminClient
    .from('leave_requests')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: callerProfile.id,
    })
    .eq('id', leave_request_id)

  if (updateError) {
    return json({ error: updateError.message }, 400)
  }

  // Best-effort email notification — never fails the request. The
  // decision above is already saved and visible in the app either way.
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (resendApiKey) {
      const { data: worker } = await adminClient
        .from('users')
        .select('email')
        .eq('id', request.user_id)
        .single()

      if (worker?.email) {
        const dateRangeLabel =
          request.start_date === request.end_date
            ? formatDateLabel(request.start_date)
            : `${formatDateLabel(request.start_date)} – ${formatDateLabel(request.end_date)}`
        const link = `${site_url || ''}/worker/leave`
        const subject =
          decision === 'approved'
            ? 'Your leave request was approved'
            : 'Your leave request was denied'

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Crewclock <noreply@crewclocknz.com>',
            to: [worker.email],
            subject: `${subject} — Crewclock`,
            html: `
              <div style="background-color:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
                  <p style="margin:0 0 16px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:#0f172a;">Crewclock</p>
                  <h1 style="margin:0 0 8px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;color:#0f172a;">${subject}</h1>
                  <p style="margin:0 0 20px 0;font-size:13px;color:#64748b;">${dateRangeLabel}</p>
                  <a href="${link}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:#0f172a;color:#ffffff;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">View in Crewclock</a>
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
