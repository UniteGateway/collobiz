/**
 * Business-hours SLA calculator — Master Book §2.3 / §4.3:
 * "First-review timeout uses business-calendar configurations, pause reasons and event timestamps."
 * Time zones and working calendars are explicit (§6.5).
 */
export interface BusinessCalendar {
  timezone: string; // IANA, e.g. Asia/Kolkata
  workdays: number[]; // 0=Sun … 6=Sat
  startHour: number; // local hour business opens (e.g. 9)
  endHour: number; // local hour business closes (e.g. 18)
  holidays: string[]; // YYYY-MM-DD local dates
}

export const DEFAULT_CALENDAR: BusinessCalendar = {
  timezone: 'Asia/Kolkata',
  workdays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
  holidays: [],
};

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

interface LocalParts { y: number; m: number; d: number; h: number; mi: number; wd: number; date: string }

function localParts(t: Date, tz: string): LocalParts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(t)) p[part.type] = part.value;
  const y = +p.year, m = +p.month, d = +p.day;
  return { y, m, d, h: +p.hour % 24, mi: +p.minute, wd: WEEKDAY[p.weekday], date: `${p.year}-${p.month}-${p.day}` };
}

function offsetMs(t: Date, tz: string): number {
  const p = localParts(t, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(t.getTime() / 60000) * 60000;
}

function toInstant(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  return new Date(guess - offsetMs(new Date(guess), tz));
}

function isBusinessDay(p: LocalParts, cal: BusinessCalendar) {
  return cal.workdays.includes(p.wd) && !cal.holidays.includes(p.date);
}

/** Returns the instant that is `minutes` business minutes after `start`. */
export function addBusinessMinutes(start: Date, minutes: number, cal: BusinessCalendar = DEFAULT_CALENDAR): Date {
  if (cal.endHour <= cal.startHour) throw new Error('Calendar endHour must be after startHour');
  let t = new Date(start.getTime());
  let remaining = Math.max(0, Math.round(minutes));
  for (let guard = 0; guard < 5000; guard++) {
    const p = localParts(t, cal.timezone);
    const mod = p.h * 60 + p.mi;
    if (!isBusinessDay(p, cal) || mod >= cal.endHour * 60) {
      t = toInstant(p.y, p.m, p.d + 1, cal.startHour, 0, cal.timezone);
      continue;
    }
    if (mod < cal.startHour * 60) {
      t = toInstant(p.y, p.m, p.d, cal.startHour, 0, cal.timezone);
      continue;
    }
    if (remaining === 0) return t;
    const use = Math.min(cal.endHour * 60 - mod, remaining);
    t = new Date(t.getTime() + use * 60000);
    remaining -= use;
    if (remaining === 0) return t;
  }
  throw new Error('SLA calculation exceeded iteration guard (check calendar configuration)');
}

/** Business minutes elapsed between two instants (a ≤ b). */
export function businessMinutesBetween(a: Date, b: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): number {
  if (b <= a) return 0;
  let t = new Date(a.getTime());
  let total = 0;
  for (let guard = 0; guard < 5000 && t < b; guard++) {
    const p = localParts(t, cal.timezone);
    const mod = p.h * 60 + p.mi;
    if (!isBusinessDay(p, cal) || mod >= cal.endHour * 60) {
      t = toInstant(p.y, p.m, p.d + 1, cal.startHour, 0, cal.timezone);
      continue;
    }
    if (mod < cal.startHour * 60) {
      t = toInstant(p.y, p.m, p.d, cal.startHour, 0, cal.timezone);
      continue;
    }
    const dayEnd = new Date(t.getTime() + (cal.endHour * 60 - mod) * 60000);
    const until = dayEnd < b ? dayEnd : b;
    total += Math.floor((until.getTime() - t.getTime()) / 60000);
    t = until;
  }
  return total;
}

export interface SlaStatus { dueAt: Date; elapsedMinutes: number; remainingMinutes: number; breached: boolean }

export function slaStatus(startedAt: Date, slaMinutes: number, pausedMinutes: number, now: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): SlaStatus {
  const dueAt = addBusinessMinutes(startedAt, slaMinutes + pausedMinutes, cal);
  const elapsed = Math.max(0, businessMinutesBetween(startedAt, now, cal) - pausedMinutes);
  return { dueAt, elapsedMinutes: elapsed, remainingMinutes: Math.max(0, slaMinutes - elapsed), breached: now >= dueAt };
}
