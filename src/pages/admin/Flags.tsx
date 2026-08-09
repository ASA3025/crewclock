import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { NoteReplyThread } from '../../components/NoteReplyThread'
import { StatusPill } from '../../components/StatusPill'
import { formatNzDate, nzEndOfDayInstant, nzStartOfDayInstant } from '../../utils/datetime'
import type { WorkerNoteReply, WorkerNoteWithContext } from '../../types'

export function AdminFlags() {
  const { appUser } = useAuth()
  const [notes, setNotes] = useState<WorkerNoteWithContext[]>([])
  const [replies, setReplies] = useState<Record<string, WorkerNoteReply[]>>({})
  const [loading, setLoading] = useState(true)
  const [noteStatus, setNoteStatus] = useState<'open' | 'resolved' | 'all'>('open')
  const [noteFrom, setNoteFrom] = useState('')
  const [noteTo, setNoteTo] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!appUser) return

    let notesQuery = supabase
      .from('worker_notes')
      .select('*, users(id, name), shifts(clock_in_time), roster_entries(date, location_label)')
      .eq('business_id', appUser.business_id)

    if (noteStatus === 'open') notesQuery = notesQuery.eq('resolved', false)
    else if (noteStatus === 'resolved') notesQuery = notesQuery.eq('resolved', true)
    if (noteFrom) notesQuery = notesQuery.gte('created_at', nzStartOfDayInstant(noteFrom))
    if (noteTo) notesQuery = notesQuery.lte('created_at', nzEndOfDayInstant(noteTo))
    notesQuery = notesQuery.order('created_at', { ascending: false })

    const { data: notesData } = await notesQuery
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
  }, [appUser, noteStatus, noteFrom, noteTo])

  async function toggleResolved(note: WorkerNoteWithContext) {
    await supabase.from('worker_notes').update({ resolved: !note.resolved }).eq('id', note.id)
    if (noteStatus === 'all') {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, resolved: !n.resolved } : n)))
    } else {
      // Filtered to one status — either way, this note no longer belongs in this view.
      setNotes((prev) => prev.filter((n) => n.id !== note.id))
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const filteredNotes = notes.filter((n) =>
    n.users.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div>
      <PageHeader title="Flags" subtitle="Everything your crew has flagged or messaged you about" />

      <div className="flex flex-col gap-4 p-4 md:p-8">
        <Card className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">Status</label>
            <select
              value={noteStatus}
              onChange={(e) => setNoteStatus(e.target.value as 'open' | 'resolved' | 'all')}
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
              value={noteFrom}
              onChange={(e) => setNoteFrom(e.target.value)}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">To</label>
            <input
              type="date"
              value={noteTo}
              onChange={(e) => setNoteTo(e.target.value)}
              className="h-10 rounded-lg border border-border px-3 text-sm"
            />
          </div>
          {(noteFrom || noteTo) && (
            <button
              onClick={() => {
                setNoteFrom('')
                setNoteTo('')
              }}
              className="h-10 cursor-pointer text-xs font-medium text-accent hover:underline"
            >
              Clear dates
            </button>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-fg">Worker</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workers…"
              className="h-10 rounded-lg border border-border px-3 text-sm outline-none focus:border-accent"
            />
          </div>
        </Card>

        <div className="flex flex-col gap-2">
          {loading && <p className="text-sm text-muted-fg">Loading…</p>}
          {!loading && filteredNotes.length === 0 && (
            <p className="text-sm text-muted-fg">No flags match these filters.</p>
          )}
          {filteredNotes.map((n) => (
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
                    <StatusPill tone={n.resolved ? 'success' : 'muted'}>
                      {n.resolved ? 'Resolved' : 'Open'}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-fg">{n.message}</p>
                </div>
                <Button
                  size="md"
                  variant="secondary"
                  className="h-8 shrink-0 px-3 text-xs"
                  onClick={() => toggleResolved(n)}
                >
                  {n.resolved ? 'Reopen' : 'Mark resolved'}
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
    </div>
  )
}
