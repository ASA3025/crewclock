# Crewclock — setup

The app is fully built and wired to Supabase, but no Supabase project exists yet.
Follow these steps once to get a working, live app.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a new project (any region close to NZ, e.g. Sydney).
2. In **Project Settings → API**, copy the **Project URL** and the **anon public key**.

## 2. Connect the app to it

```bash
cp .env.example .env
```

Paste the URL and anon key into `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 3. Run the database schema

In the Supabase dashboard, open **SQL Editor**, paste the entire contents of
[`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the
`businesses`, `users`, `shifts`, `roster_entries` tables, row-level security
policies (so businesses can never see each other's data), and the
`shift-photos` and `avatars` storage buckets.

## 4. Deploy the Edge Functions

`create-worker` lets admins add workers from inside the app, `delete-worker`
lets admins remove them, `resend-invite` / `set-worker-password` are
fallbacks for when an invite email doesn't reach a worker, `reverse-geocode`
turns a shift's GPS coordinates into a readable address on the admin Hours
page, `submit-worker-note` handles a worker flagging a shift/roster entry or
sending a note to their admin, `submit-note-reply` handles either side
replying within that flag's thread, `weekly-summary-email` sends admins
a Monday-morning digest (see [Weekly summary email](#weekly-summary-email-optional)
below for the extra setup it needs), `submit-leave-request` handles a
worker requesting time off, and `decide-leave-request` handles an admin
approving or denying it. All ten need the
[Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy create-worker
supabase functions deploy delete-worker
supabase functions deploy resend-invite
supabase functions deploy set-worker-password
supabase functions deploy reverse-geocode
supabase functions deploy submit-worker-note
supabase functions deploy submit-note-reply
supabase functions deploy weekly-summary-email --no-verify-jwt
supabase functions deploy submit-leave-request
supabase functions deploy decide-leave-request
```

`weekly-summary-email` is deployed with `--no-verify-jwt` because it's
called by a scheduled cron job, not a logged-in user — there's no Supabase
session to verify. It checks its own `CRON_SECRET` instead (set up below),
so it's still not callable by just anyone who finds the URL.

No extra secrets needed for most of these — Supabase injects the project
URL and keys into every Edge Function automatically, and `reverse-geocode`
calls OpenStreetMap's free Nominatim API, which needs no API key or account
of its own either.

`submit-worker-note`, `submit-note-reply`, `weekly-summary-email`,
`submit-leave-request`, and `decide-leave-request` are the exception:
sending any of these emails needs a
[Resend](https://resend.com) account and API key —

```bash
supabase secrets set RESEND_API_KEY=your-resend-api-key
```

Without this secret set, flagging, replying, and requesting/deciding leave
still work either way — the underlying record (note, reply, leave request,
decision) is saved regardless, only the email notification is skipped.
`weekly-summary-email` is the one exception: it has nothing to do without
email, so it fails outright if this secret is missing — see that
function's own code.

All five send from `noreply@crewclocknz.com` (hardcoded in each
function), which means **`crewclocknz.com` must be verified as a sending
domain in your Resend account** — Resend will silently reject sends from
an address on a domain it hasn't verified. If you're using a different
domain, update the `from` address in all five:
[`supabase/functions/submit-worker-note/index.ts`](supabase/functions/submit-worker-note/index.ts),
[`supabase/functions/submit-note-reply/index.ts`](supabase/functions/submit-note-reply/index.ts),
[`supabase/functions/weekly-summary-email/index.ts`](supabase/functions/weekly-summary-email/index.ts),
[`supabase/functions/submit-leave-request/index.ts`](supabase/functions/submit-leave-request/index.ts),
and
[`supabase/functions/decide-leave-request/index.ts`](supabase/functions/decide-leave-request/index.ts).

Note: removing a worker deletes their Supabase Auth account, which cascades
(see `schema.sql`) to their `users` row and from there to all of their
shifts and roster entries — it's a permanent, irreversible delete of their
whole history, not just a deactivation.

Note: worker invites are sent as Supabase Auth invite emails. The default
Supabase email sender is rate-limited and fine for the internal test with a
handful of workers; if you outgrow it, add a custom SMTP provider under
**Project Settings → Auth**.

Note: the invite and password-reset emails use Crewclock-branded HTML
templates rather than Supabase's plain defaults —
[`supabase/email-templates/invite.html`](supabase/email-templates/invite.html)
and [`recovery.html`](supabase/email-templates/recovery.html). Paste each
into **Authentication → Email Templates** (Invite user / Reset password) in
the dashboard; there's no CLI/API way to deploy these, they're dashboard-only
config, so this is a manual one-time step per Supabase project (including
if you ever spin up a second one, e.g. staging).

Note: invite/reset emails redirect to whatever **Site URL** is set under
**Authentication → URL Configuration** in the Supabase dashboard — this is
dashboard config, not something in the app's code. If invite links "can't be
reached," check that setting points at an address actually reachable by
whoever's clicking the link. If email delivery itself is unreliable, use
**Workers → Set password** or **Resend invite** on the admin Workers page
instead — neither depends on the worker clicking a link at all.

### Testing on a phone before deploying

`npm run dev` binds to your machine's LAN address as well as localhost (see
the `Network:` URL it prints), so a phone on the same WiFi can reach it —
useful for testing things like GPS clock-in that need a real device. For
invite/reset links to work when opened on that phone, set **Site URL** in
the Supabase dashboard to that same LAN address (e.g.
`http://192.168.1.132:5173`, matching whatever `npm run dev` prints) — it'll
need updating if your machine's IP changes (new network, DHCP lease renewal,
etc.), and again once you deploy for real.

## 5. Create your business and the first admin

There's no self-serve sign-up on purpose (see spec §5) — the first business
and admin are created once, manually, in the Supabase dashboard:

1. **Table Editor → businesses** → insert a row, e.g. `name: "Uncle's Contracting"`. Copy its `id`.
2. **Authentication → Users → Add user** → enter the admin's email + a password (or use "send invite").
   Copy the new user's `id` (this is the `auth_id`).
3. **Table Editor → users** → insert a row:
   - `auth_id`: the id from step 2
   - `name`, `email`: the admin's details
   - `role`: `admin`
   - `business_id`: the id from step 1
   - `hourly_rate`: leave blank (admins don't need one)

That admin can now log in at the app's URL and use **Workers → Add worker**
to bring on the rest of the crew — no more manual Supabase steps needed for
day-to-day use.

## 6. Run it

```bash
npm install
npm run dev
```

## Adding a second business later

Repeat step 5 (new `businesses` row + one manually-created admin) — no code
changes needed. That business's data is automatically isolated from every
other business by the row-level security policies in `schema.sql`.

## Promoting a worker to admin

Not built into the app yet (spec §5.3 treats this as rare/manual for MVP).
In **Table Editor → users**, change that row's `role` from `worker` to
`admin`.

## Weekly summary email (optional)

Sends every business's admins a Monday-morning email with the previous
week's total hours, estimated gross pay, and a per-worker breakdown
(hours, pay, and how many times they were flagged running late or a
no-show). Needs the `RESEND_API_KEY` secret from step 4 above, plus a
scheduled job to actually trigger it — Supabase doesn't run Edge
Functions on a timer by itself, so this uses `pg_cron` (runs the
schedule) and `pg_net` (makes the HTTP call) directly in the database.

1. Pick a random secret string (e.g. `openssl rand -hex 32` in a
   terminal, or any long random string) and set it as an Edge Function
   secret:
   ```bash
   supabase secrets set CRON_SECRET=your-random-secret
   ```
2. In the Supabase dashboard's **SQL Editor**, run:
   ```sql
   create extension if not exists pg_cron with schema extensions;
   create extension if not exists pg_net with schema extensions;

   select cron.schedule(
     'weekly-summary-email',
     '0 19 * * 0', -- Sunday 19:00 UTC ≈ Monday 7-8am NZ time, see note below
     $$
     select net.http_post(
       url := 'https://your-project-ref.supabase.co/functions/v1/weekly-summary-email',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'your-random-secret'),
       body := '{}'::jsonb
     );
     $$
   );
   ```
   Replace `your-project-ref` and `your-random-secret` with the actual
   values (the secret has to match what you set in step 1 — `pg_cron`
   has no access to Edge Function secrets, so it's duplicated here as
   plain SQL; this SQL isn't checked into the repo for that reason, so
   treat it as sensitive once you've filled in the real secret).

Note on timing: `pg_cron` schedules run in UTC with no timezone support,
and NZ shifts between UTC+12 (NZST) and UTC+13 (NZDT) twice a year, so a
fixed UTC time can't stay pinned to "Monday 7am NZ time" year-round —
`0 19 * * 0` lands at Monday 7am NZST or Monday 8am NZDT depending on the
time of year, which is close enough for a Monday-morning digest. If you
want it exact, you'd need to update the cron expression twice a year
around NZ's DST changeovers.

To stop the emails later: `select cron.unschedule('weekly-summary-email');`
in the SQL Editor.

## Deploying the app itself

Push this folder to a GitHub repo, then import it into
[Vercel](https://vercel.com) or [Netlify](https://netlify.com). Add the two
`VITE_SUPABASE_*` environment variables in the hosting provider's dashboard
(same values as your local `.env`). Every push to `main` will auto-deploy.
