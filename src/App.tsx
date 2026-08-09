import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { WorkerLayout } from './components/WorkerLayout'
import { AdminLayout } from './components/AdminLayout'
import { Landing } from './pages/Landing'
import { Privacy } from './pages/Privacy'
import { Terms } from './pages/Terms'
import { AcceptInvite } from './pages/AcceptInvite'
import { isAuthRedirectUrl, isPendingPasswordSetup, markPendingPasswordSetup } from './lib/authRedirect'
import { WorkerHome } from './pages/worker/Home'
import { WorkerHoursHistory } from './pages/worker/HoursHistory'
import { WorkerRoster } from './pages/worker/Roster'
import { WorkerNotes } from './pages/worker/Notes'
import { AdminOverview } from './pages/admin/Overview'
import { AdminHours } from './pages/admin/Hours'
import { AdminRosterBuilder } from './pages/admin/RosterBuilder'
import { AdminExport } from './pages/admin/Export'
import { AdminWorkers } from './pages/admin/Workers'
import { AdminFlags } from './pages/admin/Flags'

// Supabase invite/recovery links redirect to the site root with a token in
// the URL hash, so `/` has to decide between the marketing page and the
// set-password page. The URL check must happen on first render, before
// supabase-js's own URL processing consumes and clears the hash — and it
// also marks the durable "pending" flag ProtectedRoute relies on, so a
// recovery session can't slip past this page on a later render.
function RootRoute() {
  const [isAuthRedirect] = useState(() => {
    if (isAuthRedirectUrl()) {
      markPendingPasswordSetup()
      return true
    }
    return isPendingPasswordSetup()
  })
  const { session, appUser, loading } = useAuth()

  if (isAuthRedirect) return <AcceptInvite />

  // A normal (non-recovery) session that's already valid should never be
  // stranded here — without this, any transient moment where a protected
  // route bounced to "/" (a slow network on wake, a momentary auth-state
  // hiccup — see AuthContext) left the user looking permanently logged
  // out even once the real session resolved fine, since nothing ever
  // sent them back to where they belonged.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="font-body text-sm text-muted-fg">Loading…</p>
      </div>
    )
  }
  if (session && appUser) {
    return <Navigate to={appUser.role === 'admin' ? '/admin/overview' : '/worker/home'} replace />
  }

  return <Landing />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />

          <Route element={<ProtectedRoute role="worker" />}>
            <Route element={<WorkerLayout />}>
              <Route path="/worker/home" element={<WorkerHome />} />
              <Route path="/worker/hours" element={<WorkerHoursHistory />} />
              <Route path="/worker/roster" element={<WorkerRoster />} />
              <Route path="/worker/notes" element={<WorkerNotes />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute role="admin" />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin/overview" element={<AdminOverview />} />
              <Route path="/admin/hours" element={<AdminHours />} />
              <Route path="/admin/roster" element={<AdminRosterBuilder />} />
              <Route path="/admin/export" element={<AdminExport />} />
              <Route path="/admin/workers" element={<AdminWorkers />} />
              <Route path="/admin/flags" element={<AdminFlags />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
