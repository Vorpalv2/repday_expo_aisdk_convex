import { billingRequest } from '../billing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  arrayUnion,
  deleteDoc,
  doc,
  getDocsFromCache,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from './client';
import { stableSerialize } from '../../lib/stableSerialize';
import { persistRestDay, persistScheduleOverrides } from './scheduleWrites';
import { activityWeek } from '../../lib/activityWeek';
import { restDayKey } from '../../lib/restDays';
import { mergeHistoryWeek, olderHistoryQuery, weekHistoryQuery } from './historyQueries';
import type {
  WorkoutBackendBindings,
  WorkoutRecord,
  WorkoutSettings,
} from '../contracts';

const makeInitialSettings = (uid: string): WorkoutSettings => ({
  userId: uid,
  initialized: false,
  weeklyPlan: {},
  restDays: {},
  scheduleOverrides: {},
  autoRestNextDate: null,
  focusDraft: null,
  selectedSessionId: null,
  country: 'India',
  timeZone: 'Asia/Kolkata',
  theme: 'light',
  liveSyncEnabled: true,
  activityDefaultCollapsed: true,
  trainingGoal: 'strength',
  restPreferenceSeconds: 90,
  weightUnit: 'kg',
  remindersEnabled: false,
});
const splitDocumentId = (clientId: string) => encodeURIComponent(clientId);
const historyDocumentId = (clientId: string) => encodeURIComponent(clientId);
const savedSettingsKeys = [
  'initialized', 'weeklyPlan', 'restDays', 'autoRestNextDate', 'focusDraft',
  'selectedSessionId', 'country', 'timeZone', 'theme', 'liveSyncEnabled', 'activityDefaultCollapsed',
  'trainingGoal', 'restPreferenceSeconds', 'weightUnit', 'remindersEnabled',
] as const;
const settingsSignature = (settings: Record<string, any>) => stableSerialize(
  Object.fromEntries(savedSettingsKeys.map((key) => [key, settings[key]])),
);

export type UseWorkoutDataOptions = {
  isAuthenticated: boolean;
  hasPlusAccess: boolean;
  now: number;
};

