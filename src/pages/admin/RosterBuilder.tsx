import { useEffect, useState } from 'react'
import { CaretLeft, CaretRight, Trash, Plus, Warning, Gear, PencilSimple, Check, X } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { formatNzDate, formatShiftTimeRange, nzDateIso } from '../../utils/datetime'
import { isNzPublicHoliday } from '../../utils/nzPublicHolidays'
import type { AppUser, LeaveRequest, RosterEntryWithWorker, WorkType } from '../../types'

function startOfWeek(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export function AdminRosterBuilder() {
  const { appUser } = useAuth()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [entries, setEntries] = useState<RosterEntryWithWorker[]>([])
  const [workers, setWorkers] = useState<AppUser[]>([])
  const [formDay, setFormDay] = useState<string | null>(null)
  const [formWorker, setFormWorker] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formStartTime, setFormStartTime] = useState('')
  const [formEndTime, setFormEndTime] = useState('')
  const [formWorkType, setFormWorkType] = useState('')
  const [approvedLeave, setApprovedLeave] = useState<LeaveRequest[]>([])
  const [workTypes, setWorkTypes] = useState<WorkType[]>([])
  const [manageOpen, setManageOpen] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null)
  const [editingTypeName, setEditingTypeName] = useState('')

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const weekEnd = days[6]

  async function load() {
    if (!appUser) return
    const [entriesRes, leaveRes] = await Promise.all([
      supabase
        .from('roster_entries')
        .select('*, users(id, name)')
        .eq('business_id', appUser.business_id)
        .gte('date', nzDateIso(weekStart))
        .lte('date', nzDateIso(weekEnd))
        .order('date'),
      // Only need overlap with the visible week: a leave request overlaps
      // if it starts on or before the week ends and ends on or after the
      // week starts — the usual date-range-overlap check.
      supabase
        .from('leave_requests')
        .select('*')
        .eq('business_id', appUser.business_id)
        .eq('status', 'approved')
        .lte('start_date', nzDateIso(weekEnd))
        .gte('end_date', nzDateIso(weekStart)),
    ])
    setEntries((entriesRes.data as RosterEntryWithWorker[]) ?? [])
    setApprovedLeave((leaveRes.data as LeaveRequest[]) ?? [])
  }

  function approvedLeaveFor(userId: string, dayIso: string): boolean {
    return approvedLeave.some(
      (l) => l.user_id === userId && l.start_date <= dayIso && l.end_date >= dayIso
    )
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

  function loadWorkTypes() {
    if (!appUser) return
    supabase
      .from('work_types')
      .select('*')
      .eq('business_id', appUser.business_id)
      .order('name')
      .then(({ data }) => setWorkTypes((data as WorkType[]) ?? []))
  }

  useEffect(() => {
    loadWorkTypes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser, weekStart])

  async function addWorkType() {
    if (!appUser || !newTypeName.trim()) return
    await supabase
      .from('work_types')
      .insert({ business_id: appUser.business_id, name: newTypeName.trim() })
    setNewTypeName('')
    loadWorkTypes()
  }

  function startEditType(wt: WorkType) {
    setEditingTypeId(wt.id)
    setEditingTypeName(wt.name)
  }

  async function saveEditType() {
    if (!editingTypeId || !editingTypeName.trim()) return
    await supabase
      .from('work_types')
      .update({ name: editingTypeName.trim() })
      .eq('id', editingTypeId)
    setEditingTypeId(null)
    loadWorkTypes()
  }

  async function deleteWorkType(id: string) {
    await supabase.from('work_types').delete().eq('id', id)
    loadWorkTypes()
  }

  function openForm(dayIso: string) {
    setFormDay(dayIso)
    setFormWorker(workers[0]?.id ?? '')
    setFormLocation('')
    setFormStartTime('')
    setFormEndTime('')
    setFormWorkType('')
  }

  async function addEntry() {
    if (!appUser || !formDay || !formWorker || !formLocation.trim()) return
    await supabase.from('roster_entries').insert({
      business_id: appUser.business_id,
      user_id: formWorker,
      date: formDay,
      location_label: formLocation.trim(),
      work_type: formWorkType || null,
      start_time: formStartTime || null,
      end_time: formEndTime || null,
    })
    setFormDay(null)
    load()
  }

  async function removeEntry(id: string) {
    await supabase.from('roster_entries').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Roster"
        subtitle="Assign the crew to days and locations"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart((d) => new Date(d.getTime() - 7 * 86400000))}
              aria-label="Previous week"
              className="cursor-pointer rounded-md p-2 hover:bg-muted"
            >
              <CaretLeft size={18} />
            </button>
            <span className="text-sm font-medium text-fg">
              {formatNzDate(weekStart, { day: 'numeric', month: 'short' })} –{' '}
              {formatNzDate(weekEnd, { day: 'numeric', month: 'short' })}
            </span>
            <button
              onClick={() => setWeekStart((d) => new Date(d.getTime() + 7 * 86400000))}
              aria-label="Next week"
              className="cursor-pointer rounded-md p-2 hover:bg-muted"
            >
              <CaretRight size={18} />
            </button>
          </div>
        }
      />

      <div className="flex justify-end px-4 pt-4 md:px-8 md:pt-8">
        <button
          onClick={() => setManageOpen(true)}
          className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          <Gear size={14} /> Manage work types
        </button>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-7 md:p-8">
        {days.map((day) => {
          const dayIso = nzDateIso(day)
          const dayEntries = entries.filter((e) => e.date === dayIso)
          return (
            <Card key={dayIso} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
                {formatNzDate(day, { weekday: 'short', day: 'numeric' })}
              </p>
              {isNzPublicHoliday(dayIso) && (
                <p
                  className="-mt-1 flex items-center gap-1 text-[11px] text-warning"
                  title="This day is an NZ public holiday — pay may differ from the standard estimate."
                >
                  <Warning size={11} weight="fill" /> Public holiday
                </p>
              )}

              {dayEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-fg">{entry.users.name}</p>
                    <p className="text-xs text-muted-fg">{entry.location_label}</p>
                    {entry.work_type && (
                      <p className="text-xs text-accent">{entry.work_type}</p>
                    )}
                    {formatShiftTimeRange(entry.start_time, entry.end_time) && (
                      <p className="text-xs text-muted-fg">
                        {formatShiftTimeRange(entry.start_time, entry.end_time)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    aria-label="Remove roster entry"
                    className="cursor-pointer rounded-md p-1 text-muted-fg hover:text-destructive"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}

              {formDay === dayIso ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
                  <select
                    value={formWorker}
                    onChange={(e) => setFormWorker(e.target.value)}
                    className="h-9 rounded-md border border-border px-2 text-xs"
                  >
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  {approvedLeaveFor(formWorker, dayIso) && (
                    <p className="flex items-center gap-1 text-[11px] text-warning">
                      <Warning size={12} weight="fill" /> On approved leave this day
                    </p>
                  )}
                  <input
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="e.g. Bush Rd Orchard, Block 4"
                    className="h-9 rounded-md border border-border px-2 text-xs"
                  />
                  <select
                    value={formWorkType}
                    onChange={(e) => setFormWorkType(e.target.value)}
                    className="h-9 rounded-md border border-border px-2 text-xs"
                  >
                    <option value="">No work type</option>
                    {workTypes.map((wt) => (
                      <option key={wt.id} value={wt.name}>
                        {wt.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium text-muted-fg">Start (optional)</label>
                    <input
                      type="time"
                      aria-label="Start time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="h-9 w-full rounded-md border border-border px-2 text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium text-muted-fg">End (optional)</label>
                    <input
                      type="time"
                      aria-label="End time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="h-9 w-full rounded-md border border-border px-2 text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="md" className="h-8 flex-1 px-2 text-xs" onClick={addEntry}>
                      Add
                    </Button>
                    <Button
                      size="md"
                      variant="secondary"
                      className="h-8 flex-1 px-2 text-xs"
                      onClick={() => setFormDay(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => openForm(dayIso)}
                  className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-fg transition-colors duration-150 hover:border-accent hover:text-accent"
                >
                  <Plus size={14} /> Assign
                </button>
              )}
            </Card>
          )
        })}
      </div>

      <Modal open={manageOpen} onClose={() => setManageOpen(false)} title="Manage work types">
        <div className="flex flex-col gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addWorkType()
            }}
            className="flex gap-2"
          >
            <input
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="e.g. Pole work"
              className="h-10 flex-1 rounded-lg border border-border px-3 text-sm outline-none focus:border-accent"
            />
            <Button type="submit" size="md" className="h-10 px-3 text-xs" disabled={!newTypeName.trim()}>
              Add
            </Button>
          </form>

          <div className="flex flex-col gap-2">
            {workTypes.length === 0 && (
              <p className="text-sm text-muted-fg">No work types yet — add one above.</p>
            )}
            {workTypes.map((wt) => (
              <div
                key={wt.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                {editingTypeId === wt.id ? (
                  <>
                    <input
                      value={editingTypeName}
                      onChange={(e) => setEditingTypeName(e.target.value)}
                      autoFocus
                      className="h-9 flex-1 rounded-md border border-border px-2 text-sm outline-none focus:border-accent"
                    />
                    <button
                      onClick={saveEditType}
                      aria-label="Save"
                      className="cursor-pointer rounded-md p-2 text-success hover:bg-muted"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setEditingTypeId(null)}
                      aria-label="Cancel edit"
                      className="cursor-pointer rounded-md p-2 text-muted-fg hover:bg-muted"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-fg">{wt.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEditType(wt)}
                        aria-label={`Edit ${wt.name}`}
                        className="cursor-pointer rounded-md p-2 text-muted-fg transition-colors duration-150 hover:bg-muted hover:text-fg"
                      >
                        <PencilSimple size={16} />
                      </button>
                      <button
                        onClick={() => deleteWorkType(wt.id)}
                        aria-label={`Delete ${wt.name}`}
                        className="cursor-pointer rounded-md p-2 text-muted-fg transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
