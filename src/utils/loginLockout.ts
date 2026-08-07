// Client-side login-attempt lockout. This is a UX safeguard against
// fumbled retries, not a security boundary — it's backed by localStorage,
// so it's scoped per-browser and can be cleared by the user. Supabase Auth
// has its own server-side rate limiting underneath regardless.
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60_000

interface AttemptState {
  count: number
  lockedUntil: number | null
}

function storageKey(email: string): string {
  return `crewclock:login-attempts:${email.trim().toLowerCase()}`
}

function readState(email: string): AttemptState {
  try {
    const raw = localStorage.getItem(storageKey(email))
    const state = raw ? (JSON.parse(raw) as AttemptState) : { count: 0, lockedUntil: null }
    // Cooldown has passed — treat as a fresh start rather than staying locked forever.
    if (state.lockedUntil && state.lockedUntil <= Date.now()) {
      return { count: 0, lockedUntil: null }
    }
    return state
  } catch {
    return { count: 0, lockedUntil: null }
  }
}

function writeState(email: string, state: AttemptState) {
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(state))
  } catch {
    // localStorage unavailable (private browsing, storage full) — lockout
    // just won't persist across reloads, which is an acceptable fallback.
  }
}

export function getLockoutRemainingMs(email: string): number {
  if (!email) return 0
  const { lockedUntil } = readState(email)
  return lockedUntil ? Math.max(lockedUntil - Date.now(), 0) : 0
}

export function recordFailedAttempt(email: string): { lockoutMs: number; attemptsLeft: number } {
  const state = readState(email)
  const count = state.count + 1
  const lockedUntil = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null
  writeState(email, { count, lockedUntil })
  return {
    lockoutMs: lockedUntil ? lockedUntil - Date.now() : 0,
    attemptsLeft: Math.max(MAX_ATTEMPTS - count, 0),
  }
}

export function clearAttempts(email: string) {
  try {
    localStorage.removeItem(storageKey(email))
  } catch {
    // Nothing to clean up if storage isn't available.
  }
}
