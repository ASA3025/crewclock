import { useEffect, useState } from 'react'
import { Clock, Flag, MapPin, Warning } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { FlagAdminModal } from '../../components/FlagAdminModal'
import { formatNzDate, formatShiftTimeRange, nzDateIso } from '../../utils/datetime'
import { isNzPublicHoliday } from '../../utils/nzPublicHolidays'
import type { RosterEntry } from '../../types'

export function WorkerRoster() {
  const { appUser } = useAuth()
  const [entries, setEntries] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [flaggedEntryIds, setFlaggedEntryIds] = useState<Set<string>>(new Set())
  const [flagTarget, setFlagTarget] = useState<RosterEntry | null>(null)

  function loadFlags() {
    if (!appUser) return
    supabase
      .from('worker_notes')
      .select('roster_entry_id')
      .eq('user_id', appUser.id)
      .eq('resolved', false)
      .not('roster_entry_id', 'is', null)
      .then(({ data }) => {
        setFlaggedEntryIds(new Set((data ?? []).map((n) => n.roster_entry_id as string)))
      })
  }

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
    loadFlags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <Card key={entry.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-fg">
                {formatNzDate(entry.date, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
              {isNzPublicHoliday(entry.date) && (
                <p
                  className="mt-0.5 flex items-center gap-1 text-xs text-warning"
                  title="This day is an NZ public holiday — pay may differ from the standard estimate."
                >
                  <Warning size={12} weight="fill" /> Public holiday
                </p>
              )}
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-fg">
                <MapPin size={14} /> {entry.location_label}
              </p>
              {entry.work_type && (
                <p className="mt-0.5 text-sm font-medium text-accent">{entry.work_type}</p>
              )}
              {formatShiftTimeRange(entry.start_time, entry.end_time) && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-fg">
                  <Clock size={13} /> {formatShiftTimeRange(entry.start_time, entry.end_time)}
                </p>
              )}
              {flaggedEntryIds.has(entry.id) ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-fg">
                  <Flag size={13} weight="fill" /> Flagged — awaiting your admin
                </p>
              ) : (
                <button
                  onClick={() => setFlagTarget(entry)}
                  className="mt-2 flex w-fit cursor-pointer items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <Flag size={13} /> Flag this shift
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <FlagAdminModal
        open={flagTarget != null}
        onClose={() => setFlagTarget(null)}
        rosterEntryId={flagTarget?.id}
        rosterLabel={
          flagTarget ? formatNzDate(flagTarget.date, { day: 'numeric', month: 'short' }) : undefined
        }
        onSent={loadFlags}
      />
    </div>
  )
}
