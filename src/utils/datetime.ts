// Crewclock is a single-timezone, NZ-only app (see SETUP.md), so every
// clock in/out time is shown and queried in NZ time regardless of the
// viewing device's own timezone — a worker's phone set to the wrong
// timezone shouldn't change what time their shift shows for payroll.
const NZ_TIME_ZONE = 'Pacific/Auckland'

export function formatNzTime(iso: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(iso).toLocaleTimeString('en-NZ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: NZ_TIME_ZONE,
    ...options,
  })
}

export function formatNzDate(date: string | Date, options: Intl.DateTimeFormatOptions = {}): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-NZ', { timeZone: NZ_TIME_ZONE, ...options })
}

// "YYYY-MM-DD" calendar date as seen in NZ — for comparing against plain
// DATE columns (roster_entries.date), which need no timezone conversion,
// and for keying "is this the current NZ day/month" checks client-side.
export function nzDateIso(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: NZ_TIME_ZONE }).format(date)
}

export function nzStartOfMonthIso(date: Date = new Date()): string {
  return `${nzDateIso(date).slice(0, 7)}-01`
}

// Monday of the NZ week containing the given date. Day-of-week is
// timezone-independent once you have the right calendar date, so this
// is safe to compute via plain UTC date arithmetic on that date string.
export function nzStartOfWeekIso(date: Date = new Date()): string {
  const ymd = nzDateIso(date)
  const start = new Date(`${ymd}T00:00:00Z`)
  const dayOfWeek = start.getUTCDay() // 0 = Sunday .. 6 = Saturday
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  start.setUTCDate(start.getUTCDate() + diff)
  return start.toISOString().slice(0, 10)
}

// NZ's UTC offset (e.g. "+13:00") on the given calendar date — NZ
// observes daylight saving, so this shifts by an hour twice a year.
// Needed to turn a NZ wall-clock boundary into a real instant when
// filtering a timestamptz column like shifts.clock_in_time.
function nzOffset(ymd: string): string {
  // Noon UTC safely falls within the same NZ calendar day for offset
  // lookup purposes, regardless of which side of midnight NZ is on.
  const approx = new Date(`${ymd}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: NZ_TIME_ZONE,
    timeZoneName: 'shortOffset',
  }).formatToParts(approx)
  const match = parts.find((p) => p.type === 'timeZoneName')?.value.match(/GMT([+-]\d+)/)
  const hours = match ? Number(match[1]) : 12
  return `${hours >= 0 ? '+' : '-'}${String(Math.abs(hours)).padStart(2, '0')}:00`
}

// Real, offset-qualified instants for bounding a timestamptz range by NZ
// calendar day, e.g. .gte('clock_in_time', nzStartOfDayInstant(from))
export function nzStartOfDayInstant(ymd: string): string {
  return `${ymd}T00:00:00${nzOffset(ymd)}`
}

export function nzEndOfDayInstant(ymd: string): string {
  return `${ymd}T23:59:59${nzOffset(ymd)}`
}

// <input type="datetime-local"> has no timezone concept of its own — the
// browser just shows/returns wall-clock digits. To edit a shift's NZ time
// (not the admin's own device time), the value shown has to be the NZ
// wall clock, and what comes back has to be read as NZ wall clock too.
export function nzDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NZ_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function nzDatetimeLocalToInstant(value: string): string {
  return `${value}:00${nzOffset(value.slice(0, 10))}`
}

// Formats a plain "HH:MM" or "HH:MM:SS" wall-clock time — e.g. a roster
// entry's start_time/end_time (Postgres `time`, no date or timezone
// attached). Deliberately NOT run through the NZ timezone helpers above:
// there's no instant to convert, it's already the intended local time as
// the admin entered it.
export function formatWallClockTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-NZ', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatShiftTimeRange(
  startTime: string | null,
  endTime: string | null
): string | null {
  if (startTime && endTime) {
    return `${formatWallClockTime(startTime)} – ${formatWallClockTime(endTime)}`
  }
  if (startTime) return `From ${formatWallClockTime(startTime)}`
  if (endTime) return `Until ${formatWallClockTime(endTime)}`
  return null
}

// Minutes since midnight for a plain "HH:MM" or "HH:MM:SS" wall-clock
// time, so two such times (or a wall-clock time and "now") can be compared
// directly without going through any timezone/instant conversion.
export function wallClockMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// "Now", as minutes since midnight in NZ wall-clock time — the same
// reference frame as wallClockMinutes, so a roster entry's start_time can
// be compared directly against the current time of day.
export function nzNowMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: NZ_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

// Minutes since midnight, in NZ wall-clock time, of a real instant (e.g. a
// shift's clock_in_time) — the same reference frame as wallClockMinutes,
// so a shift's actual clock-in can be compared against a roster entry's
// planned start_time. Same reference frame as nzNowMinutes, but for a
// specific instant rather than always "now" — needed to work out lateness
// retrospectively (e.g. on the Hours page), not just live on Overview.
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
