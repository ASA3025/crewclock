import { useEffect, useState } from 'react'
import { Clock, MapPin } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { formatNzDate, formatShiftTimeRange, nzDateIso } from '../../utils/datetime'
import type { RosterEntry } from '../../types'

export function WorkerRoster() {
  const { appUser } = useAuth()
  const [entries, setEntries] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!appUser) return
    supabase
      .from('roster_entries')
      .select('*')
      .eq('user_id', appUser.id)
      .gte('date', nzDateIso())
      .order('date', { ascending: true })
      .then(({ data }) => {
        setEntries((data as RosterEntry[]) ?? [])
        setLoading(false)
      })
  }, [appUser])

  return (
    <div>
      <PageHeader title="Upcoming roster" subtitle="Where you're working next" />

      <div className="flex flex-col gap-3 p-4">
        {loading && <p className="text-sm text-muted-fg">Loading roster…</p>}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-muted-fg">No upcoming shifts have been rostered yet.</p>
        )}

        {entries.map((entry) => (
          <Card key={entry.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-fg">
                {formatNzDate(entry.date, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-fg">
                <MapPin size={14} /> {entry.location_label}
              </p>
              {formatShiftTimeRange(entry.start_time, entry.end_time) && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-fg">
                  <Clock size={13} /> {formatShiftTimeRange(entry.start_time, entry.end_time)}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
