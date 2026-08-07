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

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) {
        setAppUser(await fetchAppUser(data.session.user.id))
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // Fires when a password recovery link is opened — the session it
      // creates is fully valid immediately, before a new password has
      // actually been set. This flag is what stops that session from
      // being treated as a normal login anywhere else in the app (see
      // ProtectedRoute) — the URL-based check in App.tsx only catches the
      // very first render, not e.g. a later reload of the reset screen.
      if (event === 'PASSWORD_RECOVERY') {
        markPendingPasswordSetup()
      }

      setSession(newSession)
      if (newSession) {
        setAppUser(await fetchAppUser(newSession.user.id))
      } else {
        setAppUser(null)
      }
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
