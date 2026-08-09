// Supabase Edge Function: weekly-summary-email
//
// Sends every business's admins a Monday-morning summary of the previous
// (Mon-Sun) NZ week: total hours, estimated gross pay, and a per-worker
// breakdown of the same plus lateness/no-show counts. Triggered by a
// pg_cron job (see SETUP.md), not by a logged-in user — there's no caller
// JWT to verify, so this function is deployed with --no-verify-jwt and
// instead checks a shared CRON_SECRET header of its own. Everything runs
// with the service_role key since it needs to read across every business.
//
// Deploy: supabase functions deploy weekly-summary-email --no-verify-jwt
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both automatic),
// RESEND_API_KEY (same secret already used by the other note/reply
// functions), and CRON_SECRET (a random string you choose — see
// SETUP.md for how the cron job is wired up to send it back).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  formatNzDateShort,
  nzEndOfDayInstant,
  nzDateIso,
  nzStartOfDayInstant,
  nzWallClockMinutesOfInstant,
  previousNzWeekRange,
  wallClockMinutes,
} from '../_shared/nz.ts'

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Kept in sync with NO_SHOW_THRESHOLD_MINUTES in src/pages/admin/Overview.tsx
// — the live dashboard's own definition of "so late it's a no-show", reused
// here retrospectively so a worker who eventually clocked in 4 hours late
// counts the same way in this weekly digest as they did on the day itself.
const NO_SHOW_THRESHOLD_MINUTES = 180

// Businesses above this size get totals only — a per-worker table that
// long stops being a quick Monday-morning read and belongs on the Hours
// page instead.
const MAX_WORKERS_FOR_BREAKDOWN = 30

function shiftHours(clockIn: string, clockOut: string | null): number {
  if (!clockOut) return 0
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  return Math.max(ms / 1000 / 60 / 60, 0)
}

function estimateGross(hours: number, hourlyRate: number | null): number {
  if (!hourlyRate) return 0
  return hours * hourlyRate
}

