// NZ-timezone helpers shared across Edge Functions that need to reason
// about "the previous week" or "which NZ calendar day" server-side —
// mirrors src/utils/datetime.ts's approach (same offset trick) but kept
// as its own small module here since Edge Functions bundle independently
// from the frontend app and shouldn't reach into src/.
const NZ_TIME_ZONE = 'Pacific/Auckland'

export function nzDateIso(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: NZ_TIME_ZONE }).format(date)
}

function nzOffset(ymd: string): string {
  const approx = new Date(`${ymd}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: NZ_TIME_ZONE,
    timeZoneName: 'shortOffset',
  }).formatToParts(approx)
  const match = parts.find((p) => p.type === 'timeZoneName')?.value.match(/GMT([+-]\d+)/)
  const hours = match ? Number(match[1]) : 12
  return `${hours >= 0 ? '+' : '-'}${String(Math.abs(hours)).padStart(2, '0')}:00`
}

export function nzStartOfDayInstant(ymd: string): string {
  return `${ymd}T00:00:00${nzOffset(ymd)}`
}

export function nzEndOfDayInstant(ymd: string): string {
  return `${ymd}T23:59:59${nzOffset(ymd)}`
}

export function addDaysIso(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Monday..Sunday of the full NZ week before the one "now" falls in — e.g.
// run on a Monday, this returns the just-finished Mon-Sun week.
export function previousNzWeekRange(now: Date = new Date()): { start: string; end: string } {
  const todayYmd = nzDateIso(now)
  const dow = new Date(`${todayYmd}T00:00:00Z`).getUTCDay() // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = dow === 0 ? 6 : dow - 1
  const thisMonday = addDaysIso(todayYmd, -daysSinceMonday)
  return { start: addDaysIso(thisMonday, -7), end: addDaysIso(thisMonday, -1) }
}

export function wallClockMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// Minutes since midnight, in NZ wall-clock time, of a real instant (e.g. a
// shift's clock_in_time) — the same reference frame as wallClockMinutes,
// so a shift's actual clock-in can be compared against a roster entry's
// planned start_time.
export function nzWallClockMinutesOfInstant(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: NZ_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

export function formatNzDateShort(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-NZ', {
    timeZone: NZ_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}
