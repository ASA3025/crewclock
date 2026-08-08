import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { NoteReplyThread } from '../../components/NoteReplyThread'
import { StatusPill } from '../../components/StatusPill'
import { formatNzDate } from '../../utils/datetime'
import type { WorkerNoteReplyWithAuthor, WorkerNoteWithContext } from '../../types'

export function WorkerNotes() {
  const { appUser } = useAuth()
  const [notes, setNotes] = useState<WorkerNoteWithContext[]>([])
  const [replies, setReplies] = useState<Record<string, WorkerNoteReplyWithAuthor[]>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!appUser) return

    const { data: notesData } = await supabase
      .from('worker_notes')
      .select('*, users(id, name), shifts(clock_in_time), roster_entries(date, location_label)')
      .eq('user_id', appUser.id)
      .order('created_at', { ascending: false })

    const loadedNotes = (notesData as WorkerNoteWithContext[]) ?? []
    setNotes(loadedNotes)

    if (loadedNotes.length > 0) {
      const { data: repliesData } = await supabase
        .from('worker_note_replies')
        .select('*, users(id, name, role)')
        .in(
          'worker_note_id',
          loadedNotes.map((n) => n.id)
        )
        .order('created_at', { ascending: true })
      const grouped: Record<string, WorkerNoteReplyWithAuthor[]> = {}
      for (const r of (repliesData as WorkerNoteReplyWithAuthor[]) ?? []) {
        ;(grouped[r.worker_note_id] ??= []).push(r)
      }
      setReplies(grouped)
    } else {
      setReplies({})
    }

    setLoading(false)
  }, [appUser])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <PageHeader title="Flags & notes" subtitle="Anything you've flagged to your admin" />

      <div className="flex flex-col gap-3 p-4">
        {loading && <p className="text-sm text-muted-fg">Loading…</p>}
        {!loading && notes.length === 0 && (
          <p className="text-sm text-muted-fg">
            Nothing here yet — flag a shift, a roster entry, or message your admin from Home.
          </p>
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
