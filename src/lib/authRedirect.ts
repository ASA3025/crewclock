// Supabase invite/recovery links redirect to the site root with a token in
// the URL hash (or `type=invite`/`type=recovery` as a query param). This
// must be checked on first render, before supabase-js's own URL processing
// consumes and clears the hash — see AcceptInvite.tsx and App.tsx.
export function getAuthRedirectType(): 'invite' | 'recovery' | null {
  const match = (window.location.hash + window.location.search).match(/type=(invite|recovery)/)
  return (match?.[1] as 'invite' | 'recovery' | undefined) ?? null
}

export function isAuthRedirectUrl(): boolean {
  return getAuthRedirectType() !== null
}

// A recovery (or invite) link creates a fully valid, working session
// immediately — before the user has actually set a password. Detecting
// `type=recovery` in the URL on first render (above) only catches this at
// the moment the link is first opened; it doesn't protect against the
// session still being "pending a password" later — e.g. if the page gets
// reloaded on the set-password screen, or something else briefly mounts a
// protected route before routing settles. This flag is the durable source
// of truth ProtectedRoute checks so a recovery session can never slip
// through to a worker/admin home without the password actually being set.
// sessionStorage (not React state) so it survives a reload of this tab.
const PENDING_KEY = 'crewclock:pending-password-setup'

export function markPendingPasswordSetup() {
  try {
    sessionStorage.setItem(PENDING_KEY, '1')
  } catch {
    // sessionStorage unavailable — falls back to the URL-based check only.
  }
}

export function isPendingPasswordSetup(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return false
  }
}

export function clearPendingPasswordSetup() {
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // Nothing to clean up if storage isn't available.
  }
}
