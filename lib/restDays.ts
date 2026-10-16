// Date-specific exceptions to the recurring weekly plan, in the account's time zone.
export type RestDays = Record<string, boolean>;

export function restDayKey(date: Date | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isRestDay(date: Date | number, timeZone: string, weeklyPlan: Record<number, string | null>, restDays: RestDays): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const index = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
  return restDays[restDayKey(date, timeZone)] === true || weeklyPlan[index] === null;
}
