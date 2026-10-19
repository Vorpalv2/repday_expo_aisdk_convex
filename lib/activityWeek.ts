import { restDayKey, shiftDayKey, weekdayIndexForDayKey } from './restDays';

// Find the first instant in a local calendar day, including DST boundaries.
export function zonedDayStart(key: string, timeZone: string): number {
  const utc = Date.parse(`${key}T00:00:00Z`);
  let low = utc - 36 * 3600000, high = utc + 36 * 3600000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (restDayKey(middle, timeZone) < key) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function activityWeek(now: number, timeZone: string, offset: number) {
  const today = restDayKey(now, timeZone);
  const weeks = Number.isFinite(offset) ? Math.min(0, Math.trunc(offset)) : 0;
  const startKey = shiftDayKey(today, -weekdayIndexForDayKey(today) + weeks * 7);
  const endKey = shiftDayKey(startKey, 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDayKey(startKey, i);
    return { key, date: new Date(zonedDayStart(key, timeZone)) };
  });
  return { startKey, endKey, start: days[0].date.getTime(), end: zonedDayStart(endKey, timeZone), days };
}
