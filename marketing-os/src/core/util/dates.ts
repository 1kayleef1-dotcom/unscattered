import type { ISODate } from '../types.ts'

const DAY = 86_400_000

export function toDay(date: ISODate): string {
  return date.slice(0, 10)
}

export function addDays(date: ISODate, days: number): ISODate {
  return new Date(new Date(date).getTime() + days * DAY).toISOString()
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY)
}

/** True when `date` falls in the half-open window (now - fromDaysAgo, now - toDaysAgo]. */
export function inWindow(date: ISODate, now: ISODate, fromDaysAgo: number, toDaysAgo = 0): boolean {
  const age = (new Date(now).getTime() - new Date(date).getTime()) / DAY
  return age < fromDaysAgo && age >= toDaysAgo
}
