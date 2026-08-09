// Open-Meteo (https://open-meteo.com) — free, no API key or account
// needed, permissive CORS, so this can be called directly from the
// browser with no backend involved at all.
export interface CurrentWeather {
  temperatureC: number
  code: number
}

// A plain `| null` return here previously made every possible failure —
// a dropped connection, a 5xx from Open-Meteo, a malformed response body
// — look identical from the caller's side, which made a real production
// issue (weather silently missing on mobile) impossible to diagnose
// without re-deriving it from scratch. Each reason is distinct so the
// caller can show and log something specific instead of just "unavailable".
export type WeatherFetchResult =
  | { ok: true; data: CurrentWeather }
  | { ok: false; reason: 'network' | 'http_error' | 'bad_data'; detail: string }

export async function fetchCurrentWeather(lat: number, lng: number): Promise<WeatherFetchResult> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=Pacific%2FAuckland`

  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    return { ok: false, reason: 'network', detail: err instanceof Error ? err.message : String(err) }
  }

  if (!res.ok) {
    return { ok: false, reason: 'http_error', detail: `HTTP ${res.status}` }
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return { ok: false, reason: 'bad_data', detail: 'Response body was not valid JSON' }
  }

  const current = (data as { current?: { temperature_2m?: unknown; weather_code?: unknown } })?.current
  if (typeof current?.temperature_2m !== 'number' || typeof current?.weather_code !== 'number') {
    return { ok: false, reason: 'bad_data', detail: `Unexpected response shape: ${JSON.stringify(data)}` }
  }

  return { ok: true, data: { temperatureC: current.temperature_2m, code: current.weather_code } }
}

export type WeatherKind = 'sun' | 'cloud-sun' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm'

// WMO weather codes, as returned by Open-Meteo's `weather_code` field —
// https://open-meteo.com/en/docs lists the full table; this covers the
// conditions actually worth distinguishing in a one-line indicator.
const WEATHER_CODES: Record<number, { label: string; kind: WeatherKind }> = {
  0: { label: 'Clear', kind: 'sun' },
  1: { label: 'Mostly clear', kind: 'cloud-sun' },
  2: { label: 'Partly cloudy', kind: 'cloud-sun' },
  3: { label: 'Overcast', kind: 'cloud' },
  45: { label: 'Foggy', kind: 'fog' },
  48: { label: 'Foggy', kind: 'fog' },
  51: { label: 'Light drizzle', kind: 'rain' },
  53: { label: 'Drizzle', kind: 'rain' },
  55: { label: 'Heavy drizzle', kind: 'rain' },
  56: { label: 'Freezing drizzle', kind: 'rain' },
  57: { label: 'Freezing drizzle', kind: 'rain' },
  61: { label: 'Light rain', kind: 'rain' },
  63: { label: 'Rain', kind: 'rain' },
  65: { label: 'Heavy rain', kind: 'rain' },
  66: { label: 'Freezing rain', kind: 'rain' },
  67: { label: 'Freezing rain', kind: 'rain' },
  71: { label: 'Light snow', kind: 'snow' },
  73: { label: 'Snow', kind: 'snow' },
  75: { label: 'Heavy snow', kind: 'snow' },
  77: { label: 'Snow grains', kind: 'snow' },
  80: { label: 'Rain showers', kind: 'rain' },
  81: { label: 'Rain showers', kind: 'rain' },
  82: { label: 'Heavy showers', kind: 'rain' },
  85: { label: 'Snow showers', kind: 'snow' },
  86: { label: 'Snow showers', kind: 'snow' },
  95: { label: 'Thunderstorm', kind: 'storm' },
  96: { label: 'Thunderstorm', kind: 'storm' },
  99: { label: 'Thunderstorm', kind: 'storm' },
}

export function describeWeatherCode(code: number): { label: string; kind: WeatherKind } {
  return WEATHER_CODES[code] ?? { label: 'Overcast', kind: 'cloud' }
}
