import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, Clock, HourglassMedium, Warning } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
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
  | { kind: 'clocked_in'; since: string }
  | { kind: 'clocked_out'; hoursToday: number }
  | { kind: 'late'; startTime: string }
  | { kind: 'not_clocked_in' }

const statusOrder: Record<WorkerStatus['kind'], number> = {
  stale_clocked_in: 0,
  clocked_in: 1,
  late: 2,
  not_clocked_in: 3,
  clocked_out: 4,
}

export function AdminOverview() {
  const { appUser } = useAuth()
  const [workers, setWorkers] = useState<AppUser[]>([])
  const [clockedIn, setClockedIn] = useState<ShiftWithWorker[]>([])
  const [todayShifts, setTodayShifts] = useState<ShiftWithWorker[]>([])
  const [todayRoster, setTodayRoster] = useState<Pick<RosterEntry, 'user_id' | 'start_time'>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!appUser) return

    const [workersRes, clockedInRes, todayRes, rosterRes] = await Promise.all([
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
    ])

    setWorkers((workersRes.data as AppUser[]) ?? [])
    setClockedIn((clockedInRes.data as ShiftWithWorker[]) ?? [])
    setTodayShifts((todayRes.data as ShiftWithWorker[]) ?? [])
    setTodayRoster((rosterRes.data as Pick<RosterEntry, 'user_id' | 'start_time'>[]) ?? [])
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

      if (earliestStart && wallClockMinutes(earliestStart) < nzNowMinutes()) {
        return { worker, status: { kind: 'late', startTime: earliestStart } as WorkerStatus }
      }

      return { worker, status: { kind: 'not_clocked_in' } as WorkerStatus }
    })
    .sort((a, b) => statusOrder[a.status.kind] - statusOrder[b.status.kind])

  const clockedInCount = workerStatuses.filter(
    (w) => w.status.kind === 'clocked_in' || w.status.kind === 'stale_clocked_in'
  ).length
  const clockedOutCount = workerStatuses.filter((w) => w.status.kind === 'clocked_out').length
  // "Late" is still, factually, not clocked in yet — it gets its own pill
  // in the list below, but counts here so the three tiles still add up to
  // the full team.
  const notClockedInCount = workerStatuses.filter(
    (w) => w.status.kind === 'not_clocked_in' || w.status.kind === 'late'
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
          </Card>
        </div>
        <p className="text-xs text-muted-fg">{formatHours(hoursToday)} logged across the team today</p>

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
