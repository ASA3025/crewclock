import { useEffect, useState } from 'react'
import { ChatText, Check, MapPin, PencilSimple, Trash, Warning, X } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { StatusPill } from '../../components/StatusPill'
import { estimateGross, formatCurrency, formatHours, isStaleOpenShift, shiftHours } from '../../utils/pay'
import {
  formatNzDate,
  formatNzTime,
  nzDateIso,
  nzDatetimeLocalToInstant,
  nzDatetimeLocalValue,
  nzEndOfDayInstant,
  nzStartOfDayInstant,
  nzStartOfMonthIso,
} from '../../utils/datetime'
import { isNzPublicHoliday } from '../../utils/nzPublicHolidays'
import type { AppUser, ShiftWithWorker } from '../../types'

export function AdminHours() {
  const { appUser } = useAuth()
  const [shifts, setShifts] = useState<ShiftWithWorker[]>([])
  const [workers, setWorkers] = useState<AppUser[]>([])
  const [from, setFrom] = useState(nzStartOfMonthIso())
  const [to, setTo] = useState(nzDateIso())
  const [workerFilter, setWorkerFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editIn, setEditIn] = useState('')
  const [editOut, setEditOut] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ShiftWithWorker | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [photoTarget, setPhotoTarget] = useState<string | null>(null)
  const [noteTarget, setNoteTarget] = useState<string | null>(null)
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkApproving, setBulkApproving] = useState(false)

  async function load() {
    if (!appUser) return
    setLoading(true)
    setSelectedIds(new Set())
    let query = supabase
      .from('shifts')
      .select('*, users(id, name, email, hourly_rate)')
      .eq('business_id', appUser.business_id)
      .gte('clock_in_time', nzStartOfDayInstant(from))
      .lte('clock_in_time', nzEndOfDayInstant(to))
      .order('clock_in_time', { ascending: false })

    if (workerFilter !== 'all') query = query.eq('user_id', workerFilter)

    const { data } = await query
    setShifts((data as ShiftWithWorker[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!appUser) return
    supabase
      .from('users')
      .select('*')
      .eq('business_id', appUser.business_id)
      .eq('role', 'worker')
      .order('name')
      .then(({ data }) => setWorkers((data as AppUser[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser, from, to, workerFilter])

  // Reverse-geocode any visible shift that has GPS but no cached address
  // yet — one at a time with a delay between calls, to stay well under
  // Nominatim's ~1 request/second fair-use limit (see reverse-geocode
  // Edge Function). Each result is cached on the shift row server-side,
  // so this only ever runs once per shift, not on every page view.
  useEffect(() => {
    const pending = shifts.filter(
      (s) => s.gps_lat != null && s.gps_lng != null && !s.address && !resolvedAddresses[s.id]
    )
    if (pending.length === 0) return

    let cancelled = false

    async function processQueue() {
      for (const shift of pending) {
        if (cancelled) return
        const { data, error } = await supabase.functions.invoke('reverse-geocode', {
          body: { shift_id: shift.id },
        })
        if (!cancelled && !error && data?.address) {
          setResolvedAddresses((prev) => ({ ...prev, [shift.id]: data.address }))
        }
        if (!cancelled) await new Promise((resolve) => setTimeout(resolve, 1100))
      }
    }

    processQueue()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts])

  async function approveShift(shift: ShiftWithWorker) {
    await supabase
      .from('shifts')
      .update({ approved: !shift.approved, rejected: false })
      .eq('id', shift.id)
    load()
  }

  async function rejectShift(shift: ShiftWithWorker) {
    await supabase
      .from('shifts')
      .update({ approved: false, rejected: !shift.rejected })
      .eq('id', shift.id)
    load()
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === shifts.length ? new Set() : new Set(shifts.map((s) => s.id))))
  }

  async function approveSelected() {
    if (selectedIds.size === 0) return
    setBulkApproving(true)
    await supabase
      .from('shifts')
      .update({ approved: true, rejected: false })
      .in('id', Array.from(selectedIds))
    setBulkApproving(false)
    load()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('shifts').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
    load()
  }

  // Rejected shifts are excluded from payroll totals — they won't be paid.
  const payableShifts = shifts.filter((s) => !s.rejected)
  const totalHours = payableShifts.reduce((sum, s) => sum + shiftHours(s), 0)
  const totalGross = payableShifts.reduce(
    (sum, s) => sum + estimateGross(shiftHours(s), s.users.hourly_rate),
    0
  )

  function startEdit(shift: ShiftWithWorker) {
    setEditingId(shift.id)
    setEditIn(nzDatetimeLocalValue(shift.clock_in_time))
    setEditOut(nzDatetimeLocalValue(shift.clock_out_time))
  }

  async function saveEdit(shift: ShiftWithWorker) {
    await supabase
      .from('shifts')
      .update({
        clock_in_time: nzDatetimeLocalToInstant(editIn),
        clock_out_time: editOut ? nzDatetimeLocalToInstant(editOut) : null,
      })
      .eq('id', shift.id)
    setEditingId(null)
    load()
  }

  return (
    <div>
      <PageHeader title="Hours" subtitle="Review, edit, and approve worker hours" />

      <div className="flex flex-col gap-4 p-4 md:p-8">
        <Card className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">Worker</label>
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            >
              <option value="all">All workers</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:max-w-md">
          <Card>
            <p className="text-xs font-medium text-muted-fg">Hours in range</p>
            <p className="mt-1 font-heading text-2xl font-extrabold text-fg">
              {formatHours(totalHours)}
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-muted-fg">Est. gross — before tax</p>
            <p className="mt-1 font-heading text-2xl font-extrabold text-fg">
              {formatCurrency(totalGross)}
            </p>
          </Card>
        </div>

        {selectedIds.size > 0 && (
          <Card className="flex items-center justify-between gap-3 !bg-navy text-navy-fg">
            <p className="text-sm font-medium">{selectedIds.size} selected</p>
            <div className="flex items-center gap-2">
              <Button
                size="md"
                variant="secondary"
                className="h-9 px-3 text-xs"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
              <Button size="md" className="h-9 px-3 text-xs" onClick={approveSelected} disabled={bulkApproving}>
                {bulkApproving ? 'Approving…' : `Approve selected (${selectedIds.size})`}
              </Button>
            </div>
          </Card>
        )}

        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-fg">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={shifts.length > 0 && selectedIds.size === shifts.length}
                    onChange={toggleSelectAll}
                    className="cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">Worker</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Clock in</th>
                <th className="px-4 py-3">Clock out</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Photo</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Est. pay</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={12} className="px-4 py-6 text-center text-muted-fg">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && shifts.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-6 text-center text-muted-fg">
                    No shifts in this range.
                  </td>
                </tr>
              )}
              {shifts.map((shift) => (
                <tr key={shift.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select shift for ${shift.users.name}`}
                      checked={selectedIds.has(shift.id)}
                      onChange={() => toggleSelected(shift.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-fg">{shift.users.name}</td>
                  <td className="px-4 py-3 text-muted-fg">
                    {formatNzDate(shift.clock_in_time, { day: 'numeric', month: 'short' })}
                  </td>
                  {editingId === shift.id ? (
                    <>
                      <td className="px-4 py-3">
                        <input
                          type="datetime-local"
                          value={editIn}
                          onChange={(e) => setEditIn(e.target.value)}
                          className="h-9 rounded-md border border-border px-2 text-xs"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="datetime-local"
                          value={editOut}
                          onChange={(e) => setEditOut(e.target.value)}
                          className="h-9 rounded-md border border-border px-2 text-xs"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-muted-fg">{formatNzTime(shift.clock_in_time)}</td>
                      <td className="px-4 py-3 text-muted-fg">
                        {shift.clock_out_time ? (
                          formatNzTime(shift.clock_out_time)
                        ) : isStaleOpenShift(shift) ? (
                          <span className="flex items-center gap-1 text-destructive">
                            <Warning size={13} weight="fill" /> Still open
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-muted-fg">{formatHours(shiftHours(shift))}</td>
                  <td className="px-4 py-3">
                    {shift.gps_lat != null && shift.gps_lng != null ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-fg">
                          {shift.address ?? resolvedAddresses[shift.id] ?? (
                            <span className="italic text-muted-fg">Looking up address…</span>
                          )}
                        </span>
                        <a
                          href={`https://www.google.com/maps?q=${shift.gps_lat},${shift.gps_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <MapPin size={12} /> View map
                        </a>
                      </div>
                    ) : (
                      <span className="text-muted-fg">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {shift.photo_url ? (
                      <button
                        onClick={() => setPhotoTarget(shift.photo_url)}
                        aria-label="View shift photo"
                        className="block cursor-pointer overflow-hidden rounded-md border border-border"
                      >
                        <img
                          src={shift.photo_url}
                          alt="Shift attachment thumbnail"
                          className="h-10 w-10 object-cover"
                        />
                      </button>
                    ) : (
                      <span className="text-muted-fg">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {shift.note ? (
                      <button
                        onClick={() => setNoteTarget(shift.note)}
                        aria-label="View shift note"
                        className="cursor-pointer rounded-md p-2 text-muted-fg transition-colors duration-150 hover:bg-muted hover:text-accent"
                      >
                        <ChatText size={16} />
                      </button>
                    ) : (
                      <span className="text-muted-fg">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-fg">
                    <p>{formatCurrency(estimateGross(shiftHours(shift), shift.users.hourly_rate))}</p>
                    {isNzPublicHoliday(shift.clock_in_time) && (
                      <p
                        className="mt-0.5 flex items-center gap-1 text-xs text-warning"
                        title="This shift falls on a public holiday — actual pay may differ from this estimate."
                      >
                        <Warning size={11} weight="fill" /> Public holiday
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      tone={shift.rejected ? 'destructive' : shift.approved ? 'success' : 'muted'}
                    >
                      {shift.rejected ? 'Rejected' : shift.approved ? 'Approved' : 'Pending'}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {editingId === shift.id ? (
                        <Button size="md" className="h-8 px-3 text-xs" onClick={() => saveEdit(shift)}>
                          Save
                        </Button>
                      ) : (
                        <button
                          onClick={() => startEdit(shift)}
                          aria-label="Edit shift"
                          className="cursor-pointer rounded-md p-2 text-muted-fg transition-colors duration-150 hover:bg-muted hover:text-fg"
                        >
                          <PencilSimple size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => approveShift(shift)}
                        aria-label={shift.approved ? 'Unapprove shift' : 'Approve shift'}
                        className={`cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-muted hover:text-success ${
                          shift.approved ? 'text-success' : 'text-muted-fg'
                        }`}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => rejectShift(shift)}
                        aria-label={shift.rejected ? 'Unreject shift' : 'Reject shift'}
                        className={`cursor-pointer rounded-md p-2 transition-colors duration-150 hover:bg-muted hover:text-destructive ${
                          shift.rejected ? 'text-destructive' : 'text-muted-fg'
                        }`}
                      >
                        <X size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(shift)}
                        aria-label="Delete shift"
                        className="cursor-pointer rounded-md p-2 text-muted-fg transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={deleteTarget != null} onClose={() => setDeleteTarget(null)} title="Delete shift">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg">
            Delete this shift for{' '}
            <span className="font-semibold">{deleteTarget?.users.name}</span> on{' '}
            {deleteTarget && formatNzDate(deleteTarget.clock_in_time, { day: 'numeric', month: 'short' })}?
            This permanently removes it from their hours. This can't be undone.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" fullWidth onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete shift'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={photoTarget != null}
        onClose={() => setPhotoTarget(null)}
        title="Shift photo"
        className="!max-w-2xl"
      >
        {photoTarget && (
          <img
            src={photoTarget}
            alt="Shift attachment"
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        )}
      </Modal>

      <Modal open={noteTarget != null} onClose={() => setNoteTarget(null)} title="Shift note">
        <p className="text-sm whitespace-pre-wrap text-fg">{noteTarget}</p>
      </Modal>
    </div>
  )
}
