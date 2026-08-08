import type { Shift } from '../types'

export function shiftHours(shift: Pick<Shift, 'clock_in_time' | 'clock_out_time'>): number {
  if (!shift.clock_out_time) return 0
  const ms = new Date(shift.clock_out_time).getTime() - new Date(shift.clock_in_time).getTime()
  return Math.max(ms / 1000 / 60 / 60, 0)
}

// A shift still open (no clock_out_time) this long after clocking in is
// almost certainly a forgotten clock-out rather than a genuinely long
// shift — no realistic single shift for this kind of work runs 16+ hours,
// but it's comfortably past even a very long legitimate day, so it won't
// false-flag someone who's just having a big one.
export const STALE_SHIFT_HOURS = 16

export function isStaleOpenShift(shift: Pick<Shift, 'clock_in_time' | 'clock_out_time'>): boolean {
  if (shift.clock_out_time) return false
  const hoursOpen = (Date.now() - new Date(shift.clock_in_time).getTime()) / 1000 / 60 / 60
  return hoursOpen > STALE_SHIFT_HOURS
}

export function formatHours(hours: number): string {
  const totalMinutes = Math.round(Math.max(hours, 0) * 60)
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${wholeHours}h` : `${wholeHours}h ${String(minutes).padStart(2, '0')}m`
}

export function estimateGross(hours: number, hourlyRate: number | null): number {
  if (!hourlyRate) return 0
  return hours * hourlyRate
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(amount)
}
