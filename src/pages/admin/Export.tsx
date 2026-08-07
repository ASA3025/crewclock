import { useState } from 'react'
import { Download } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { downloadCsv, toCsv } from '../../utils/csv'
import { estimateGross, shiftHours } from '../../utils/pay'
import {
  formatNzDate,
  formatNzTime,
  nzDateIso,
  nzEndOfDayInstant,
  nzStartOfDayInstant,
  nzStartOfMonthIso,
} from '../../utils/datetime'
import type { ShiftWithWorker } from '../../types'

export function AdminExport() {
  const { appUser } = useAuth()
  const [from, setFrom] = useState(nzStartOfMonthIso())
  const [to, setTo] = useState(nzDateIso())
  const [approvedOnly, setApprovedOnly] = useState(true)
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState<number | null>(null)

  async function handleExport() {
    if (!appUser) return
    setBusy(true)
    setCount(null)

    let query = supabase
      .from('shifts')
      .select('*, users(id, name, email, hourly_rate)')
      .eq('business_id', appUser.business_id)
      .not('clock_out_time', 'is', null)
      .eq('rejected', false)
      .gte('clock_in_time', nzStartOfDayInstant(from))
      .lte('clock_in_time', nzEndOfDayInstant(to))
      .order('clock_in_time')

    if (approvedOnly) query = query.eq('approved', true)

    const { data } = await query
    const shifts = (data as ShiftWithWorker[]) ?? []

    if (shifts.length === 0) {
      setCount(0)
      setBusy(false)
      return
    }

    const rows = shifts.map((s) => {
      const hours = shiftHours(s)
      const gross = estimateGross(hours, s.users.hourly_rate)
      return [
        s.users.name,
        s.users.email,
        formatNzDate(s.clock_in_time),
        formatNzTime(s.clock_in_time),
        s.clock_out_time ? formatNzTime(s.clock_out_time) : '',
        hours.toFixed(2),
        s.users.hourly_rate?.toFixed(2) ?? '',
        gross.toFixed(2),
      ]
    })

    const csv = toCsv(
      ['Worker', 'Email', 'Date', 'Clock in', 'Clock out', 'Hours', 'Rate ($/hr)', 'Estimated gross ($)'],
      rows
    )

    downloadCsv(`crewclock-hours-${from}-to-${to}.csv`, csv)
    setCount(shifts.length)
    setBusy(false)
  }

  return (
    <div>
      <PageHeader title="Export" subtitle="Download hours for payroll" />

      <div className="flex flex-col gap-4 p-4 md:max-w-md md:p-8">
        <Card className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-muted-fg">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-10 rounded-lg border border-border px-3 text-sm"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-muted-fg">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-10 rounded-lg border border-border px-3 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={approvedOnly}
              onChange={(e) => setApprovedOnly(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-navy"
            />
            Approved hours only
          </label>

          <Button onClick={handleExport} disabled={busy} icon={<Download size={18} />}>
            {busy ? 'Preparing…' : 'Download CSV'}
          </Button>

          {count === 0 &&
            (approvedOnly ? (
              <p className="text-xs text-destructive">
                No approved hours in this range yet. Approve shifts on the Hours page before
                exporting.
              </p>
            ) : (
              <p className="text-xs text-destructive">No shifts found in this range.</p>
            ))}

          {count !== null && count > 0 && (
            <p className="text-xs text-muted-fg">
              Exported {count} shift{count === 1 ? '' : 's'}. Estimates are pre-tax — hand this to
              your accountant or import into your payroll software.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
