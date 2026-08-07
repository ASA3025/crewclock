import type { Shift } from '../types'

export function shiftHours(shift: Pick<Shift, 'clock_in_time' | 'clock_out_time'>): number {
  if (!shift.clock_out_time) return 0
  const ms = new Date(shift.clock_out_time).getTime() - new Date(shift.clock_in_time).getTime()
  return Math.max(ms / 1000 / 60 / 60, 0)
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
