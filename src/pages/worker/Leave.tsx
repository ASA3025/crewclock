import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { StatusPill } from '../../components/StatusPill'
import { formatNzDate, nzDateIso } from '../../utils/datetime'
import type { LeaveRequest, LeaveStatus } from '../../types'

export function WorkerLeave() {
  const { appUser } = useAuth()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<LeaveStatus | 'all'>('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!appUser) return
    setLoading(true)

    let query = supabase.from('leave_requests').select('*').eq('user_id', appUser.id)

    if (status !== 'all') query = query.eq('status', status)
    if (filterFrom) query = query.gte('start_date', filterFrom)
    if (filterTo) query = query.lte('start_date', filterTo)
    query = query.order('start_date', { ascending: false })

    const { data } = await query
    setRequests((data as LeaveRequest[]) ?? [])
    setLoading(false)
  }, [appUser, status, filterFrom, filterTo])

  useEffect(() => {
    load()
  }, [load])

  function openForm() {
    const today = nzDateIso()
    setStartDate(today)
    setEndDate(today)
    setReason('')
    setError(null)
    setFormOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: fnError } = await supabase.functions.invoke('submit-leave-request', {
      body: {
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || null,
        site_url: window.location.origin,
      },
    })

    setSubmitting(false)
    if (fnError) {
      setError(fnError.message)
      return
    }

    setFormOpen(false)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Leave"
        subtitle="Request time off and track approvals"
        action={
          <Button size="md" icon={<Plus size={16} />} onClick={openForm}>
            Request leave
          </Button>
        }
      />

      <div className="flex flex-col gap-3 p-4">
        <Card className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LeaveStatus | 'all')}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            />
          </div>
          {(filterFrom || filterTo) && (
            <button
              onClick={() => {
                setFilterFrom('')
                setFilterTo('')
              }}
              className="h-10 cursor-pointer text-xs font-medium text-accent hover:underline"
            >
              Clear dates
            </button>
          )}
        </Card>

        {loading && <p className="text-sm text-muted-fg">Loading…</p>}
        {!loading && requests.length === 0 && (
          <p className="text-sm text-muted-fg">No leave requests match these filters.</p>
        )}

        {requests.map((r) => (
          <Card key={r.id} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-fg">
                {r.start_date === r.end_date
                  ? formatNzDate(r.start_date, { weekday: 'short', day: 'numeric', month: 'short' })
                  : `${formatNzDate(r.start_date, { day: 'numeric', month: 'short' })} – ${formatNzDate(r.end_date, { day: 'numeric', month: 'short' })}`}
              </p>
              <StatusPill
                tone={r.status === 'approved' ? 'success' : r.status === 'denied' ? 'destructive' : 'muted'}
              >
                {r.status === 'approved' ? 'Approved' : r.status === 'denied' ? 'Denied' : 'Pending'}
              </StatusPill>
            </div>
            {r.reason && <p className="text-sm text-muted-fg">{r.reason}</p>}
          </Card>
        ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Request leave">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium text-fg" htmlFor="leave-start">
                From
              </label>
              <input
                id="leave-start"
                type="date"
                required
                value={startDate}
                min={nzDateIso()}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (endDate < e.target.value) setEndDate(e.target.value)
                }}
                className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium text-fg" htmlFor="leave-end">
                To
              </label>
              <input
                id="leave-end"
                type="date"
                required
                value={endDate}
                min={startDate || nzDateIso()}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-fg" htmlFor="leave-reason">
              Reason (optional)
            </label>
            <textarea
              id="leave-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Family trip"
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-fg outline-none transition-colors duration-150 focus:border-accent"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Sending…' : 'Send request'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
