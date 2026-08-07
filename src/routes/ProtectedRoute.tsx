import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isPendingPasswordSetup } from '../lib/authRedirect'
import type { Role } from '../types'

export function ProtectedRoute({ role }: { role: Role }) {
  const { session, appUser, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="font-body text-sm text-muted-fg">Loading…</p>
      </div>
    )
  }

  if (!session || !appUser) {
    return <Navigate to="/" replace />
  }

  // An invite/recovery session is fully valid the moment it's created —
  // before a password has actually been set. Without this check, a
  // pending session could reach a worker/admin home directly (e.g. on a
  // reload) and skip the set-password step entirely. Sending it back to
  // `/` routes through RootRoute, which shows AcceptInvite for exactly
  // this case.
  if (isPendingPasswordSetup()) {
    return <Navigate to="/" replace />
  }

  if (appUser.role !== role) {
    return <Navigate to={appUser.role === 'admin' ? '/admin/overview' : '/worker/home'} replace />
  }

  return <Outlet />
}