function formatHours(hours: number): string {
  const totalMinutes = Math.round(Math.max(hours, 0) * 60)
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${wholeHours}h` : `${wholeHours}h ${String(minutes).padStart(2, '0')}m`
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(amount)
}

interface WorkerRow {
  id: string
  name: string
  hours: number
  gross: number
  late: number
  noShow: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    return json({ error: 'RESEND_API_KEY is not configured' }, 500)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { start, end } = previousNzWeekRange()
  const rangeStartInstant = nzStartOfDayInstant(start)
  const rangeEndInstant = nzEndOfDayInstant(end)
  const rangeLabel = `${formatNzDateShort(start)} – ${formatNzDateShort(end)}`

  const { data: businesses } = await adminClient.from('businesses').select('id, name')

  let emailsSent = 0

  for (const business of businesses ?? []) {
    const [{ data: workers }, { data: shifts }, { data: rosterEntries }, { data: admins }] =
      await Promise.all([
        adminClient
          .from('users')
          .select('id, name, hourly_rate')
          .eq('business_id', business.id)
          .eq('role', 'worker')
          .order('name'),
        adminClient
          .from('shifts')
          .select('user_id, clock_in_time, clock_out_time, rejected')
          .eq('business_id', business.id)
          .gte('clock_in_time', rangeStartInstant)
          .lte('clock_in_time', rangeEndInstant),
        adminClient
          .from('roster_entries')
          .select('user_id, date, start_time')
          .eq('business_id', business.id)
          .gte('date', start)
          .lte('date', end)
          .not('start_time', 'is', null),
        adminClient.from('users').select('email').eq('business_id', business.id).eq('role', 'admin'),
      ])

    const adminEmails = (admins ?? []).map((a) => a.email)
    if (!workers || workers.length === 0 || adminEmails.length === 0) continue

    // Group same-day shifts by (worker, NZ calendar date) so a roster
    // entry's planned start_time can be matched against what actually
    // happened that day.
    const shiftsByUserDate = new Map<
      string,
      { clock_in_time: string; clock_out_time: string | null }[]
    >()
    for (const s of shifts ?? []) {
      const key = `${s.user_id}|${nzDateIso(new Date(s.clock_in_time))}`
      const list = shiftsByUserDate.get(key) ?? []
      list.push({ clock_in_time: s.clock_in_time, clock_out_time: s.clock_out_time })
      shiftsByUserDate.set(key, list)
    }

    const lateCounts = new Map<string, number>()
    const noShowCounts = new Map<string, number>()

    for (const r of rosterEntries ?? []) {
      const key = `${r.user_id}|${r.date}`
      const matching = shiftsByUserDate.get(key) ?? []
      if (matching.length === 0) {
        noShowCounts.set(r.user_id, (noShowCounts.get(r.user_id) ?? 0) + 1)
        continue
      }
      const earliestClockIn = matching
        .map((m) => m.clock_in_time)
        .sort()[0]
      const minutesLate = nzWallClockMinutesOfInstant(earliestClockIn) - wallClockMinutes(r.start_time!)
      if (minutesLate > NO_SHOW_THRESHOLD_MINUTES) {
        noShowCounts.set(r.user_id, (noShowCounts.get(r.user_id) ?? 0) + 1)
      } else if (minutesLate > 0) {
        lateCounts.set(r.user_id, (lateCounts.get(r.user_id) ?? 0) + 1)
      }
    }

    const workerRows: WorkerRow[] = workers.map((w) => {
      const ownShifts = (shifts ?? []).filter((s) => s.user_id === w.id && !s.rejected)
      const hours = ownShifts.reduce((sum, s) => sum + shiftHours(s.clock_in_time, s.clock_out_time), 0)
      return {
        id: w.id,
        name: w.name,
        hours,
        gross: estimateGross(hours, w.hourly_rate),
        late: lateCounts.get(w.id) ?? 0,
        noShow: noShowCounts.get(w.id) ?? 0,
      }
    })

    const totalHours = workerRows.reduce((sum, w) => sum + w.hours, 0)
    const totalGross = workerRows.reduce((sum, w) => sum + w.gross, 0)
    const showBreakdown = workerRows.length <= MAX_WORKERS_FOR_BREAKDOWN

    const rowsHtml = showBreakdown
      ? workerRows
          .map(
            (w) => `
              <tr>
                <td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:13px;color:#0f172a;">${w.name}</td>
                <td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:13px;color:#334155;text-align:right;">${formatHours(w.hours)}</td>
                <td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:13px;color:#334155;text-align:right;">${formatCurrency(w.gross)}</td>
                <td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:13px;color:#334155;text-align:right;">${
                  w.late > 0 || w.noShow > 0
                    ? [w.late > 0 && `${w.late} late`, w.noShow > 0 && `${w.noShow} no-show`]
                        .filter(Boolean)
                        .join(', ')
                    : '—'
                }</td>
              </tr>`
          )
          .join('')
      : ''

    const subject = `Crewclock weekly summary — ${rangeLabel}`

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
            <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
              <p style="margin:0 0 16px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:#0f172a;">Crewclock</p>
              <h1 style="margin:0 0 4px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;color:#0f172a;">Weekly summary</h1>
              <p style="margin:0 0 20px 0;font-size:13px;color:#64748b;">${rangeLabel}</p>
              <div style="display:flex;gap:12px;margin:0 0 24px 0;">
                <div style="flex:1;background-color:#f8fafc;border-radius:12px;padding:14px;">
                  <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Total hours</p>
                  <p style="margin:4px 0 0 0;font-size:20px;font-weight:800;color:#0f172a;">${formatHours(totalHours)}</p>
                </div>
                <div style="flex:1;background-color:#f8fafc;border-radius:12px;padding:14px;">
                  <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Est. gross — before tax</p>
                  <p style="margin:4px 0 0 0;font-size:20px;font-weight:800;color:#0f172a;">${formatCurrency(totalGross)}</p>
                </div>
              </div>
              ${
                showBreakdown
                  ? `
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr>
                    <th style="text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;padding-bottom:6px;">Worker</th>
                    <th style="text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;padding-bottom:6px;">Hours</th>
                    <th style="text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;padding-bottom:6px;">Est. pay</th>
                    <th style="text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;padding-bottom:6px;">Lateness</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>`
                  : `<p style="margin:0;font-size:13px;color:#64748b;">Per-worker breakdown skipped for businesses over ${MAX_WORKERS_FOR_BREAKDOWN} workers — see the Hours page for details.</p>`
              }
              <p style="margin:24px 0 0 0;font-size:12px;color:#64748b;">Estimates only — actual pay may differ (public holidays, overtime rules, etc. aren't factored in). You're receiving this because you're an admin on Crewclock.</p>
            </div>
          </div>
        `,
      }),
    })

    emailsSent += 1
  }

  return json({ ok: true, businesses: businesses?.length ?? 0, emailsSent }, 200)
})
