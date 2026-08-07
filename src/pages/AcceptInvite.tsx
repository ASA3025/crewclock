// Landing spot for Supabase invite (and password recovery) links.
//
// Supabase redirects here with an access/refresh token in the URL hash
// (or a `type=invite`/`type=recovery` query param, depending on flow).
// supabase-js's detectSessionInUrl picks the token up automatically and
// turns it into a real session before AuthContext's loading flag clears —
// see AuthContext.tsx — so by the time this renders, `session`/`appUser`
// already reflect the invited user, and all this page has to do is collect
// a password and hand them off to their role's home page.

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { PasswordStrengthField } from '../components/PasswordStrengthField'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { clearPendingPasswordSetup, getAuthRedirectType } from '../lib/authRedirect'
import { meetsPasswordRequirements } from '../utils/passwordStrength'

export function AcceptInvite() {
  const { session, appUser, loading } = useAuth()
  const navigate = useNavigate()
  // Captured once on first render, same reasoning as isAuthRedirectUrl in
  // App.tsx — supabase-js clears the type param from the URL once it's
  // done processing the token.
  const [redirectType] = useState(getAuthRedirectType)
  const isRecovery = redirectType === 'recovery'
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!meetsPasswordRequirements(password)) {
      setError('Password does not meet the requirements above.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setSubmitting(false)
      return
    }

    // Only now is it safe to let ProtectedRoute treat this session as a
    // normal login — see authRedirect.ts and ProtectedRoute.tsx.
    clearPendingPasswordSetup()
    navigate(appUser?.role === 'admin' ? '/admin/overview' : '/worker/home', { replace: true })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="font-body text-sm text-muted-fg">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-heading text-xl font-bold text-fg">This link has expired</h1>
          <p className="mt-2 text-sm text-muted-fg">
            {isRecovery
              ? 'Password reset links only work once and expire after a while. Request a new one from the login screen.'
              : 'Invite links only work once and expire after a while. Ask your admin to send a new invite, or log in if you already have a password.'}
          </p>
          <Button className="mt-6" onClick={() => navigate('/', { replace: true })}>
            Back to log in
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="font-heading text-lg font-bold text-navy">Crewclock</span>
          <h1 className="mt-3 font-heading text-xl font-bold text-fg">
            {isRecovery ? 'Reset your password' : 'Set your password'}
          </h1>
          <p className="mt-2 text-sm text-muted-fg">
            {isRecovery
              ? 'Choose a new password for your account.'
              : `${appUser?.name ? `Welcome, ${appUser.name}. ` : ''}Choose a password to finish setting up your account.`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <PasswordStrengthField
            id="password"
            label="New password"
            value={password}
            onChange={setPassword}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-fg">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-fg outline-none transition-colors duration-150 focus:border-accent"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            fullWidth
            disabled={submitting || !meetsPasswordRequirements(password)}
          >
            {submitting
              ? 'Saving…'
              : isRecovery
                ? 'Update password & continue'
                : 'Set password & continue'}
          </Button>
        </form>
      </div>
    </div>
  )
}
