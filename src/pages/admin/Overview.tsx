import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, Clock, Flag, HourglassMedium, Warning } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { NoteReplyThread } from '../../components/NoteReplyThread'
import { StatusPill } from '../../components/StatusPill'
import { formatHours, isStaleOpenShift, shiftHours } from '../../utils/pay'
import {
  formatNzDate,
  formatNzTime,
  formatWallClockTime,
  nzDateIso,
  nzEndOfDayInstant,
  nzNowMinutes,
  nzStartOfDayInstant,
  wallClockMinutes,
} from '../../utils/datetime'
import type {
  AppUser,
  RosterEntry,
  ShiftWithWorker,
  WorkerNoteReply,
  WorkerNoteWithContext,
} from '../../types'

type WorkerStatus =
  | { kind: 'stale_clocked_in'; since: string }
  | { kind: 'no_show'; startTime: string }
  | { kind: 'clocked_in'; since: string }
  | { kind: 'clocked_out'; hoursToday: number }
  | { kind: 'late'; startTime: string }
  | { kind: 'not_clocked_in' }

const statusOrder: Record<WorkerStatus['kind'], number> = {
  stale_clocked_in: 0,
  no_show: 1,
  clocked_in: 2,
  late: 3,
  not_clocked_in: 4,
  clocked_out: 5,
}

// How long past a rostered start time before "running late" stops being
// a reasonable read and it's more honest to call it a no-show.
const NO_SHOW_THRESHOLD_MINUTES = 180

