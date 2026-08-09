// Supabase Edge Function: roster-weather-forecast
//
// Called by the admin Roster Builder (any location on the business's
// roster for the visible week) and the worker Roster page (that worker's
// own upcoming roster locations only — enforced below, not just trusted
// from the request body) to show a day-by-day weather outlook.
// This is deliberately a *different* kind of lookup from the worker Home
// screen's weather (src/utils/weather.ts): that one asks the device's own
// GPS for "conditions right now, here". This one has no device to ask —
// a roster location is a free-text label ("Bush Rd Orchard, Block 4"),
// possibly for a week that hasn't started yet — so it needs a forward
// geocode (label -> lat/lng) before it can even ask for a forecast, and
// then a *daily* forecast across a date range rather than "current".
//
// Runs server-side for the same reason as reverse-geocode: Nominatim's
// usage policy requires a real User-Agent header browser JS can't set,
// and its ~1 request/second fair-use limit is easier to respect from one
// place than from every admin's browser independently. Geocoded labels
// are cached in geocoded_locations (see schema.sql) so a given label is
// only ever sent to Nominatim once, successful or not.
//
// Deploy: supabase functions deploy roster-weather-forecast

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

async function geocode(label: string): Promise<{ lat: number | null; lng: number | null }> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=nz&q=${encodeURIComponent(label)}`
    const res = await fetch(url, {
      headers: {
        // Required by Nominatim's usage policy — see reverse-geocode for
        // the same requirement on the other direction of this lookup.
        'User-Agent': 'Crewclock/1.0 (contact: arundeepatkar2008@gmail.com)',
      },
    })
    if (!res.ok) return { lat: null, lng: null }
    const results = (await res.json()) as { lat: string; lon: string }[]
    const first = results[0]
    if (!first) return { lat: null, lng: null }
    return { lat: Number(first.lat), lng: Number(first.lon) }
  } catch {
    return { lat: null, lng: null }
  }
}

async function fetchDailyForecast(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<DayForecast[]> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Pacific%2FAuckland&start_date=${startDate}&end_date=${endDate}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const daily = data?.daily
    if (!daily?.time) return []
    return (daily.time as string[]).map((date, i) => ({
      date,
      code: daily.weather_code[i],
      tempMax: daily.temperature_2m_max[i],
      tempMin: daily.temperature_2m_min[i],
    }))
  } catch {
    // Open-Meteo's free forecast endpoint only covers roughly the next
    // ~16 days — a week far enough in the future (or past) than that
    // legitimately has no forecast available yet, not an error to surface.
    return []
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await callerClient.auth.getUser()

  if (!user) {
    return json({ error: 'Not authenticated' }, 401)
  }

  const { data: callerProfile, error: callerError } = await callerClient
    .from('users')
    .select('id, role, business_id')
    .eq('auth_id', user.id)
    .single()

  if (callerError || !callerProfile) {
    return json({ error: 'Could not identify your account' }, 403)
  }

  const { location_labels, start_date, end_date } = await req.json()

  if (!Array.isArray(location_labels) || location_labels.length === 0) {
    return json({ error: 'location_labels is required' }, 400)
  }
  if (typeof start_date !== 'string' || typeof end_date !== 'string') {
    return json({ error: 'start_date and end_date are required' }, 400)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  let uniqueLabels = Array.from(new Set<string>(location_labels))

  // An admin can ask about any location on their business's roster. A
  // worker can only ask about locations that actually appear on their own
  // upcoming roster — derived server-side rather than trusting the
  // request body, so this can't be used to probe arbitrary locations.
  if (callerProfile.role !== 'admin') {
    const { data: ownEntries } = await adminClient
      .from('roster_entries')
      .select('location_label')
      .eq('user_id', callerProfile.id)
      .eq('business_id', callerProfile.business_id)
      .gte('date', start_date)
      .lte('date', end_date)

    const allowedLabels = new Set((ownEntries ?? []).map((e) => e.location_label))
    uniqueLabels = uniqueLabels.filter((label) => allowedLabels.has(label))

    if (uniqueLabels.length === 0) {
      return json({ forecasts: [] }, 200)
    }
  }

  const { data: cached } = await adminClient
    .from('geocoded_locations')
    .select('location_label, lat, lng')
    .eq('business_id', callerProfile.business_id)
    .in('location_label', uniqueLabels)

  const cacheMap = new Map((cached ?? []).map((c) => [c.location_label, { lat: c.lat, lng: c.lng }]))

  const forecasts: LocationForecast[] = []
  let firstFreshLookup = true

  for (const label of uniqueLabels) {
    let coords = cacheMap.get(label)

    if (!coords) {
      // Nominatim's fair-use policy caps the public instance at roughly
      // 1 request/second — only labels not already cached ever reach it,
      // and only one at a time within this loop.
      if (!firstFreshLookup) await new Promise((resolve) => setTimeout(resolve, 1100))
      firstFreshLookup = false

      coords = await geocode(label)
      await adminClient.from('geocoded_locations').insert({
        business_id: callerProfile.business_id,
        location_label: label,
        lat: coords.lat,
        lng: coords.lng,
      })
    }

    const days =
      coords.lat != null && coords.lng != null
        ? await fetchDailyForecast(coords.lat, coords.lng, start_date, end_date)
        : []

    forecasts.push({ location_label: label, lat: coords.lat, lng: coords.lng, days })
  }

  return json({ forecasts }, 200)
})
