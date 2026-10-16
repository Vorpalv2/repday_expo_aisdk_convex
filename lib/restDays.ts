// Date-specific exceptions to the recurring weekly plan, in the account's time zone.
export type RestDays = Record<string, boolean | 'auto'>;

export function restDayKey(date: Date | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isRestDay(date: Date | number, timeZone: string, weeklyPlan: Record<number, string | null>, restDays: RestDays): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const index = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
  return Boolean(restDays[restDayKey(date, timeZone)]) || weeklyPlan[index] === null;
}

export function shiftDayKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Start tracking on first use, then catch up from the last checked date.
// Never infer missed workouts before the account began tracking activity.
export function fillAutomaticRestDays({ today, nextDate, restDays, completedDates, activeDate, trackingStartDate }: {
  today: string; nextDate: string | null; restDays: RestDays;
  completedDates: Set<string>; activeDate: string | null; trackingStartDate?: string;
}): { restDays: RestDays; nextDate: string } {
  let cursor = nextDate ?? today;
  if(trackingStartDate && cursor < trackingStartDate) cursor = trackingStartDate;
  let updated = restDays;
  if(trackingStartDate)for(const [date,status] of Object.entries(restDays)){
    if(status === 'auto' && date < trackingStartDate){
      if(updated === restDays)updated = {...restDays};
      // Explicit false also clears an old automatic entry in Firestore's merged map.
      updated[date] = false;
    }
  }
  while (cursor < today) {
    // Revisit an unfinished workout's date after it is finished or discarded.
    if (cursor === activeDate) break;
    if (!completedDates.has(cursor) && restDays[cursor] === undefined) {
      if (updated === restDays) updated = { ...restDays };
      updated[cursor] = 'auto';
    }
    cursor = shiftDayKey(cursor, 1);
  }
  return { restDays: updated, nextDate: cursor };
}
