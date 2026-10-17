// Date-specific exceptions to the recurring weekly plan, in the account's time zone.
export type RestDays = Record<string, boolean | 'auto'>;
export type ScheduleOverrides = Record<string, string | null>;

export function restDayKey(date: Date | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function weekdayIndexForDayKey(key: string): number {
  const day = new Date(`${key}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

export function scheduledSessionIdForDayKey(key: string, weeklyPlan: Record<number, string | null>, scheduleOverrides: ScheduleOverrides = {}): string | null | undefined {
  if (Object.prototype.hasOwnProperty.call(scheduleOverrides, key)) return scheduleOverrides[key];
  return weeklyPlan[weekdayIndexForDayKey(key)];
}

export function scheduledSessionId(date: Date | number, timeZone: string, weeklyPlan: Record<number, string | null>, scheduleOverrides: ScheduleOverrides = {}): string | null | undefined {
  return scheduledSessionIdForDayKey(restDayKey(date, timeZone), weeklyPlan, scheduleOverrides);
}

export function effectiveSessionIdForDayKey(key: string, weeklyPlan: Record<number, string | null>, restDays: RestDays, scheduleOverrides: ScheduleOverrides = {}): string | null | undefined {
  if (Object.prototype.hasOwnProperty.call(scheduleOverrides, key)) return scheduleOverrides[key];
  if (restDays[key]) return null;
  return scheduledSessionIdForDayKey(key, weeklyPlan);
}

export function swapAdjacentScheduleOverrides(today: string, weeklyPlan: Record<number, string | null>, restDays: RestDays, scheduleOverrides: ScheduleOverrides): ScheduleOverrides {
  const tomorrow = shiftDayKey(today, 1);
  const todayAssignment = effectiveSessionIdForDayKey(today, weeklyPlan, restDays, scheduleOverrides);
  const tomorrowAssignment = effectiveSessionIdForDayKey(tomorrow, weeklyPlan, restDays, scheduleOverrides);
  const next = Object.fromEntries(Object.entries(scheduleOverrides).filter(([key]) => key >= today)) as ScheduleOverrides;
  next[today] = tomorrowAssignment ?? null;
  next[tomorrow] = todayAssignment ?? null;
  const baseAssignment = (key: string) => restDays[key] ? null : scheduledSessionIdForDayKey(key, weeklyPlan);
  if (next[today] === baseAssignment(today)) delete next[today];
  if (next[tomorrow] === baseAssignment(tomorrow)) delete next[tomorrow];
  return next;
}

export function isRestDay(date: Date | number, timeZone: string, weeklyPlan: Record<number, string | null>, restDays: RestDays, scheduleOverrides: ScheduleOverrides = {}): boolean {
  const key = restDayKey(date, timeZone);
  if (Object.prototype.hasOwnProperty.call(scheduleOverrides, key)) return scheduleOverrides[key] === null;
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const index = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
  return Boolean(restDays[key]) || weeklyPlan[index] === null;
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
