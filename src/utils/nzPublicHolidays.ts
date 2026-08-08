// Flags whether a date falls on a recognised NZ public holiday, so a flat
// hours × rate pay estimate can carry a "this might be understated" note
// rather than silently ignoring holiday pay (often 1.5x) entirely.
// Deliberately does NOT attempt to calculate what the correct holiday
// rate/multiplier would be — that's real payroll-compliance territory
// (depends on whether the day was already a scheduled work day,
// alternative holidays, etc.) well beyond what a flat estimate tool
// should take on. This only covers NATIONAL public holidays — NZ's
// regional anniversary days vary by province, and nothing in this app's
// data model captures which region a business operates in, so those are
// intentionally left out rather than guessed at.

import { nzDateIso } from './datetime'

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// NZ's "Mondayisation" rule for a pair of statutory holidays that fall on
// consecutive calendar days (New Year's Day + Day after New Year's Day,
// or Christmas Day + Boxing Day) — handles the case where both would
// otherwise land on the same observed Monday.
function mondayisedPair(date1: Date): [Date, Date] {
  const date2 = addDays(date1, 1)
  const dow = date1.getUTCDay()
  if (dow === 0) return [addDays(date1, 1), addDays(date2, 1)] // Sun -> Mon; Mon (clash) -> Tue
  if (dow === 5) return [date1, addDays(date2, 2)] // Fri stays; Sat -> Mon
  if (dow === 6) return [addDays(date1, 2), addDays(date2, 2)] // Sat -> Mon; Sun -> Tue
  return [date1, date2] // Mon-Thu already, no shift needed
}

// Single-day mondayisation (Waitangi Day, ANZAC Day): shifts to the
// following Monday only if it falls on a Saturday or Sunday.
function mondayisedSingle(date: Date): Date {
  const dow = date.getUTCDay()
  if (dow === 6) return addDays(date, 2)
  if (dow === 0) return addDays(date, 1)
  return date
}

// Meeus/Jones/Butcher Gregorian algorithm for the date of Easter Sunday.
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function nthMondayOfMonth(year: number, month: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1))
  const offsetToFirstMonday = (8 - first.getUTCDay()) % 7
  return new Date(Date.UTC(year, month, 1 + offsetToFirstMonday + (n - 1) * 7))
}

// Matariki has no fixed formula — dates are set by the NZ government each
// year and published years in advance. This needs extending as further
// years are officially confirmed (see the NZ Government's public
// holidays list); a shift in a year beyond this table just won't be
// flagged for Matariki specifically — every other national holiday still
// is, since those are all calculable.
const MATARIKI_DATES: Record<number, string> = {
  2022: '2022-06-24',
  2023: '2023-07-14',
  2024: '2024-06-28',
  2025: '2025-06-20',
  2026: '2026-07-10',
  2027: '2027-06-25',
  2028: '2028-07-14',
  2029: '2029-06-29',
  2030: '2030-06-21',
}

const holidaySetCache = new Map<number, Set<string>>()

function nzPublicHolidaysForYear(year: number): Set<string> {
  const cached = holidaySetCache.get(year)
  if (cached) return cached

  const [newYearsDay, dayAfterNewYears] = mondayisedPair(new Date(Date.UTC(year, 0, 1)))
  const waitangiDay = mondayisedSingle(new Date(Date.UTC(year, 1, 6)))
  const easter = easterSunday(year)
  const goodFriday = addDays(easter, -2)
  const easterMonday = addDays(easter, 1)
  const anzacDay = mondayisedSingle(new Date(Date.UTC(year, 3, 25)))
  const kingsBirthday = nthMondayOfMonth(year, 5, 1)
  const labourDay = nthMondayOfMonth(year, 9, 4)
  const [christmasDay, boxingDay] = mondayisedPair(new Date(Date.UTC(year, 11, 25)))

  const dates = [
    newYearsDay,
    dayAfterNewYears,
    waitangiDay,
    goodFriday,
    easterMonday,
    anzacDay,
    kingsBirthday,
    labourDay,
    christmasDay,
    boxingDay,
  ].map(toIso)

  if (MATARIKI_DATES[year]) dates.push(MATARIKI_DATES[year])

  const set = new Set(dates)
  holidaySetCache.set(year, set)
  return set
}

// National NZ public holidays only — see file header re: regional
// anniversary days. Accepts anything nzDateIso does (an ISO timestamp
// string or a Date) and checks the NZ calendar day it falls on, matching
// how the rest of the app treats "what date is this" — a shift that
// clocked in late at night UTC but is already tomorrow in NZ time is
// checked against the correct NZ date, not a UTC-shifted one.
export function isNzPublicHoliday(date: Date | string): boolean {
  const nzDate = nzDateIso(typeof date === 'string' ? new Date(date) : date)
  const year = Number(nzDate.slice(0, 4))
  return nzPublicHolidaysForYear(year).has(nzDate)
}
