import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { supabase } from '../lib/supabaseClient'

export function FlagAdminModal({
  open,
  onClose,
  shiftId,
  shiftLabel,
  rosterEntryId,
  rosterLabel,
  onSent,
}: {
  open: boolean
  onClose: () => void
  shiftId?: string
  shiftLabel?: string
  rosterEntryId?: string
  rosterLabel?: string
  onSent?: () => void
}) {
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: fnError } = await supabase.functions.invoke('submit-worker-note', {
      body: {
        message: message.trim(),
        shift_id: shiftId ?? null,
        roster_entry_id: rosterEntryId ?? null,
        site_url: window.location.origin,
      },
    })

    setSubmitting(false)
    if (fnError) {
      setError(fnError.message)
      return
    }

    setSent(true)
    setMessage('')
    onSent?.()
  }

  function handleClose() {
    setSent(false)
    setError(null)
    setMessage('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={shiftId ? 'Flag this shift' : rosterEntryId ? 'Flag this roster entry' : 'Message your admin'}
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg">Sent to your admin.</p>
          <Button fullWidth onClick={handleClose}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {shiftLabel && <p className="text-sm text-muted-fg">About your shift on {shiftLabel}.</p>}
          {rosterLabel && <p className="text-sm text-muted-fg">About your upcoming shift on {rosterLabel}.</p>}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="flag-message" className="text-sm font-medium text-fg">
              What's up?
            </label>
            <textarea
              id="flag-message"
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. My clock-out time looks wrong for this shift…"
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-fg outline-none transition-colors duration-150 focus:border-accent"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" fullWidth disabled={submitting || !message.trim()}>
            {submitting ? 'Sending…' : 'Send to admin'}
          </Button>
        </form>
      )}
    </Modal>
  )
}
