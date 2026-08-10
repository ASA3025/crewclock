import { useEffect, useState } from 'react'
import { Flag, MapPin, CheckCircle, HourglassMedium, Warning, XCircle } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { FlagAdminModal } from '../../components/FlagAdminModal'
import { StatusPill } from '../../components/StatusPill'
import { estimateGross, formatCurrency, formatHours, shiftHours } from '../../utils/pay'
import { formatNzDate, formatNzTime, nzDateIso, nzStartOfWeekIso } from '../../utils/datetime'
import { isNzPublicHoliday } from '../../utils/nzPublicHolidays'
import type { Shift } from '../../types'

type Range = 'week' | 'month' | 'all'

const rangeLabels: Record<Range, string> = {
  week: 'Weekly',
  month: 'Monthly',
  all: 'All time',
}

export function WorkerHoursHistory() {
  const { appUser } = useAuth()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('week')
  const [flaggedShiftIds, setFlaggedShiftIds] = useState<Set<string>>(new Set())
  const [flagTarget, setFlagTarget] = useState<Shift | null>(null)

  function loadFlags() {
    if (!appUser) return
    supabase
      .from('worker_notes')
      .select('shift_id')
      .eq('user_id', appUser.id)
      .eq('resolved', false)
      .not('shift_id', 'is', null)
      .then(({ data }) => {
        setFlaggedShiftIds(new Set((data ?? []).map((n) => n.shift_id as string)))
      })
  }

  useEffect(() => {
    if (!appUser) return
    supabase
      .from('shifts')
      .select('*')
      .eq('user_id', appUser.id)
      .not('clock_out_time', 'is', null)
      .order('clock_in_time', { ascending: false })
      .then(({ data }) => {
        setShifts((data as Shift[]) ?? [])
        setLoading(false)
      })
    loadFlags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser])

  const currentNzMonth = nzDateIso().slice(0, 7)
  const currentNzWeekStart = nzStartOfWeekIso()

  // Rejected shifts don't count toward the pay estimate — they won't be paid.
  const rangeShifts = shifts.filter((s) => {
    if (s.rejected) return false
    if (range === 'all') return true
    const shiftNzDate = nzDateIso(new Date(s.clock_in_time))
    return range === 'week' ? shiftNzDate >= currentNzWeekStart : shiftNzDate.startsWith(currentNzMonth)
  })
  const rangeHours = rangeShifts.reduce((sum, s) => sum + shiftHours(s), 0)
  const rangeGross = estimateGross(rangeHours, appUser?.hourly_rate ?? null)

  return (
    <div>
      <PageHeader title="Hours history" subtitle="Your past shifts and estimated pay" />

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="range" className="text-xs font-medium text-muted-fg">
            Pay estimate for
          </label>
          <select
            id="range"
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-fg"
          >
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="all">All time</option>
          </select>
        </div>

        <Card className="!bg-navy text-navy-fg">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-fg/70">
            {rangeLabels[range]}
          </p>
          <p className="mt-2 font-heading text-3xl font-extrabold">{formatCurrency(rangeGross)}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-navy-fg/70">Estimate — before tax</p>
          <p className="mt-2 text-xs text-navy-fg/70">{formatHours(rangeHours)} logged</p>
        </Card>

        {loading && <p className="text-sm text-muted-fg">Loading shifts…</p>}
        {!loading && shifts.length === 0 && (
          <p className="text-sm text-muted-fg">No completed shifts yet.</p>
        )}

        {shifts.map((shift) => (
          <Card key={shift.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-fg">
                {formatNzDate(shift.clock_in_time, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
              <StatusPill
                tone={shift.rejected ? 'destructive' : shift.approved ? 'success' : 'muted'}
                icon={
                  shift.rejected ? (
                    <XCircle size={14} weight="fill" />
                  ) : shift.approved ? (
                    <CheckCircle size={14} weight="fill" />
                  ) : (
                    <HourglassMedium size={14} weight="regular" />
                  )
                }
              >
                {shift.rejected ? 'Rejected' : shift.approved ? 'Approved' : 'Pending review'}
              </StatusPill>
            </div>
            <p className="text-xs text-muted-fg">
              {formatNzTime(shift.clock_in_time)}
              {' – '}
              {shift.clock_out_time && formatNzTime(shift.clock_out_time)}{' '}
              · {formatHours(shiftHours(shift))}
              {appUser?.hourly_rate ? (
                <> · {formatCurrency(estimateGross(shiftHours(shift), appUser.hourly_rate))}</>
              ) : null}
            </p>
            {shift.gps_lat != null && (
              <p className="flex items-center gap-1 text-xs text-muted-fg">
                <MapPin size={13} /> Location captured
              </p>
            )}
            {isNzPublicHoliday(shift.clock_in_time) && (
              <p className="flex items-center gap-1 text-xs text-warning">
                <Warning size={13} weight="fill" /> Public holiday — pay may differ from this
                estimate
              </p>
            )}
            {shift.note && <p className="text-sm text-fg">{shift.note}</p>}
            {shift.photo_url && (
              <img
                src={shift.photo_url}
                alt="Shift attachment"
                className="mt-1 h-32 w-full rounded-lg border border-border object-cover"
              />
            )}
            {flaggedShiftIds.has(shift.id) ? (
              <p className="flex items-center gap-1 text-xs text-muted-fg">
                <Flag size={13} weight="fill" /> Flagged — awaiting your admin
              </p>
            ) : (
              <button
                onClick={() => setFlagTarget(shift)}
                className="flex w-fit cursor-pointer items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <Flag size={13} /> Flag this shift
              </button>
            )}
          </Card>
        ))}
      </div>

      <FlagAdminModal
        open={flagTarget != null}
        onClose={() => setFlagTarget(null)}
        shiftId={flagTarget?.id}
        shiftLabel={flagTarget ? formatNzDate(flagTarget.clock_in_time, { day: 'numeric', month: 'short' }) : undefined}
        onSent={loadFlags}
      />
    </div>
  )
}
