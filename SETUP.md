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
`shift-photos` storage bucket.

## 4. Deploy the Edge Functions

`create-worker` lets admins add workers from inside the app, `delete-worker`
lets admins remove them, `resend-invite` / `set-worker-password` are
fallbacks for when an invite email doesn't reach a worker, `reverse-geocode`
turns a shift's GPS coordinates into a readable address on the admin Hours
page, and `submit-worker-note` handles a worker flagging a shift or sending
a note to their admin. All six need the
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
```

No extra secrets needed for most of these — Supabase injects the project
URL and keys into every Edge Function automatically, and `reverse-geocode`
calls OpenStreetMap's free Nominatim API, which needs no API key or account
of its own either.

`submit-worker-note` is the exception: emailing the admin when a worker
flags something needs a [Resend](https://resend.com) account and API key —

```bash
supabase secrets set RESEND_API_KEY=your-resend-api-key
```

Without this secret set, flagging still works and shows up in the admin's
Overview page either way — the note is saved regardless, only the email
notification is skipped. Resend's shared test sending address
(`onboarding@resend.dev`, hardcoded in the function) only reliably delivers
to the email your Resend account itself is registered with — to actually
notify real admin addresses, verify your own sending domain in Resend and
update the `from` address in
[`supabase/functions/submit-worker-note/index.ts`](supabase/functions/submit-worker-note/index.ts).

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

## Deploying the app itself

Push this folder to a GitHub repo, then import it into
[Vercel](https://vercel.com) or [Netlify](https://netlify.com). Add the two
`VITE_SUPABASE_*` environment variables in the hosting provider's dashboard
(same values as your local `.env`). Every push to `main` will auto-deploy.
