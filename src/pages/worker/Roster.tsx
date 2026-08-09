import { useEffect, useMemo, useState } from 'react'
import {
  Clock,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Flag,
  MapPin,
  Sun,
} from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader } from '../../components/PageHeader'
import { Card } from '../../components/Card'
import { FlagAdminModal } from '../../components/FlagAdminModal'
import { formatNzDate, formatShiftTimeRange, nzDateIso } from '../../utils/datetime'
import { describeWeatherCode, type WeatherKind } from '../../utils/weather'
import type { RosterEntry } from '../../types'

const WEATHER_ICONS: Record<WeatherKind, typeof Sun> = {
  sun: Sun,
  'cloud-sun': CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
}

// Open-Meteo's free forecast endpoint only reliably covers roughly the
// next 16 days — no point asking for a forecast further out than that,
// even though the roster list itself shows everything upcoming.
const FORECAST_HORIZON_DAYS = 14

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

export function WorkerRoster() {
  const { appUser } = useAuth()
  const [entries, setEntries] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [flaggedEntryIds, setFlaggedEntryIds] = useState<Set<string>>(new Set())
  const [flagTarget, setFlagTarget] = useState<RosterEntry | null>(null)
  const [forecasts, setForecasts] = useState<LocationForecast[]>([])

  const forecastEnd = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + FORECAST_HORIZON_DAYS)
    return nzDateIso(d)
  }, [])

  const distinctForecastLocations = useMemo(
    () =>
      Array.from(
        new Set(entries.filter((e) => e.date <= forecastEnd).map((e) => e.location_label))
      ).sort(),
    [entries, forecastEnd]
  )

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

  useEffect(() => {
    if (distinctForecastLocations.length === 0) {
      setForecasts([])
      return
    }
    supabase.functions
      .invoke('roster-weather-forecast', {
        body: {
          location_labels: distinctForecastLocations,
          start_date: nzDateIso(),
          end_date: forecastEnd,
        },
      })
      .then(({ data, error }) => {
        setForecasts(!error && data?.forecasts ? (data.forecasts as LocationForecast[]) : [])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distinctForecastLocations.join('|'), forecastEnd])

  function forecastFor(entry: RosterEntry): DayForecast | null {
    const loc = forecasts.find((f) => f.location_label === entry.location_label)
    return loc?.days.find((d) => d.date === entry.date) ?? null
  }

  return (
    <div>
      <PageHeader title="Upcoming roster" subtitle="Where you're working next" />

      <div className="flex flex-col gap-3 p-4">
        {loading && <p className="text-sm text-muted-fg">Loading roster…</p>}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-muted-fg">No upcoming shifts have been rostered yet.</p>
        )}

        {entries.map((entry) => {
          const forecast = forecastFor(entry)
          return (
          <Card key={entry.id} className="flex items-start justify-between gap-3">
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
            {forecast &&
              (() => {
                const { label, kind } = describeWeatherCode(forecast.code)
                const Icon = WEATHER_ICONS[kind]
                return (
                  <div className="flex shrink-0 flex-col items-center gap-0.5 text-center">
                    <span title={label}>
                      <Icon size={20} />
                    </span>
                    <p className="text-xs text-fg">
                      {Math.round(forecast.tempMax)}°{' '}
                      <span className="text-muted-fg">{Math.round(forecast.tempMin)}°</span>
                    </p>
                  </div>
                )
              })()}
          </Card>
          )
        })}
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
