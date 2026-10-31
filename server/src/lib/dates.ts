import { addDays, addMonths, addWeeks, addYears } from 'date-fns';

export type Period = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** today's calendar date in India, as UTC midnight (how Prisma represents a DATE).
 *  At 00:05 IST on 1 Nov, new Date() is still 31 Oct in UTC; this returns 1 Nov. */
export function todayIST(now = new Date()): Date {
  return new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now));
}

export function addPeriods(anchor: Date, period: Period, k: number): Date {
  switch (period) {
    case 'DAILY':
      return addDays(anchor, k);
    case 'WEEKLY':
      return addWeeks(anchor, k);
    case 'MONTHLY':
      return addMonths(anchor, k); // clamps Jan 31 + 1 → Feb 28
    case 'YEARLY':
      return addYears(anchor, k);
  }
}

/** first period boundary strictly after `current`, counted from the anchor */
export function nextBoundary(anchor: Date, period: Period, current: Date): Date {
  let k = 1;
  while (addPeriods(anchor, period, k) <= current) k++;
  return addPeriods(anchor, period, k);
}

/** Date → "YYYY-MM-DD" (dates are UTC midnight because the server runs with TZ=UTC) */
export const toISODate = (d: Date): string => d.toISOString().slice(0, 10);

/** "YYYY-MM-DD" → UTC midnight Date */
export const fromISODate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
