import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Button } from './Button'
import type { WorkerNoteReply } from '../types'

export function NoteReplyThread({
  noteId,
  replies,
  currentUserId,
  onSent,
}: {
  noteId: string
  replies: WorkerNoteReply[]
  currentUserId: string
  onSent: () => void
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)

    const { error } = await supabase.functions.invoke('submit-note-reply', {
      body: {
        note_id: noteId,
        message: message.trim(),
        site_url: window.location.origin,
      },
    })

    setSending(false)
    if (!error) {
      setMessage('')
      onSent()
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {replies.map((r) => (
        <div key={r.id}>
          <p className="text-xs font-semibold text-fg">
            {r.author_id === currentUserId ? 'You' : r.author_name}
            {r.author_role === 'admin' && r.author_id !== currentUserId ? ' (Admin)' : ''}
          </p>
          <p className="text-sm text-fg">{r.message}</p>
        </div>
      ))}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Reply…"
          className="h-9 flex-1 rounded-lg border border-border px-3 text-sm text-fg outline-none focus:border-accent"
        />
        <Button type="submit" size="md" variant="secondary" className="h-9 px-3 text-xs" disabled={sending || !message.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </form>
    </div>
  )
}