export function AdminOverview() {
  const { appUser } = useAuth()
  const [workers, setWorkers] = useState<AppUser[]>([])
  const [clockedIn, setClockedIn] = useState<ShiftWithWorker[]>([])
  const [todayShifts, setTodayShifts] = useState<ShiftWithWorker[]>([])
  const [todayRoster, setTodayRoster] = useState<Pick<RosterEntry, 'user_id' | 'start_time'>[]>([])
  const [notes, setNotes] = useState<WorkerNoteWithContext[]>([])
  const [replies, setReplies] = useState<Record<string, WorkerNoteReply[]>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!appUser) return

    const [workersRes, clockedInRes, todayRes, rosterRes, notesRes] = await Promise.all([
      supabase
        .from('users')
        .select('*')
        .eq('business_id', appUser.business_id)
        .eq('role', 'worker')
        .order('name'),
      supabase
        .from('shifts')
        .select('*, users(id, name, email, hourly_rate)')
        .eq('business_id', appUser.business_id)
        .is('clock_out_time', null)
        .order('clock_in_time', { ascending: false }),
      supabase
        .from('shifts')
        .select('*, users(id, name, email, hourly_rate)')
        .eq('business_id', appUser.business_id)
        .gte('clock_in_time', nzStartOfDayInstant(nzDateIso()))
        .lte('clock_in_time', nzEndOfDayInstant(nzDateIso())),
      supabase
        .from('roster_entries')
        .select('user_id, start_time')
        .eq('business_id', appUser.business_id)
        .eq('date', nzDateIso()),
      supabase
        .from('worker_notes')
        .select('*, users(id, name), shifts(clock_in_time), roster_entries(date, location_label)')
        .eq('business_id', appUser.business_id)
        .eq('resolved', false)
        .order('created_at', { ascending: false }),
    ])

    setWorkers((workersRes.data as AppUser[]) ?? [])
    setClockedIn((clockedInRes.data as ShiftWithWorker[]) ?? [])
    setTodayShifts((todayRes.data as ShiftWithWorker[]) ?? [])
    setTodayRoster((rosterRes.data as Pick<RosterEntry, 'user_id' | 'start_time'>[]) ?? [])
    const loadedNotes = (notesRes.data as WorkerNoteWithContext[]) ?? []
    setNotes(loadedNotes)

    if (loadedNotes.length > 0) {
      const { data: repliesData } = await supabase
        .from('worker_note_replies')
        .select('*')
        .in(
          'worker_note_id',
          loadedNotes.map((n) => n.id)
        )
        .order('created_at', { ascending: true })
      const grouped: Record<string, WorkerNoteReply[]> = {}
      for (const r of (repliesData as WorkerNoteReply[]) ?? []) {
        ;(grouped[r.worker_note_id] ??= []).push(r)
      }
      setReplies(grouped)
    } else {
      setReplies({})
    }

    setLoading(false)
  }, [appUser])

  async function resolveNote(id: string) {
    await supabase.from('worker_notes').update({ resolved: true }).eq('id', id)
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const workerStatuses = workers
    .map((worker) => {
      const openShift = clockedIn.find((s) => s.user_id === worker.id)
      if (openShift) {
        const kind = isStaleOpenShift(openShift) ? 'stale_clocked_in' : 'clocked_in'
        return { worker, status: { kind, since: openShift.clock_in_time } as WorkerStatus }
      }

      const completedToday = todayShifts.filter((s) => s.user_id === worker.id && s.clock_out_time)
      if (completedToday.length > 0) {
        const hoursToday = completedToday.reduce((sum, s) => sum + shiftHours(s), 0)
        return { worker, status: { kind: 'clocked_out', hoursToday } as WorkerStatus }
      }

      // Earliest rostered start time today, if any — "HH:MM:SS" strings
      // sort lexicographically in chronological order, so this is just
      // the smallest string among their entries with a start_time set.
      const earliestStart = todayRoster
        .filter((r) => r.user_id === worker.id && r.start_time)
        .map((r) => r.start_time as string)
        .sort()[0]

      if (earliestStart) {
        const minutesLate = nzNowMinutes() - wallClockMinutes(earliestStart)
        if (minutesLate > NO_SHOW_THRESHOLD_MINUTES) {
          return { worker, status: { kind: 'no_show', startTime: earliestStart } as WorkerStatus }
        }
        if (minutesLate > 0) {
          return { worker, status: { kind: 'late', startTime: earliestStart } as WorkerStatus }
        }
      }

      return { worker, status: { kind: 'not_clocked_in' } as WorkerStatus }
    })
    .sort((a, b) => statusOrder[a.status.kind] - statusOrder[b.status.kind])

  const clockedInCount = workerStatuses.filter(
    (w) => w.status.kind === 'clocked_in' || w.status.kind === 'stale_clocked_in'
  ).length
  const clockedOutCount = workerStatuses.filter((w) => w.status.kind === 'clocked_out').length
  // "Late"/"no-show" are still, factually, not clocked in yet — they get
  // their own pills in the list below, but count here too so the three
  // tiles still add up to the full team. lateCount/noShowCount break the
  // total down further in the tile's caption, so the summary number
  // doesn't look inconsistent with what the list below actually shows.
  const lateCount = workerStatuses.filter((w) => w.status.kind === 'late').length
  const noShowCount = workerStatuses.filter((w) => w.status.kind === 'no_show').length
  const notClockedInCount = workerStatuses.filter(
    (w) => w.status.kind === 'not_clocked_in' || w.status.kind === 'late' || w.status.kind === 'no_show'
  ).length
  const hoursToday = todayShifts.reduce((sum, s) => sum + shiftHours(s), 0)

  const filteredStatuses = workerStatuses.filter(({ worker }) =>
    worker.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div>
      <PageHeader title="Overview" subtitle="Today's crew status at a glance" />

      <div className="flex flex-col gap-4 p-4 md:p-8">
        <div className="grid grid-cols-3 gap-3 md:max-w-lg">
          <Card>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-fg">
              <Clock size={14} /> Clocked in
            </p>
            <p className="mt-1 font-heading text-2xl font-extrabold text-fg">{clockedInCount}</p>
          </Card>
          <Card>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-fg">
              <CheckCircle size={14} /> Clocked out
            </p>
            <p className="mt-1 font-heading text-2xl font-extrabold text-fg">{clockedOutCount}</p>
          </Card>
          <Card>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-fg">
              <HourglassMedium size={14} /> Not in yet
            </p>
            <p className="mt-1 font-heading text-2xl font-extrabold text-fg">{notClockedInCount}</p>
            {(lateCount > 0 || noShowCount > 0) && (
              <p className="mt-0.5 text-xs text-muted-fg">
                {[
                  lateCount > 0 && `${lateCount} running late`,
                  noShowCount > 0 && `${noShowCount} no-show`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </Card>
        </div>
        <p className="text-xs text-muted-fg">{formatHours(hoursToday)} logged across the team today</p>

        {notes.length > 0 && (
          <div>
            <h2 className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold text-fg">
              <Flag size={15} weight="fill" className="text-destructive" /> Flags from your crew
            </h2>
            <div className="flex flex-col gap-2">
              {notes.map((n) => (
                <Card key={n.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-fg">{n.users.name}</p>
                        <StatusPill tone={n.shifts ? 'accent' : n.roster_entries ? 'warning' : 'muted'}>
                          {n.shifts
                            ? formatNzDate(n.shifts.clock_in_time, {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                              })
                            : n.roster_entries
                              ? `Upcoming: ${formatNzDate(n.roster_entries.date, {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short',
                                })} · ${n.roster_entries.location_label}`
                              : 'General note'}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-sm text-fg">{n.message}</p>
                    </div>
                    <Button
                      size="md"
                      variant="secondary"
                      className="h-8 shrink-0 px-3 text-xs"
                      onClick={() => resolveNote(n.id)}
                    >
                      Mark resolved
                    </Button>
                  </div>
                  {appUser && (
                    <NoteReplyThread
                      noteId={n.id}
                      replies={replies[n.id] ?? []}
                      currentUserId={appUser.id}
                      onSent={load}
                    />
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-heading text-sm font-bold text-fg">Team status</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workers…"
              className="h-9 w-48 rounded-lg border border-border px-3 text-xs outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-2">
            {loading && <p className="text-sm text-muted-fg">Loading…</p>}
            {!loading && workers.length === 0 && (
              <p className="text-sm text-muted-fg">No workers yet — add them from the Workers page.</p>
            )}
            {!loading && workers.length > 0 && filteredStatuses.length === 0 && (
              <p className="text-sm text-muted-fg">No workers match "{search}".</p>
            )}
            {filteredStatuses.map(({ worker, status }) => (
              <Card key={worker.id} className="flex items-center justify-between">
                <p className="text-sm font-semibold text-fg">{worker.name}</p>

                {status.kind === 'stale_clocked_in' && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-fg">Since {formatNzTime(status.since)}</span>
                    <StatusPill tone="destructive" icon={<Warning size={13} weight="fill" />}>
                      Forgot to clock out?
                    </StatusPill>
                  </div>
                )}

                {status.kind === 'no_show' && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-fg">Due {formatWallClockTime(status.startTime)}</span>
                    <StatusPill tone="destructive" icon={<Warning size={13} weight="fill" />}>
                      No-show today
                    </StatusPill>
                  </div>
                )}

                {status.kind === 'clocked_in' && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-fg">Since {formatNzTime(status.since)}</span>
                    <StatusPill tone="success" icon={<Clock size={13} weight="fill" />}>
                      Clocked in
                    </StatusPill>
                  </div>
                )}

                {status.kind === 'clocked_out' && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-fg">{formatHours(status.hoursToday)} today</span>
                    <StatusPill tone="accent" icon={<CheckCircle size={13} weight="fill" />}>
                      Clocked out
                    </StatusPill>
                  </div>
                )}

                {status.kind === 'late' && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-fg">Due {formatWallClockTime(status.startTime)}</span>
                    <StatusPill tone="warning" icon={<Warning size={13} weight="fill" />}>
                      Running late
                    </StatusPill>
                  </div>
                )}

                {status.kind === 'not_clocked_in' && (
                  <StatusPill tone="muted" icon={<HourglassMedium size={13} />}>
                    Not clocked in
                  </StatusPill>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
