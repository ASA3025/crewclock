// Supabase Edge Function: reverse-geocode
//
// Called by the admin Hours page to turn a shift's stored GPS coordinates
// into a readable address, shown alongside the existing "View map" link.
// Runs server-side because OpenStreetMap Nominatim's usage policy requires
// a real, identifying User-Agent header — something browser JS can't set
// (fetch silently ignores attempts to override it), so this genuinely
// can't be done as a direct client-side call. Results are cached back
// onto the shift row (shifts.address) so a given shift is only ever
// geocoded once, no matter how many times it's viewed after that.
//
// Uses OpenStreetMap's free Nominatim service rather than Google's
// Geocoding API — no API key, no billing account, no signup at all. Its
// usage policy caps the public instance at roughly 1 request/second,
// which is why the admin Hours page calls this one shift at a time with a
// delay between calls rather than firing them all at once. If this app
// ever outgrows Nominatim's fair-use limits, swapping in a paid provider
// (Google, Mapbox, LocationIQ) only means changing the fetch call below —
// the caching and rate-limiting design on the frontend stays the same.
//
// Deploy: supabase functions deploy reverse-geocode
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the Supabase platform for every Edge
// Function — no manual secrets needed for this one. See SETUP.md.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface NominatimAddress {
  road?: string
  suburb?: string
  village?: string
  hamlet?: string
  town?: string
  city?: string
  county?: string
}

interface NominatimResult {
  display_name?: string
  address?: NominatimAddress
}

// A short "Road, Suburb, City" form reads far better in a table cell than
// Nominatim's full display_name (which tends to include postcode,
// region, and country) — falls back to display_name if the structured
// address doesn't have enough to build a short form from.
function shortAddress(result: NominatimResult): string | null {
  const addr = result.address ?? {}
  const parts = [
    addr.road,
    addr.suburb ?? addr.village ?? addr.hamlet,
    addr.city ?? addr.town ?? addr.county,
  ].filter((part): part is string => Boolean(part))

  if (parts.length > 0) return parts.join(', ')
  return result.display_name ?? null
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

  // Client scoped to the caller's own JWT, used only to verify who's asking.
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
    .select('role, business_id')
    .eq('auth_id', user.id)
    .single()

  if (callerError || !callerProfile || callerProfile.role !== 'admin') {
    return json({ error: 'Only an admin can look up shift addresses' }, 403)
  }

  const { shift_id } = await req.json()

  if (!shift_id) {
    return json({ error: 'shift_id is required' }, 400)
  }

  // Admin client with the service role key, used only after the caller has
  // been confirmed to be an admin above.
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: shift, error: shiftError } = await adminClient
    .from('shifts')
    .select('business_id, gps_lat, gps_lng, address')
    .eq('id', shift_id)
    .single()

  if (shiftError || !shift || shift.business_id !== callerProfile.business_id) {
    return json({ error: 'Shift not found' }, 404)
  }

  if (shift.address) {
    return json({ address: shift.address }, 200)
  }

  if (shift.gps_lat == null || shift.gps_lng == null) {
    return json({ address: null }, 200)
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${shift.gps_lat}&lon=${shift.gps_lng}&zoom=18&addressdetails=1`
    const res = await fetch(url, {
      headers: {
        // Required by Nominatim's usage policy — identifies the app so
        // OSM has a way to reach us if there's ever a problem, rather
        // than just silently blocking unidentified traffic.
        'User-Agent': 'Crewclock/1.0 (contact: arundeepatkar2008@gmail.com)',
      },
    })

    if (!res.ok) {
      return json({ address: null }, 200)
    }

    const result = (await res.json()) as NominatimResult
    const address = shortAddress(result)

    if (address) {
      await adminClient.from('shifts').update({ address }).eq('id', shift_id)
    }

    return json({ address }, 200)
  } catch {
    // Geocoding is a nice-to-have overlay on the raw coordinates (always
    // shown via "View map" regardless) — a failed lookup should never
    // surface as an error the admin has to deal with.
    return json({ address: null }, 200)
  }
})
