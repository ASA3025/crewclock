import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { clearPendingPasswordSetup, markPendingPasswordSetup } from '../lib/authRedirect'
import type { AppUser } from '../types'

interface AuthContextValue {
  session: Session | null
  appUser: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function fetchAppUser(authId: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', authId)
    .single()

  if (error) {
    console.error('Failed to load app user profile:', error.message)
    return null
  }

  return data as AppUser
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    // onAuthStateChange fires its own 'INITIAL_SESSION' event on
    // subscribe — using it as the *only* source of truth (instead of also
    // calling getSession() separately, as this used to) avoids two
    // independent fetchAppUser() calls racing on every mount. That race
    // was a real bug, not just a mobile quirk: whichever of the two HTTP
    // requests happened to resolve last won unconditionally, so a stale
    // or transiently-failed one could clobber a fresh, correct one and
    // leave appUser null despite session being perfectly valid — which
    // ProtectedRoute then reads as logged-out. eventId guards the same
    // failure mode for any two auth events firing in quick succession
    // (e.g. INITIAL_SESSION immediately followed by TOKEN_REFRESHED): a
    // slower, older event's fetchAppUser result is discarded if a newer
    // event has since started.
    let latestEventId = 0

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!active) return

      // Fires when a password recovery link is opened — the session it
      // creates is fully valid immediately, before a new password has
      // actually been set. This flag is what stops that session from
      // being treated as a normal login anywhere else in the app (see
      // ProtectedRoute) — the URL-based check in App.tsx only catches the
      // very first render, not e.g. a later reload of the reset screen.
      if (event === 'PASSWORD_RECOVERY') {
        markPendingPasswordSetup()
      }

      const eventId = ++latestEventId
      setSession(newSession)

      const profile = newSession ? await fetchAppUser(newSession.user.id) : null
      if (!active || eventId !== latestEventId) return

      setAppUser(profile)
      setLoading(false)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearPendingPasswordSetup()
  }

  return (
    <AuthContext.Provider value={{ session, appUser, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
