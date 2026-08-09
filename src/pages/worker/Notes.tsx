import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { NoteReplyThread } from '../../components/NoteReplyThread'
import { StatusPill } from '../../components/StatusPill'
import { formatNzDate, nzEndOfDayInstant, nzStartOfDayInstant } from '../../utils/datetime'
import type { WorkerNoteReply, WorkerNoteWithContext } from '../../types'

export function WorkerNotes() {
  const { appUser } = useAuth()
  const [notes, setNotes] = useState<WorkerNoteWithContext[]>([])
  const [replies, setReplies] = useState<Record<string, WorkerNoteReply[]>>({})
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    if (!appUser) return

    let query = supabase
      .from('worker_notes')
      .select('*, users(id, name), shifts(clock_in_time), roster_entries(date, location_label)')
      .eq('user_id', appUser.id)

    if (status === 'open') query = query.eq('resolved', false)
    else if (status === 'resolved') query = query.eq('resolved', true)
    if (from) query = query.gte('created_at', nzStartOfDayInstant(from))
    if (to) query = query.lte('created_at', nzEndOfDayInstant(to))
    query = query.order('created_at', { ascending: false })

    const { data: notesData } = await query

    const loadedNotes = (notesData as WorkerNoteWithContext[]) ?? []
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
  }, [appUser, status, from, to])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <PageHeader title="Flags & notes" subtitle="Anything you've flagged to your admin" />

      <div className="flex flex-col gap-3 p-4">
        <Card className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'open' | 'resolved' | 'all')}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
          </div>
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
          {(from || to) && (
            <button
              onClick={() => {
                setFrom('')
                setTo('')
              }}
              className="h-10 cursor-pointer text-xs font-medium text-accent hover:underline"
            >
              Clear dates
            </button>
          )}
        </Card>

        {loading && <p className="text-sm text-muted-fg">Loading…</p>}
        {!loading && notes.length === 0 && (
          <p className="text-sm text-muted-fg">No flags match these filters.</p>
        )}

        {notes.map((n) => (
          <Card key={n.id} className="flex flex-col gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
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
                <StatusPill tone={n.resolved ? 'success' : 'muted'}>
                  {n.resolved ? 'Resolved' : 'Awaiting your admin'}
                </StatusPill>
              </div>
              <p className="mt-1 text-sm text-fg">{n.message}</p>
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
  )
}