export function useWorkoutData({ isAuthenticated, hasPlusAccess, now }: UseWorkoutDataOptions): WorkoutBackendBindings {
  const uid = isAuthenticated ? auth?.currentUser?.uid ?? null : null;
  const [remoteSettings, setRemoteSettings] = useState<WorkoutSettings | null>();
  const [remoteSplits, setRemoteSplits] = useState<WorkoutBackendBindings['remoteSplits']>();
  const [remoteHistoryResults, setRemoteHistoryResults] = useState<WorkoutRecord[]>([]);
  const [remoteHistoryStatus, setRemoteHistoryStatus] = useState('LoadingFirstPage');
  const [remoteCollectionsVersion, setRemoteCollectionsVersion] = useState(0);
  const [remoteDataError, setRemoteDataError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const historyCursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const remoteSettingsSignature = useRef<{ uid: string; value: string } | null>(null);
  const settingsWritesInFlight = useRef(new Set<string>());
  const historyRanges = useRef(new Map<string, Promise<void>>());
  const liveSyncEnabled = hasPlusAccess && remoteSettings?.liveSyncEnabled !== false;
  const historyTimeZone = remoteSettings?.timeZone || 'Asia/Kolkata';
  const historyDay = restDayKey(now, historyTimeZone);
  const currentWeek = useMemo(() => activityWeek(now, historyTimeZone, 0), [historyDay, historyTimeZone]);

  useEffect(() => {
    historyRanges.current.clear();
    if (!uid || !db) {
      setRemoteSettings(null);
      setRemoteSplits(null);
      setRemoteHistoryResults([]);
      setRemoteHistoryStatus('Exhausted');
      setRemoteDataError(null);
      historyCursor.current = null;
      remoteSettingsSignature.current = null;
      settingsWritesInFlight.current.clear();
      return;
    }

    const settingsRef = doc(db, 'users', uid, 'settings', 'main');
    const splitsQuery = query(collection(db, 'users', uid, 'splits'), orderBy('position', 'asc'));
    setRemoteDataError(null);

    const applySplits = (snapshot: { docs: { data: () => any }[] }) => {
      const sessions = snapshot.docs.map((item) => {
        const split = item.data();
        const session = split.data;
        const targets = split.setTargets ?? {};
        if (!session?.moves || !Object.keys(targets).length) return session;
        return {
          ...session,
          moves: session.moves.map((move: any) => {
            const moveTargets = Object.entries(targets)
              .map(([key, value]: [string, any]) => ({ key, value }))
              .filter(({ value }) => value?.moveKey === move.key)
              .sort((a, b) => a.value.setIndex - b.value.setIndex);
            if (!moveTargets.length) return move;
            const sets = move.sets.map((set: any) => ({ ...set }));
            for (const { value } of moveTargets) {
              while (sets.length <= value.setIndex) {
                const previous = sets.at(-1);
                sets.push({ weight: previous?.weight ?? '0', reps: previous?.reps ?? '10', done: false });
              }
              sets[value.setIndex] = {
                ...sets[value.setIndex],
                weight: String(value.weight ?? sets[value.setIndex].weight),
                reps: String(value.reps ?? sets[value.setIndex].reps),
                done: false,
              };
            }
            return { ...move, sets };
          }),
        };
      });
      setRemoteSplits({ userId: uid, sessions });
    };

    const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
        const authUser = auth?.currentUser;
        const settings = {
          ...makeInitialSettings(uid),
          ...(snapshot.exists() ? snapshot.data() : {}),
          userId: uid,
          user: { name: authUser?.displayName ?? null, email: authUser?.email ?? null },
          initialized: snapshot.exists() && Boolean(snapshot.data().initialized ?? true),
        } as WorkoutSettings;
        remoteSettingsSignature.current = { uid, value: settingsSignature(settings) };
        setRemoteSettings(settings);
      }, (error) => { console.warn('[Repday] Settings listener failed', error); setRemoteDataError('Could not connect to your account data. Check your connection and try again.'); });

    let cancelled = false;
    const loadCollections = async () => {
      // Render Firestore's persisted result first. This uses local IndexedDB and
      // deliberately does not recreate a network listener after a reconnect.
      const cacheResults = await Promise.allSettled([
        getDocsFromCache(splitsQuery),
      ]);
      if (cancelled) return;
      if (cacheResults[0].status === 'fulfilled') applySplits(cacheResults[0].value);

      // Refresh splits once. Current-week history is loaded separately after
      // account settings supply the time zone, with its optional Plus listener.
      const serverResults = await Promise.allSettled([
        getDocsFromServer(splitsQuery),
      ]);
      if (cancelled) return;
      const splitResult = serverResults[0];
      const splitsLoaded = splitResult.status === 'fulfilled';
      if (splitResult.status === 'fulfilled') applySplits(splitResult.value);
      if (splitsLoaded) setRemoteCollectionsVersion((version) => version + 1);
      if (!splitsLoaded && cacheResults.every((result) => result.status === 'rejected')) {
        setRemoteDataError('Could not connect to your workout data. Check your connection and try again.');
      }
    };
    void loadCollections();

    return () => {
      cancelled = true;
      unsubscribeSettings();
    };
  }, [uid, retryCount]);

  useEffect(() => {
    if (!uid || !db || !liveSyncEnabled) return;
    const splitsQuery = query(collection(db, 'users', uid, 'splits'), orderBy('position', 'asc'));
    const applySplits = (snapshot: { docs: { data: () => any }[] }) => {
      const sessions = snapshot.docs.map((item) => {
        const split = item.data();
        const session = split.data;
        const targets = split.setTargets ?? {};
        if (!session?.moves || !Object.keys(targets).length) return session;
        return {
          ...session,
          moves: session.moves.map((move: any) => {
            const moveTargets = Object.entries(targets)
              .map(([key, value]: [string, any]) => ({ key, value }))
              .filter(({ value }) => value?.moveKey === move.key)
              .sort((a, b) => a.value.setIndex - b.value.setIndex);
            if (!moveTargets.length) return move;
            const sets = move.sets.map((set: any) => ({ ...set }));
            for (const { value } of moveTargets) {
              while (sets.length <= value.setIndex) {
                const previous = sets.at(-1);
                sets.push({ weight: previous?.weight ?? '0', reps: previous?.reps ?? '10', done: false });
              }
              sets[value.setIndex] = {
                ...sets[value.setIndex],
                weight: String(value.weight ?? sets[value.setIndex].weight),
                reps: String(value.reps ?? sets[value.setIndex].reps),
                done: false,
              };
            }
            return { ...move, sets };
          }),
        };
      });
      setRemoteSplits({ userId: uid, sessions });
      setRemoteCollectionsVersion((version) => version + 1);
    };
    const unsubscribeSplits = onSnapshot(splitsQuery, applySplits, (error) => {
      console.warn('[Repday] Live split sync failed', error);
      setRemoteDataError('Could not keep your workout splits live-synced.');
    });
    return () => {
      unsubscribeSplits();
    };
  }, [uid, liveSyncEnabled]);

  useEffect(() => {
    if (!uid || !db || remoteSettings?.userId !== uid) return;
    let cancelled = false;
    let confirmed = false;
    const start = currentWeek.start, end = currentWeek.end;
    const rangeKey = `${uid}:${start}:${end}`;
    const weekQuery = weekHistoryQuery(db, uid, start, end);
    historyCursor.current = null;
    setRemoteHistoryStatus('LoadingFirstPage');
    const applyWeek = (snapshot: { docs: { data: () => any }[] }, fromServer: boolean) => {
      if (cancelled) return;
      const records = snapshot.docs.map(item => item.data().data as WorkoutRecord);
      setRemoteHistoryResults(current => mergeHistoryWeek(current, records, start, end));
      // A small or empty week says nothing about whether older history exists.
      if (!confirmed && fromServer) setRemoteHistoryStatus('CanLoadMore');
      if (fromServer) {
        confirmed = true;
        historyRanges.current.set(rangeKey, Promise.resolve());
        setRemoteCollectionsVersion(version => version + 1);
      }
    };
    const failed = (error: unknown) => {
      if (cancelled) return;
      console.warn('[Repday] Current-week history failed', error);
      setRemoteHistoryStatus('CanLoadMore');
      setRemoteDataError('Could not load this week’s workouts. Check your connection and try again.');
    };
    if (liveSyncEnabled) {
      // The listener supplies both the initial week and subsequent changes;
      // do not also issue a duplicate startup server query for Plus members.
      const unsubscribe = onSnapshot(weekQuery, { includeMetadataChanges: true }, snapshot => applyWeek(snapshot, !snapshot.metadata.fromCache), failed);
      return () => { cancelled = true; unsubscribe(); };
    }
    void (async () => {
      try { applyWeek(await getDocsFromCache(weekQuery), false); } catch { /* The server remains authoritative. */ }
      try { applyWeek(await getDocsFromServer(weekQuery), true); } catch (error) { failed(error); }
    })();
    return () => { cancelled = true; };
  }, [uid, remoteSettings?.userId, currentWeek.start, currentWeek.end, liveSyncEnabled, retryCount]);

  const retryRemoteData = useCallback(() => {
    setRemoteDataError(null);
    setRemoteSettings(undefined);
    setRemoteSplits(undefined);
    setRemoteHistoryStatus('LoadingFirstPage');
    setRetryCount((count) => count + 1);
  }, []);

  const loadMoreHistory = useCallback(async (count: number) => {
    if (!uid || !db || remoteHistoryStatus !== 'CanLoadMore') return;
    const cursor = historyCursor.current;
    setRemoteHistoryStatus('LoadingMore');
    try {
      const next = await getDocsFromServer(olderHistoryQuery(db, uid, currentWeek.start, count, cursor));
      const page = next.docs.map((item) => item.data().data as WorkoutRecord);
      historyCursor.current = next.docs.at(-1) ?? historyCursor.current;
      setRemoteHistoryResults((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.filter((item) => !seen.has(item.id))];
      });
      setRemoteHistoryStatus(next.size < count ? 'Exhausted' : 'CanLoadMore');
    } catch (error) {
      console.warn('[Repday] Older history failed', error);
      setRemoteHistoryStatus('CanLoadMore');
      setRemoteDataError('Could not load older workout history. Check your connection and try again.');
    }
  }, [uid, remoteHistoryStatus, currentWeek.start]);

  const loadHistoryDate = useCallback(async (timestamp: number) => {
    if (!uid || !db) return;
    const start = new Date(timestamp);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    try {
      const result = await getDocsFromServer(query(
        collection(db, 'users', uid, 'history'),
        where('startedAt', '>=', start.getTime()),
        where('startedAt', '<', end.getTime()),
        orderBy('startedAt', 'desc'),
      ));
      const page = result.docs.map((item) => item.data().data as WorkoutRecord);
      setRemoteHistoryResults((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        page.forEach((item) => byId.set(item.id, item));
        return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
      });
    } catch (error) {
      console.warn('[Repday] Workout history date query failed', error);
      setRemoteDataError('Could not load workout history for that date. Check your connection and try again.');
    }
  }, [uid]);

  const loadHistoryRange = useCallback((start: number, end: number): Promise<void> => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to load previous activity.'));
    const key = `${uid}:${start}:${end}`;
    const cached = historyRanges.current.get(key);
    if (cached) return cached;
    const request = getDocsFromServer(query(collection(db, 'users', uid, 'history'),
      where('startedAt', '>=', start), where('startedAt', '<', end), orderBy('startedAt', 'desc')))
      .then(result => {
        if (auth?.currentUser?.uid !== uid) return;
        const records = result.docs.map(item => item.data().data as WorkoutRecord);
        setRemoteHistoryResults(current => {
          const byId = new Map(current.map(item => [item.id, item]));
          records.forEach(record => byId.set(record.id, record));
          return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
        });
      }).catch(error => { historyRanges.current.delete(key); throw error; });
    historyRanges.current.set(key, request);
    return request;
  }, [uid]);

  const syncSplits = useCallback(async ({ items }: { items: any[] }) => {
    const firestore = db;
    if (!uid || !firestore) return;
    await billingRequest('/api/splits',{items:items.map((item,position)=>({item,position})),replace:true});
  }, [uid]);

  const syncHistory = useCallback(async ({ items }: { items: WorkoutRecord[] }) => {
    if (!uid || !db) return;
    for (let offset = 0; offset < items.length; offset += 450) {
      const batch = writeBatch(db);
      for (const item of items.slice(offset, offset + 450)) {
        batch.set(doc(db, 'users', uid, 'history', historyDocumentId(item.id)), { clientId: item.id, data: item, startedAt: item.startedAt }, { merge: true });
      }
      await batch.commit();
    }
  }, [uid]);

  const upsertHistoryItem = useCallback((args: { item: WorkoutRecord }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to save workout history.'));
    const { item } = args;
    return setDoc(doc(db, 'users', uid, 'history', historyDocumentId(item.id)), { clientId: item.id, data: item, startedAt: item.startedAt }, { merge: true });
  }, [uid]);

  const deleteHistoryItem = useCallback(({ clientId }: { clientId: string }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to manage workout history.'));
    return deleteDoc(doc(db, 'users', uid, 'history', historyDocumentId(clientId)));
  }, [uid]);

  const upsertSplit = useCallback(({ item, position }: { item: any; position: number }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to save workout splits.'));
    return billingRequest('/api/splits',{items:[{item,position,resetTargets:true}]}).then(()=>undefined);
  }, [uid]);

  const appendSplitExercise = useCallback(({ splitId, move }: { splitId: string; move: any }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to update workout splits.'));
    const { activeSessionOnly: _activeSessionOnly, addToSplitOnFinish: _addToSplitOnFinish, ...savedMove } = move;
    const sets = savedMove.sets.map(({ addedDuringWorkout: _addedDuringWorkout, ...set }: any) => ({ ...set, done: false }));
    return updateDoc(doc(db, 'users', uid, 'splits', splitDocumentId(splitId)), {
      'data.moves': arrayUnion({ ...savedMove, sets }),
      updatedAt: Date.now(),
    });
  }, [uid]);

  const updateSplitSetTargets = useCallback(({ splitId, targets }: {
    splitId: string; targets: { moveKey: string; setIndex: number; weight: string; reps: string }[];
  }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to update workout targets.'));
    if (targets.length === 0) return Promise.resolve();
    const targetRef = doc(db, 'users', uid, 'splits', splitDocumentId(splitId));
    const setTargets = Object.fromEntries(targets.map((target) => [
      `${encodeURIComponent(target.moveKey)}_set_${target.setIndex}`,
      { moveKey: target.moveKey, setIndex: target.setIndex, weight: target.weight, reps: target.reps },
    ]));
    return setDoc(targetRef, { setTargets }, { merge: true });
  }, [uid]);

  const deleteSplit = useCallback(({ clientId }: { clientId: string }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to delete workout splits.'));
    return deleteDoc(doc(db, 'users', uid, 'splits', splitDocumentId(clientId)));
  }, [uid]);

  const reorderSplitPositions = useCallback(async ({ clientIds }: { clientIds: string[] }) => {
    const firestore = db;
    if (!uid || !firestore) return;
    const batch = writeBatch(firestore);
    clientIds.forEach((clientId, position) => batch.set(doc(firestore, 'users', uid, 'splits', splitDocumentId(clientId)), { clientId, position, updatedAt: Date.now() }, { merge: true }));
    if (clientIds.length) await batch.commit();
  }, [uid]);

  const saveSettings = useCallback(async (settings: {
    weeklyPlan: Record<number, string | null>; restDays: Record<string, boolean | 'auto'>; autoRestNextDate: string | null; focusDraft: any; selectedSessionId: string | null;
    country: string; timeZone: string; theme: 'light' | 'dark' | 'cyberpunk' | 'platinum'; liveSyncEnabled: boolean; activityDefaultCollapsed: boolean;
    trainingGoal: 'strength' | 'muscle' | 'fitness' | 'endurance'; restPreferenceSeconds: 60 | 90 | 120 | 180;
    weightUnit: 'kg' | 'lb'; remindersEnabled: boolean;
  }) => {
    if (!uid || !db) return;
    const value = settingsSignature({ ...settings, initialized: true });
    const writeKey = `${uid}:${value}`;
    if (remoteSettingsSignature.current?.uid === uid && remoteSettingsSignature.current.value === value) return;
    if (settingsWritesInFlight.current.has(writeKey)) return;
    settingsWritesInFlight.current.add(writeKey);
    try {
      await setDoc(doc(db, 'users', uid, 'settings', 'main'), { ...settings, initialized: true, updatedAt: Date.now() }, { merge: true });
    } finally {
      settingsWritesInFlight.current.delete(writeKey);
    }
  }, [uid]);

  const saveScheduleOverrides = useCallback(({ scheduleOverrides }: { scheduleOverrides: Record<string, string | null> }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to swap workout days.'));
    return persistScheduleOverrides(db, uid, scheduleOverrides);
  }, [uid]);

  const saveRestDay = useCallback(({ dayKey, rest }: { dayKey: string; rest: boolean }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to change rest days.'));
    return persistRestDay(db, uid, dayKey, rest);
  }, [uid]);

  return {
    remoteDataError,
    retryRemoteData,
    remoteSettings,
    remoteSplits,
    remoteHistoryResults,
    remoteHistoryStatus,
    remoteCollectionsVersion,
    loadMoreHistory,
    loadHistoryDate,
    loadHistoryRange,
    syncSplits,
    syncHistory,
    upsertHistoryItem,
    deleteHistoryItem,
    upsertSplit,
    appendSplitExercise,
    updateSplitSetTargets,
    deleteSplit,
    reorderSplitPositions,
    saveSettings,
    saveScheduleOverrides,
    saveRestDay,
  };
}
