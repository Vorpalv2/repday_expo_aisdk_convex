import { deleteField, doc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import type { ScheduleOverrides } from '../../lib/restDays';

export function persistRestDay(db: Firestore, uid: string, dayKey: string, rest: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new Error('Invalid workout date.');
  // A swapped assignment takes precedence over restDays. Clear that date's
  // assignment in the same write so the manual rest choice actually applies.
  return updateDoc(doc(db, 'users', uid, 'settings', 'main'), {
    [`restDays.${dayKey}`]: rest,
    [`scheduleOverrides.${dayKey}`]: deleteField(),
    updatedAt: Date.now(),
  });
}

export function persistScheduleOverrides(db: Firestore, uid: string, scheduleOverrides: ScheduleOverrides) {
  // Replace this map, including removed dates. Recursive merge leaves stale
  // assignments behind when a swap is reversed or old overrides are pruned.
  return setDoc(doc(db, 'users', uid, 'settings', 'main'), {
    scheduleOverrides, updatedAt: Date.now(),
  }, { mergeFields: ['scheduleOverrides', 'updatedAt'] });
}
