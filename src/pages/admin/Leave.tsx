import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { StatusPill } from '../../components/StatusPill'
import { formatNzDate } from '../../utils/datetime'
import type { LeaveRequestWithWorker, LeaveStatus } from '../../types'

export function AdminLeave() {
  const { appUser } = useAuth()
  const [requests, setRequests] = useState<LeaveRequestWithWorker[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<LeaveStatus | 'all'>('pending')
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!appUser) return
    setLoading(true)

    let query = supabase
      .from('leave_requests')
      .select('*, users(id, name)')
      .eq('business_id', appUser.business_id)

    if (status !== 'all') query = query.eq('status', status)
    query = query.order('start_date', { ascending: true })

    const { data } = await query
    setRequests((data as LeaveRequestWithWorker[]) ?? [])
    setLoading(false)
  }, [appUser, status])

  useEffect(() => {
    load()
  }, [load])

  async function decide(request: LeaveRequestWithWorker, decision: 'approved' | 'denied') {
    setError(null)
    setDecidingId(request.id)

    const { error: fnError } = await supabase.functions.invoke('decide-leave-request', {
      body: {
        leave_request_id: request.id,
        decision,
        site_url: window.location.origin,
      },
    })

    setDecidingId(null)
    if (fnError) {
      setError(fnError.message)
      return
    }

    load()
  }

  return (
    <div>
      <PageHeader title="Leave" subtitle="Review and decide time-off requests" />

      <div className="flex flex-col gap-4 p-4 md:p-8">
        <Card className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LeaveStatus | 'all')}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
              <option value="all">All</option>
            </select>
          </div>
        </Card>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {loading && <p className="text-sm text-muted-fg">Loading…</p>}
          {!loading && requests.length === 0 && (
            <p className="text-sm text-muted-fg">No leave requests match this filter.</p>
          )}
          {requests.map((r) => (
            <Card key={r.id} className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-fg">{r.users.name}</p>
                  <StatusPill
                    tone={
                      r.status === 'approved' ? 'success' : r.status === 'denied' ? 'destructive' : 'muted'
                    }
                  >
                    {r.status === 'approved' ? 'Approved' : r.status === 'denied' ? 'Denied' : 'Pending'}
                  </StatusPill>
                </div>
                <p className="mt-1 text-sm text-fg">
                  {r.start_date === r.end_date
                    ? formatNzDate(r.start_date, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : `${formatNzDate(r.start_date, { day: 'numeric', month: 'short' })} – ${formatNzDate(
                        r.end_date,
                        { day: 'numeric', month: 'short', year: 'numeric' }
                      )}`}
                </p>
                {r.reason && <p className="mt-1 text-sm text-muted-fg">{r.reason}</p>}
              </div>
              {r.status === 'pending' && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="md"
                    variant="secondary"
                    className="h-8 px-3 text-xs"
                    disabled={decidingId === r.id}
                    onClick={() => decide(r, 'denied')}
                  >
                    Deny
                  </Button>
                  <Button
                    size="md"
                    className="h-8 px-3 text-xs"
                    disabled={decidingId === r.id}
                    onClick={() => decide(r, 'approved')}
                  >
                    Approve
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
