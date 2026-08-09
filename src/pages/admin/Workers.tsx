import { useEffect, useState, type FormEvent } from 'react'
import { Camera, Key, PaperPlaneTilt, Plus, PencilSimple, Trash } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { Avatar } from '../../components/Avatar'
import { PasswordStrengthField } from '../../components/PasswordStrengthField'
import { formatCurrency } from '../../utils/pay'
import { meetsPasswordRequirements } from '../../utils/passwordStrength'
import type { AppUser } from '../../types'

export function AdminWorkers() {
  const { appUser } = useAuth()
  const [workers, setWorkers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [rate, setRate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState<AppUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [settingPassword, setSettingPassword] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [uploadingAvatarId, setUploadingAvatarId] = useState<string | null>(null)
  const [resendMessage, setResendMessage] = useState<{
    id: string
    text: string
    isError: boolean
  } | null>(null)

  async function load() {
    if (!appUser) return
    setLoading(true)
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('business_id', appUser.business_id)
      .eq('role', 'worker')
      .order('name')
    setWorkers((data as AppUser[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: fnError } = await supabase.functions.invoke('create-worker', {
      body: { name, email, hourly_rate: Number(rate) || null },
    })

    setSubmitting(false)
    if (fnError) {
      setError(fnError.message)
      return
    }

    setAddOpen(false)
    setName('')
    setEmail('')
    setRate('')
    load()
  }

  async function saveRate(worker: AppUser) {
    await supabase
      .from('users')
      .update({ hourly_rate: Number(editRate) || null })
      .eq('id', worker.id)
    setEditingId(null)
    load()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    setDeleting(true)

    const { error: fnError } = await supabase.functions.invoke('delete-worker', {
      body: { worker_id: deleteTarget.id },
    })

    setDeleting(false)
    if (fnError) {
      setDeleteError(fnError.message)
      return
    }

    setDeleteTarget(null)
    load()
  }

  async function handleSetPassword() {
    if (!passwordTarget) return
    setPasswordError(null)

    if (!meetsPasswordRequirements(newPassword)) {
      setPasswordError('Password does not meet the requirements above.')
      return
    }

    setSettingPassword(true)
    const { error: fnError } = await supabase.functions.invoke('set-worker-password', {
      body: { worker_id: passwordTarget.id, password: newPassword },
    })
    setSettingPassword(false)

    if (fnError) {
      setPasswordError(fnError.message)
      return
    }

    setPasswordTarget(null)
    setNewPassword('')
  }

  async function handleAvatarChange(worker: AppUser, file: File) {
    setUploadingAvatarId(worker.id)
    const path = `${worker.business_id}/${worker.id}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (!uploadError) {
      const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      // The storage path never changes on re-upload, so a query-string
      // cache-buster is what actually makes the new photo show up instead
      // of a stale cached image at the same URL.
      await supabase
        .from('users')
        .update({ avatar_url: `${publicUrl}?t=${Date.now()}` })
        .eq('id', worker.id)
      load()
    }
    setUploadingAvatarId(null)
  }

  async function handleResend(worker: AppUser) {
    setResendingId(worker.id)
    setResendMessage(null)

    const { error: fnError } = await supabase.functions.invoke('resend-invite', {
      body: { worker_id: worker.id },
    })

    setResendingId(null)
    setResendMessage({
      id: worker.id,
      text: fnError ? fnError.message : 'Invite email resent.',
      isError: Boolean(fnError),
    })
  }

  return (
    <div>
      <PageHeader
        title="Workers"
        subtitle="Manage your crew and pay rates"
        action={
          <Button size="md" icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
            Add worker
          </Button>
        }
      />

      <div className="flex flex-col gap-3 p-4 md:p-8">
        {loading && <p className="text-sm text-muted-fg">Loading…</p>}
        {!loading && workers.length === 0 && (
          <p className="text-sm text-muted-fg">No workers yet — add your first one above.</p>
        )}

        {workers.map((worker) => (
          <Card key={worker.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <Avatar worker={worker} size={44} />
                  <label
                    aria-label="Change photo"
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border bg-white text-muted-fg transition-colors duration-150 hover:text-accent"
                  >
                    <Camera size={11} />
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingAvatarId === worker.id}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleAvatarChange(worker, file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
                <div>
                  <p className="text-sm font-semibold text-fg">{worker.name}</p>
                  <p className="text-xs text-muted-fg">{worker.email}</p>
                </div>
              </div>

              {editingId === worker.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    value={editRate}
                    onChange={(e) => setEditRate(e.target.value)}
                    className="h-9 w-24 rounded-md border border-border px-2 text-sm"
                  />
                  <Button size="md" className="h-9 px-3 text-xs" onClick={() => saveRate(worker)}>
                    Save
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-fg">
                    {worker.hourly_rate != null ? `${formatCurrency(worker.hourly_rate)}/hr` : 'No rate set'}
                  </p>
                  <button
                    onClick={() => {
                      setEditingId(worker.id)
                      setEditRate(String(worker.hourly_rate ?? ''))
                    }}
                    aria-label="Edit rate"
                    className="cursor-pointer rounded-md p-2 text-muted-fg transition-colors duration-150 hover:bg-muted hover:text-fg"
                  >
                    <PencilSimple size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-xs">
                {resendMessage?.id === worker.id && (
                  <span className={resendMessage.isError ? 'text-destructive' : 'text-success'}>
                    {resendMessage.text}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setPasswordError(null)
                    setNewPassword('')
                    setPasswordTarget(worker)
                  }}
                  aria-label="Set password"
                  className="cursor-pointer rounded-md p-2 text-muted-fg transition-colors duration-150 hover:bg-muted hover:text-fg"
                >
                  <Key size={16} />
                </button>
                <button
                  onClick={() => handleResend(worker)}
                  disabled={resendingId === worker.id}
                  aria-label="Resend invite"
                  className="cursor-pointer rounded-md p-2 text-muted-fg transition-colors duration-150 hover:bg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PaperPlaneTilt size={16} />
                </button>
                <button
                  onClick={() => {
                    setDeleteError(null)
                    setDeleteTarget(worker)
                  }}
                  aria-label="Remove worker"
                  className="cursor-pointer rounded-md p-2 text-muted-fg transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add worker">
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-fg" htmlFor="worker-name">
              Name
            </label>
            <input
              id="worker-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-fg" htmlFor="worker-email">
              Email
            </label>
            <input
              id="worker-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-fg" htmlFor="worker-rate">
              Hourly rate ($)
            </label>
            <input
              id="worker-rate"
              type="number"
              step="0.5"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-accent"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Adding…' : 'Add worker'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="Remove worker"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg">
            Remove <span className="font-semibold">{deleteTarget?.name}</span>? This deletes their
            account and login, and permanently erases their shift and roster history. This can't
            be undone.
          </p>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" fullWidth onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Removing…' : 'Remove worker'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={passwordTarget != null} onClose={() => setPasswordTarget(null)} title="Set password">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg">
            Set a new password for <span className="font-semibold">{passwordTarget?.name}</span>.
            This doesn't send them anything — share the password with them yourself. Use this if
            an invite or reset email isn't reaching them.
          </p>
          <PasswordStrengthField
            id="worker-password"
            label="New password"
            type="text"
            autoComplete="off"
            value={newPassword}
            onChange={setNewPassword}
          />
          {passwordError && (
            <p role="alert" className="text-sm text-destructive">
              {passwordError}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setPasswordTarget(null)}
              disabled={settingPassword}
            >
              Cancel
            </Button>
            <Button
              fullWidth
              onClick={handleSetPassword}
              disabled={settingPassword || !meetsPasswordRequirements(newPassword)}
            >
              {settingPassword ? 'Saving…' : 'Set password'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
