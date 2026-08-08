// Supabase Edge Function: submit-note-reply
//
// Called when either party in a worker_notes thread — the worker who
// flagged something, or an admin responding to it — posts a follow-up
// message. Runs server-side with the service_role key for the same two
// reasons as submit-worker-note: it needs to look up the *other* party's
// email address to notify them (an RLS-scoped client can't see another
// user's email), and it sends that notification via Resend, which needs a
// secret API key that must never reach the browser.
//
// The reply is always saved even if the email notification fails — the
// notification is a best-effort nicety layered on top of the actual
// record, not a requirement for the feature to "work".
//
// Deploy: supabase functions deploy submit-note-reply
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
    .select('id, name, role, business_id')
    .eq('auth_id', user.id)
    .single()

  if (callerError || !callerProfile) {
    return json({ error: 'Could not identify your account' }, 403)
  }

  const { note_id, message, site_url } = await req.json()

  if (typeof note_id !== 'string' || !note_id) {
    return json({ error: 'note_id is required' }, 400)
  }
  if (typeof message !== 'string' || !message.trim()) {
    return json({ error: 'message is required' }, 400)
  }

  // Admin client with the service role key, used only after the caller's
  // own identity has been confirmed above.
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: note, error: noteError } = await adminClient
    .from('worker_notes')
    .select('id, user_id, business_id')
    .eq('id', note_id)
    .single()

  if (noteError || !note || note.business_id !== callerProfile.business_id) {
    return json({ error: 'Note not found' }, 404)
  }

  const isOwner = note.user_id === callerProfile.id
  const isAdmin = callerProfile.role === 'admin'

  // A worker may only reply to their own flag; an admin may reply to any
  // flag raised within their own business.
  if (!isOwner && !isAdmin) {
    return json({ error: 'Not authorized to reply to this note' }, 403)
  }

  const { error: insertError } = await adminClient.from('worker_note_replies').insert({
    worker_note_id: note.id,
    business_id: callerProfile.business_id,
    author_id: callerProfile.id,
    author_name: callerProfile.name,
    author_role: callerProfile.role,
    message: message.trim(),
  })

  if (insertError) {
    return json({ error: insertError.message }, 400)
  }

  // Best-effort email notification to the *other* party in the thread —
  // never fails the request. The reply above is already saved either way.
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (resendApiKey) {
      let recipientEmails: string[] = []
      let link: string

      if (isAdmin) {
        // The caller is the admin replying — notify the worker who owns the note.
        const { data: worker } = await adminClient
          .from('users')
          .select('email')
          .eq('id', note.user_id)
          .single()
        recipientEmails = worker ? [worker.email] : []
        link = `${site_url || ''}/worker/notes`
      } else {
        // The caller is the worker replying — notify all admins in the business.
        const { data: admins } = await adminClient
          .from('users')
          .select('email')
          .eq('business_id', callerProfile.business_id)
          .eq('role', 'admin')
        recipientEmails = (admins ?? []).map((a) => a.email)
        link = `${site_url || ''}/admin/overview`
      }

      if (recipientEmails.length > 0) {
        const subject = `${callerProfile.name} replied on Crewclock`

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
            to: recipientEmails,
            subject,
            html: `
              <div style="background-color:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
                  <p style="margin:0 0 16px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:#0f172a;">Crewclock</p>
                  <h1 style="margin:0 0 8px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;color:#0f172a;">${subject}</h1>
                  <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap;">"${message.trim()}"</p>
                  <a href="${link}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:#0f172a;color:#ffffff;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">View in Crewclock</a>
                  <p style="margin:20px 0 0 0;font-size:12px;color:#64748b;">You're receiving this because of a flag/note thread on Crewclock.</p>
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
