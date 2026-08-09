import { useEffect, useMemo, useState } from 'react'
import {
  CaretLeft,
  CaretRight,
  Trash,
  Plus,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { formatNzDate, formatShiftTimeRange, nzDateIso } from '../../utils/datetime'
import { describeWeatherCode, type WeatherKind } from '../../utils/weather'
import type { AppUser, RosterEntryWithWorker } from '../../types'

const WEATHER_ICONS: Record<WeatherKind, typeof Sun> = {
  sun: Sun,
  'cloud-sun': CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
}

interface DayForecast {
  date: string
  code: number
  tempMax: number
  tempMin: number
}

interface LocationForecast {
  location_label: string
  lat: number | null
  lng: number | null
  days: DayForecast[]
}

function startOfWeek(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export function AdminRosterBuilder() {
  const { appUser } = useAuth()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [entries, setEntries] = useState<RosterEntryWithWorker[]>([])
  const [workers, setWorkers] = useState<AppUser[]>([])
  const [formDay, setFormDay] = useState<string | null>(null)
  const [formWorker, setFormWorker] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formStartTime, setFormStartTime] = useState('')
  const [formEndTime, setFormEndTime] = useState('')
  const [forecasts, setForecasts] = useState<LocationForecast[]>([])
  const [forecastsLoading, setForecastsLoading] = useState(false)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const weekEnd = days[6]

  const distinctLocations = useMemo(
    () => Array.from(new Set(entries.map((e) => e.location_label))).sort(),
    [entries]
  )

  async function load() {
    if (!appUser) return
    const { data } = await supabase
      .from('roster_entries')
      .select('*, users(id, name)')
      .eq('business_id', appUser.business_id)
      .gte('date', nzDateIso(weekStart))
      .lte('date', nzDateIso(weekEnd))
      .order('date')
    setEntries((data as RosterEntryWithWorker[]) ?? [])
  }

  useEffect(() => {
    if (!appUser) return
    supabase
      .from('users')
      .select('*')
      .eq('business_id', appUser.business_id)
      .eq('role', 'worker')
      .order('name')
      .then(({ data }) => setWorkers((data as AppUser[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser, weekStart])

  useEffect(() => {
    if (distinctLocations.length === 0) {
      setForecasts([])
      return
    }
    setForecastsLoading(true)
    supabase.functions
      .invoke('roster-weather-forecast', {
        body: {
          location_labels: distinctLocations,
          start_date: nzDateIso(weekStart),
          end_date: nzDateIso(weekEnd),
        },
      })
      .then(({ data, error }) => {
        setForecasts(!error && data?.forecasts ? (data.forecasts as LocationForecast[]) : [])
        setForecastsLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distinctLocations.join('|'), weekStart])

  function openForm(dayIso: string) {
    setFormDay(dayIso)
    setFormWorker(workers[0]?.id ?? '')
    setFormLocation('')
    setFormStartTime('')
    setFormEndTime('')
  }

  async function addEntry() {
    if (!appUser || !formDay || !formWorker || !formLocation.trim()) return
    await supabase.from('roster_entries').insert({
      business_id: appUser.business_id,
      user_id: formWorker,
      date: formDay,
      location_label: formLocation.trim(),
      start_time: formStartTime || null,
      end_time: formEndTime || null,
    })
    setFormDay(null)
    load()
  }

  async function removeEntry(id: string) {
    await supabase.from('roster_entries').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Roster"
        subtitle="Assign the crew to days and locations"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart((d) => new Date(d.getTime() - 7 * 86400000))}
              aria-label="Previous week"
              className="cursor-pointer rounded-md p-2 hover:bg-muted"
            >
              <CaretLeft size={18} />
            </button>
            <span className="text-sm font-medium text-fg">
              {formatNzDate(weekStart, { day: 'numeric', month: 'short' })} –{' '}
              {formatNzDate(weekEnd, { day: 'numeric', month: 'short' })}
            </span>
            <button
              onClick={() => setWeekStart((d) => new Date(d.getTime() + 7 * 86400000))}
              aria-label="Next week"
              className="cursor-pointer rounded-md p-2 hover:bg-muted"
            >
              <CaretRight size={18} />
            </button>
          </div>
        }
      />

      {distinctLocations.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pt-4 md:px-8 md:pt-8">
          <h2 className="font-heading text-sm font-bold text-fg">Weather outlook</h2>
          {forecastsLoading && forecasts.length === 0 && (
            <p className="text-xs text-muted-fg">Loading forecast…</p>
          )}
          {!forecastsLoading && forecasts.length === 0 && (
            <p className="text-xs text-muted-fg">Forecast unavailable for this week.</p>
          )}
          <div className="flex flex-col gap-2">
            {forecasts.map((loc) => (
              <Card key={loc.location_label} className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                <p className="w-full shrink-0 text-xs font-semibold text-fg md:w-40">
                  {loc.location_label}
                </p>
                {loc.days.length === 0 ? (
                  <p className="text-xs text-muted-fg">
                    {loc.lat == null
                      ? "Couldn't find this location for a forecast."
                      : 'No forecast available for this week yet.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-7 gap-2">
                    {loc.days.map((day) => {
                      const { label, kind } = describeWeatherCode(day.code)
                      const Icon = WEATHER_ICONS[kind]
                      return (
                        <div key={day.date} className="flex flex-col items-center gap-0.5 text-center">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-fg">
                            {formatNzDate(day.date, { weekday: 'short' })}
                          </p>
                          <span title={label}>
                            <Icon size={18} />
                          </span>
                          <p className="text-[11px] text-fg">
                            {Math.round(day.tempMax)}° <span className="text-muted-fg">{Math.round(day.tempMin)}°</span>
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 p-4 md:grid-cols-7 md:p-8">
        {days.map((day) => {
          const dayIso = nzDateIso(day)
          const dayEntries = entries.filter((e) => e.date === dayIso)
          return (
            <Card key={dayIso} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
                {formatNzDate(day, { weekday: 'short', day: 'numeric' })}
              </p>

              {dayEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-fg">{entry.users.name}</p>
                    <p className="text-xs text-muted-fg">{entry.location_label}</p>
                    {formatShiftTimeRange(entry.start_time, entry.end_time) && (
                      <p className="text-xs text-muted-fg">
                        {formatShiftTimeRange(entry.start_time, entry.end_time)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    aria-label="Remove roster entry"
                    className="cursor-pointer rounded-md p-1 text-muted-fg hover:text-destructive"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}

              {formDay === dayIso ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
                  <select
                    value={formWorker}
                    onChange={(e) => setFormWorker(e.target.value)}
                    className="h-9 rounded-md border border-border px-2 text-xs"
                  >
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="e.g. Bush Rd Orchard, Block 4"
                    className="h-9 rounded-md border border-border px-2 text-xs"
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium text-muted-fg">Start (optional)</label>
                    <input
                      type="time"
                      aria-label="Start time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="h-9 w-full rounded-md border border-border px-2 text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium text-muted-fg">End (optional)</label>
                    <input
                      type="time"
                      aria-label="End time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="h-9 w-full rounded-md border border-border px-2 text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="md" className="h-8 flex-1 px-2 text-xs" onClick={addEntry}>
                      Add
                    </Button>
                    <Button
                      size="md"
                      variant="secondary"
                      className="h-8 flex-1 px-2 text-xs"
                      onClick={() => setFormDay(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => openForm(dayIso)}
                  className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-fg transition-colors duration-150 hover:border-accent hover:text-accent"
                >
                  <Plus size={14} /> Assign
                </button>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
