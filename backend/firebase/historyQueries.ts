import { collection, limit, orderBy, query, startAfter, where, type Firestore, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import type { WorkoutRecord } from '../contracts';

export function weekHistoryQuery(db: Firestore, uid: string, start: number, end: number) {
  return query(collection(db, 'users', uid, 'history'),
    where('startedAt', '>=', start), where('startedAt', '<', end), orderBy('startedAt', 'desc'));
}

export function olderHistoryQuery(db: Firestore, uid: string, before: number, count: number, cursor: QueryDocumentSnapshot<DocumentData> | null) {
  return query(collection(db, 'users', uid, 'history'), where('startedAt', '<', before),
    orderBy('startedAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(count));
}

// A complete week snapshot replaces that week's records (including deletions),
// while history fetched for other weeks remains available to both screens.
export function mergeHistoryWeek(existing: WorkoutRecord[], week: WorkoutRecord[], start: number, end: number) {
  const byId = new Map(existing.filter(item => item.startedAt < start || item.startedAt >= end).map(item => [item.id, item]));
  week.forEach(item => byId.set(item.id, item));
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
}
