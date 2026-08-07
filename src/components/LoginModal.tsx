import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from './Modal'
import { Button } from './Button'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { clearAttempts, getLockoutRemainingMs, recordFailedAttempt } from '../utils/loginLockout'

export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lockoutMs, setLockoutMs] = useState(0)
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // Reset to a clean slate each time the modal is closed, so reopening it
  // doesn't leave the user stuck on "forgot password" or a stale error.
  useEffect(() => {
    if (open) return
    setMode('login')
    setPassword('')
    setError(null)
    setResetSent(false)
  }, [open])

  // Lockout is per-email (see utils/loginLockout), so re-check whenever the
  // typed email changes — including a live countdown while it's active.
  useEffect(() => {
    setLockoutMs(getLockoutRemainingMs(email))
  }, [email])

  useEffect(() => {
    if (lockoutMs <= 0) return
    const id = setTimeout(() => setLockoutMs((ms) => Math.max(ms - 1000, 0)), 1000)
    return () => clearTimeout(id)
  }, [lockoutMs])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (lockoutMs > 0) return
    setSubmitting(true)

    const { error: signInError } = await signIn(email, password)
    if (signInError) {
      const { lockoutMs: newLockoutMs, attemptsLeft } = recordFailedAttempt(email)
      setSubmitting(false)
      if (newLockoutMs > 0) {
        setLockoutMs(newLockoutMs)
      } else if (attemptsLeft <= 2) {
        setError(`${signInError} — ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left before a temporary lockout.`)
      } else {
        setError(signInError)
      }
      return
    }

    clearAttempts(email)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('Something went wrong. Try again.')
      setSubmitting(false)
      return
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    setSubmitting(false)
    onClose()
    navigate(profile?.role === 'admin' ? '/admin/overview' : '/worker/home')
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault()
    setResetSubmitting(true)
    await supabase.auth.resetPasswordForEmail(email)
    setResetSubmitting(false)
    // Show the same confirmation whether or not the email is registered —
    // don't let this form reveal which emails have accounts.
    setResetSent(true)
  }

  const lockoutSeconds = Math.ceil(lockoutMs / 1000)

  if (mode === 'forgot') {
    return (
      <Modal open={open} onClose={onClose} title="Reset password">
        <form onSubmit={handleForgotSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="forgot-email" className="text-sm font-medium text-fg">
              Email
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-fg outline-none transition-colors duration-150 focus:border-accent"
            />
          </div>

          {resetSent ? (
            <p className="text-sm text-fg">
              If an account exists for that email, we've sent a link to reset the password. Check
              your inbox.
            </p>
          ) : (
            <Button type="submit" fullWidth disabled={resetSubmitting}>
              {resetSubmitting ? 'Sending…' : 'Send reset link'}
            </Button>
          )}

          <button
            type="button"
            onClick={() => {
              setMode('login')
              setResetSent(false)
            }}
            className="self-start text-xs font-medium text-accent hover:underline"
          >
            Back to log in
          </button>
        </form>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Log in">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-fg">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-fg outline-none transition-colors duration-150 focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-fg">
              Password
            </label>
            <button
              type="button"
              onClick={() => setMode('forgot')}
              className="text-xs font-medium text-accent hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-fg outline-none transition-colors duration-150 focus:border-accent"
          />
        </div>
        {lockoutMs > 0 && (
          <p role="alert" className="text-sm text-destructive">
            Too many failed attempts. Try again in {lockoutSeconds}s.
          </p>
        )}
        {error && lockoutMs <= 0 && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth disabled={submitting || lockoutMs > 0}>
          {lockoutMs > 0 ? `Locked — ${lockoutSeconds}s` : submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </Modal>
  )
}
