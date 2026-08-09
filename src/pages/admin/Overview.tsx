import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CaretRight, CheckCircle, Clock, Flag, HourglassMedium, Warning } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Avatar } from '../../components/Avatar'
import { StatusPill } from '../../components/StatusPill'
import { formatHours, isStaleOpenShift, shiftHours } from '../../utils/pay'
import {
  formatNzTime,
  formatWallClockTime,
  nzDateIso,
  nzEndOfDayInstant,
  nzNowMinutes,
  nzStartOfDayInstant,
  wallClockMinutes,
} from '../../utils/datetime'
import type { AppUser, RosterEntry, ShiftWithWorker } from '../../types'

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
  const [openFlagsCount, setOpenFlagsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!appUser) return

    const [workersRes, clockedInRes, todayRes, rosterRes, openFlagsRes] = await Promise.all([
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
      // Just a count — the full flag list with its replies/filters now
      // lives on its own page (/admin/flags) so Overview stays a quick
      // glance rather than growing without bound as flags accumulate.
      supabase
        .from('worker_notes')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', appUser.business_id)
        .eq('resolved', false),
    ])

    setWorkers((workersRes.data as AppUser[]) ?? [])
    setClockedIn((clockedInRes.data as ShiftWithWorker[]) ?? [])
    setTodayShifts((todayRes.data as ShiftWithWorker[]) ?? [])
    setTodayRoster((rosterRes.data as Pick<RosterEntry, 'user_id' | 'start_time'>[]) ?? [])
    setOpenFlagsCount(openFlagsRes.count ?? 0)
    setLoading(false)
  }, [appUser])

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

        <Link
          to="/admin/flags"
          className="flex max-w-lg items-center justify-between gap-3 rounded-xl border border-border bg-white p-4 shadow-sm transition-colors duration-150 hover:border-accent"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Flag
              size={16}
              weight={openFlagsCount > 0 ? 'fill' : 'regular'}
              className={openFlagsCount > 0 ? 'text-destructive' : 'text-muted-fg'}
            />
            {openFlagsCount > 0
              ? `${openFlagsCount} open flag${openFlagsCount === 1 ? '' : 's'}`
              : 'No open flags'}
          </span>
          <CaretRight size={16} className="text-muted-fg" />
        </Link>

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
                <div className="flex items-center gap-3">
                  <Avatar worker={worker} size={32} />
                  <p className="text-sm font-semibold text-fg">{worker.name}</p>
                </div>

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
