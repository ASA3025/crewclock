import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!supabaseConfigured) {
  console.warn(
    'Supabase env vars are missing. Copy .env.example to .env and fill in your project URL and anon key. ' +
      'The landing page will still render, but login and data features are disabled until then.'
  )
}

// Falls back to a placeholder so createClient doesn't throw and crash the
// whole app (e.g. the marketing landing page) before .env is filled in.
export const supabase = createClient(
  supabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  supabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      // Both already default to true — spelled out so a worker staying
      // logged in across app restarts doesn't quietly break if someone
      // adds other auth options here later without realizing it.
      // persistSession writes the session to localStorage so it survives
      // closing the browser/app. autoRefreshToken silently exchanges the
      // (long-lived, single-use) refresh token for a new access token
      // before the short-lived one expires, so the only things that end
      // a session are explicit sign-out, the refresh token being revoked,
      // or the browser's own storage being cleared.
      persistSession: true,
      autoRefreshToken: true,
    },
  }
)
