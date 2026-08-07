import { useEffect, useState } from 'react'
import { Clock, MapPin, NavigationArrow, Camera } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { StatusPill } from '../../components/StatusPill'
import { estimateGross, formatCurrency, formatHours, shiftHours } from '../../utils/pay'
import {
  formatNzDate,
  formatNzTime,
  formatShiftTimeRange,
  nzDateIso,
  nzStartOfDayInstant,
} from '../../utils/datetime'
import type { RosterEntry, Shift } from '../../types'

function elapsedHours(startIso: string): number {
  return Math.max((Date.now() - new Date(startIso).getTime()) / 1000 / 60 / 60, 0)
}

function formatElapsed(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime()
  const totalMinutes = Math.max(Math.floor(ms / 1000 / 60), 0)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

export function WorkerHome() {
  const { appUser } = useAuth()
  const [openShift, setOpenShift] = useState<Shift | null>(null)
  const [todayCompletedHours, setTodayCompletedHours] = useState(0)
  const [todayRoster, setTodayRoster] = useState<RosterEntry | null>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'ok' | 'denied'>('idle')
  const [busy, setBusy] = useState(false)
  const [, forceTick] = useState(0)

  useEffect(() => {
    if (!appUser) return

    supabase
      .from('shifts')
      .select('*')
      .eq('user_id', appUser.id)
      .is('clock_out_time', null)
      .order('clock_in_time', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setOpenShift(data as Shift | null))

    supabase
      .from('roster_entries')
      .select('*')
      .eq('user_id', appUser.id)
      .eq('date', nzDateIso())
      .maybeSingle()
      .then(({ data }) => setTodayRoster(data as RosterEntry | null))

    supabase
      .from('shifts')
      .select('clock_in_time, clock_out_time, rejected')
      .eq('user_id', appUser.id)
      .not('clock_out_time', 'is', null)
      .gte('clock_in_time', nzStartOfDayInstant(nzDateIso()))
      .then(({ data }) => {
        // Rejected shifts don't count toward the pay estimate — they won't be paid.
        const completed = (
          (data as Pick<Shift, 'clock_in_time' | 'clock_out_time' | 'rejected'>[]) ?? []
        ).filter((s) => !s.rejected)
        setTodayCompletedHours(completed.reduce((sum, s) => sum + shiftHours(s), 0))
      })
  }, [appUser])

  useEffect(() => {
    if (!openShift) return
    const id = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [openShift])

  function getLocation(): Promise<{ lat: number | null; lng: number | null }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGpsStatus('denied')
        resolve({ lat: null, lng: null })
        return
      }
      setGpsStatus('locating')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus('ok')
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        },
        () => {
          setGpsStatus('denied')
          resolve({ lat: null, lng: null })
        },
        // Without enableHighAccuracy, browsers often fall back to a
        // coarse WiFi/IP-based location lookup that can be wildly off
        // (sometimes a different country) instead of the device's GPS.
        { enableHighAccuracy: true, timeout: 15000 }
      )
    })
  }

  async function handleClockIn() {
    if (!appUser) return
    setBusy(true)
    const { lat, lng } = await getLocation()

    const { data, error } = await supabase
      .from('shifts')
      .insert({
        user_id: appUser.id,
        business_id: appUser.business_id,
        clock_in_time: new Date().toISOString(),
        gps_lat: lat,
        gps_lng: lng,
      })
      .select()
      .single()

    if (!error) setOpenShift(data as Shift)
    setBusy(false)
  }

  async function handleClockOut() {
    if (!openShift || !appUser) return
    setBusy(true)

    let photoUrl: string | null = null
    if (photo) {
      const path = `${appUser.business_id}/${appUser.id}/${openShift.id}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('shift-photos')
        .upload(path, photo, { upsert: true })
      if (!uploadError) {
        photoUrl = supabase.storage.from('shift-photos').getPublicUrl(path).data.publicUrl
      }
    }

    const { error } = await supabase
      .from('shifts')
      .update({
        clock_out_time: new Date().toISOString(),
        note: note || null,
        photo_url: photoUrl,
      })
      .eq('id', openShift.id)

    if (!error) {
      setOpenShift(null)
      setNote('')
      setPhoto(null)
    }
    setBusy(false)
  }

  const liveHours = todayCompletedHours + (openShift ? elapsedHours(openShift.clock_in_time) : 0)
  const liveGross = estimateGross(liveHours, appUser?.hourly_rate ?? null)

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="text-sm text-muted-fg">
          {formatNzDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="font-heading text-2xl font-bold text-fg">
          {appUser ? `G'day, ${appUser.name.split(' ')[0]}` : 'G’day'}
        </h1>
      </div>

      <Card className="!bg-navy text-navy-fg">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-fg/70">Today</p>
        <p className="mt-2 font-heading text-3xl font-extrabold">{formatCurrency(liveGross)}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-navy-fg/70">Estimate — before tax</p>
        <p className="mt-2 text-xs text-navy-fg/70">{formatHours(liveHours)} logged</p>
      </Card>

      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        {openShift ? (
          <>
            <StatusPill tone="success" icon={<Clock size={14} weight="fill" />}>
              Clocked in
            </StatusPill>
            <p className="font-heading text-4xl font-extrabold text-fg">
              {formatElapsed(openShift.clock_in_time)}
            </p>
            <p className="text-xs text-muted-fg">
              Since {formatNzTime(openShift.clock_in_time)}
            </p>
          </>
        ) : (
          <>
            <StatusPill tone="muted" icon={<Clock size={14} weight="regular" />}>
              Not clocked in
            </StatusPill>
            <p className="text-sm text-muted-fg">Ready to start your shift?</p>
          </>
        )}

        <Button
          size="lg"
          fullWidth
          variant={openShift ? 'destructive' : 'primary'}
          disabled={busy}
          onClick={openShift ? handleClockOut : handleClockIn}
        >
          {busy ? 'Working…' : openShift ? 'Clock out' : 'Clock in'}
        </Button>

        {gpsStatus === 'locating' && (
          <p className="flex items-center gap-1 text-xs text-muted-fg">
            <NavigationArrow size={14} /> Getting your location…
          </p>
        )}
        {gpsStatus === 'denied' && (
          <p className="text-xs text-muted-fg">Location unavailable — clock-in still recorded.</p>
        )}
      </Card>

      {openShift && (
        <Card className="flex flex-col gap-3">
          <label className="text-sm font-medium text-fg" htmlFor="shift-note">
            Note (optional)
          </label>
          <textarea
            id="shift-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth flagging about this shift…"
            rows={2}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-fg outline-none transition-colors duration-150 focus:border-accent"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-accent">
            <Camera size={18} />
            {photo ? photo.name : 'Attach a photo (optional)'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </Card>
      )}

      <Card>
        <div className="mb-2 flex items-center gap-2">
          <MapPin size={18} className="text-muted-fg" />
          <h2 className="font-heading text-sm font-bold text-fg">Today's roster</h2>
        </div>
        {todayRoster ? (
          <>
            <p className="text-sm text-fg">{todayRoster.location_label}</p>
            {formatShiftTimeRange(todayRoster.start_time, todayRoster.end_time) && (
              <p className="mt-1 text-xs text-muted-fg">
                {formatShiftTimeRange(todayRoster.start_time, todayRoster.end_time)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-fg">No location assigned for today.</p>
        )}
      </Card>
    </div>
  )
}
