import { billingRequest } from '../billing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  arrayUnion,
  deleteDoc,
  doc,
  getDocsFromCache,
  getDocsFromServer,
  getDocFromServer,
  increment,
  runTransaction,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SplitCacheCoordinator, splitCacheKey, validRevision, splitSessions, upsertCachedSplit, appendCachedMove, type SplitDocument } from './splitCache';
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
  uid: string | null;
  hasPlusAccess: boolean;
  now: number;
};

export function useWorkoutData({ uid, hasPlusAccess, now }: UseWorkoutDataOptions): WorkoutBackendBindings {
  const [remoteSettings, setRemoteSettings] = useState<WorkoutSettings | null>();
  const [remoteSplits, setRemoteSplits] = useState<WorkoutBackendBindings['remoteSplits']>();
  const [remoteHistoryResults, setRemoteHistoryResults] = useState<WorkoutRecord[]>([]);
  const [remoteHistoryStatus, setRemoteHistoryStatus] = useState('LoadingFirstPage');
  const [remoteHistoryWeek, setRemoteHistoryWeek] = useState<{ start: number; end: number } | null>(null);
  const [remoteCollectionsVersion, setRemoteCollectionsVersion] = useState(0);
  const [remoteDataError, setRemoteDataError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const startupAttempts = useRef(0);
  const [startupExhausted, setStartupExhausted] = useState(false);
  const splitCache = useRef<SplitCacheCoordinator | null>(null);
  const latestSplitRevision = useRef<{ uid: string; revision: number; mutationId?: string } | null>(null);
  const mutationSequence = useRef(0);
  const historyCursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const remoteSettingsSignature = useRef<{ uid: string; value: string } | null>(null);
  const settingsWritesInFlight = useRef(new Set<string>());
  const historyRanges = useRef(new Map<string, Promise<void>>());
  const liveSyncEnabled = hasPlusAccess && remoteSettings?.liveSyncEnabled !== false;
  const plusAccess = useRef(hasPlusAccess);
  plusAccess.current = hasPlusAccess;
  const historyTimeZone = remoteSettings?.timeZone || 'Asia/Kolkata';
  const historyDay = restDayKey(now, historyTimeZone);
  const currentWeek = useMemo(() => activityWeek(now, historyTimeZone, 0), [historyDay, historyTimeZone]);

  useEffect(() => {
    startupAttempts.current = 0;
    setStartupExhausted(false);
    setRemoteHistoryResults([]);
    setRemoteHistoryWeek(null);
    latestSplitRevision.current = null;
    remoteSettingsSignature.current = null;
    settingsWritesInFlight.current.clear();
  }, [uid]);

  // A saved split snapshot can render while the server verifies its revision.
  // History only blocks uninitialized accounts, where legacy import needs to
  // distinguish an empty account from one that already has saved workouts.
  const startupReady = remoteSettings?.userId === uid && remoteSplits?.userId === uid &&
    Boolean(remoteSettings?.initialized || remoteSplits?.sessions.length || remoteHistoryWeek);
  useEffect(() => {
    if (!uid || startupReady || startupExhausted) return;
    const timer = setTimeout(() => {
      if (startupAttempts.current >= 2) {
        setStartupExhausted(true);
        setRemoteDataError(error => error ?? 'Your account data is taking longer than usual to load. Check your connection and try again.');
        return;
      }
      startupAttempts.current += 1;
      setRetryCount(count => count + 1);
    }, remoteDataError ? startupAttempts.current === 0 ? 1000 : 2000 : 8000);
    return () => clearTimeout(timer);
  }, [uid, startupReady, startupExhausted, retryCount, remoteDataError]);

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
      latestSplitRevision.current = null;
      return;
    }

    const firestore = db;
    const settingsRef = doc(firestore, 'users', uid, 'settings', 'main');
    const splitsQuery = query(collection(firestore, 'users', uid, 'splits'), orderBy('position', 'asc'));
    let cancelled = false;
    let migrating = false;
    let sawServerRevision = false;
    let lastPublishedRevision: number | null = null;
    setRemoteSettings(current => current?.userId === uid ? current : undefined);
    setRemoteSplits(current => current?.userId === uid ? current : undefined);
    setRemoteDataError(null);
    const coordinator = new SplitCacheCoordinator({
      uid,
      read: async () => {
        const raw = await AsyncStorage.getItem(splitCacheKey(uid));
        if (__DEV__ && raw) console.debug('[Repday] Splits: loading local revision cache');
        return raw;
      },
      write: entry => AsyncStorage.setItem(splitCacheKey(uid), JSON.stringify(entry)),
      fetch: async () => {
        if (__DEV__) console.debug('[Repday] Splits: fetching server snapshot');
        const snapshot = await getDocsFromServer(splitsQuery);
        const settings = await getDocFromServer(settingsRef);
        if (snapshot.metadata.hasPendingWrites || settings.metadata.hasPendingWrites) throw new Error('Waiting for your split edits to finish saving. Please retry.');
        const revision = settings.data()?.splitsRevision;
        if (!validRevision(revision)) throw new Error('Split revision is not ready. Please retry.');
        coordinator.observe(revision, settings.data()?.splitsMutationId);
        return { documents: snapshot.docs.map(item => item.data() as SplitDocument), revision };
      },
      publish: (entry, confirmed) => {
        if (cancelled || auth?.currentUser?.uid !== uid) return;
        setRemoteSplits({ userId: uid, sessions: splitSessions(entry.documents) });
        if (confirmed && lastPublishedRevision !== entry.revision) {
          if (__DEV__) console.debug('[Repday] Splits: confirmed revision', entry.revision);
          lastPublishedRevision = entry.revision;
          setRemoteCollectionsVersion(version => version + 1);
        }
      },
      error: error => {
        console.warn('[Repday] Split cache refresh failed', error);
        setRemoteDataError('Could not refresh your workout splits. Your cached splits are available; check your connection and retry.');
      },
    });
    splitCache.current = coordinator;
    const unsubscribeSettings = onSnapshot(settingsRef, { includeMetadataChanges: true }, snapshot => {
      if (cancelled) return;
      // A cold cache cannot tell us that the account has no settings. Wait for
      // the server before exposing defaults or deciding to import local data.
      if (snapshot.metadata.fromCache && !snapshot.exists()) return;
      const authUser = auth?.currentUser;
      const fields = snapshot.exists() ? snapshot.data() : {};
      const settings = {
        ...makeInitialSettings(uid), ...fields, userId: uid,
        user: { name: authUser?.displayName ?? null, email: authUser?.email ?? null },
        initialized: snapshot.exists() && Boolean(fields.initialized ?? true),
      } as WorkoutSettings;
      remoteSettingsSignature.current = { uid, value: settingsSignature(settings) };
      setRemoteSettings(settings);
      // Cached or speculative local settings must not certify a cache revision.
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      if (validRevision(fields.splitsRevision)) {
        latestSplitRevision.current = { uid, revision: fields.splitsRevision, mutationId: fields.splitsMutationId };
        if (!sawServerRevision || (plusAccess.current && fields.liveSyncEnabled !== false) || coordinator.knowsMutation(fields.splitsMutationId)) coordinator.observe(fields.splitsRevision, fields.splitsMutationId);
        sawServerRevision = true;
      }
      else if (!migrating) {
        migrating = true;
        // One-time migration for existing accounts, without overwriting a
        // concurrent onboarding installation or split edit.
        void runTransaction(firestore, async transaction => {
          const current = await transaction.get(settingsRef);
          if (!validRevision(current.data()?.splitsRevision)) transaction.set(settingsRef, { splitsRevision: 0, ...(!current.exists() ? { initialized: false } : {}) }, { merge: true });
        }).catch(error => {
          if (cancelled) return;
          migrating = false;
          console.warn('[Repday] Split revision migration failed', error);
          setRemoteDataError('Could not prepare your split cache. Please retry.');
        });
      }
    }, error => {
      if (cancelled) return;
      console.warn('[Repday] Settings listener failed', error);
      setRemoteDataError('Could not connect to your account data. Check your connection and try again.');
    });
    return () => {
      cancelled = true;
      coordinator.stop();
      if (splitCache.current === coordinator) splitCache.current = null;
      unsubscribeSettings();
    };
  }, [uid, retryCount]);

  useEffect(() => {
    const latest = latestSplitRevision.current;
    if (liveSyncEnabled && latest?.uid === uid) splitCache.current?.observe(latest.revision, latest.mutationId);
  }, [uid, liveSyncEnabled]);

  useEffect(() => {
    if (!uid || !db || remoteSettings?.userId !== uid) return;
    let cancelled = false;
    let confirmed = false;
    const start = currentWeek.start, end = currentWeek.end;
    const rangeKey = `${uid}:${start}:${end}`;
    const weekQuery = weekHistoryQuery(db, uid, start, end);
    historyCursor.current = null;
    setRemoteHistoryWeek(null);
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
        setRemoteHistoryWeek({ start, end });
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
    startupAttempts.current = 0;
    setStartupExhausted(false);
    setRemoteDataError(null);
    setRetryCount((count) => count + 1);
  }, []);

  const loadMoreHistory = useCallback(async (count: number) => {
    if (!uid || !db || remoteHistoryStatus !== 'CanLoadMore') return;
    const cursor = historyCursor.current;
    setRemoteHistoryStatus('LoadingMore');
    try {
      const next = await getDocsFromServer(olderHistoryQuery(db, uid, currentWeek.start, count, cursor));
      if (auth?.currentUser?.uid !== uid) return;
      const page = next.docs.map((item) => item.data().data as WorkoutRecord);
      historyCursor.current = next.docs.at(-1) ?? historyCursor.current;
      setRemoteHistoryResults((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.filter((item) => !seen.has(item.id))];
      });
      setRemoteHistoryStatus(next.size < count ? 'Exhausted' : 'CanLoadMore');
    } catch (error) {
      if (auth?.currentUser?.uid !== uid) return;
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
      if (auth?.currentUser?.uid !== uid) return;
      const page = result.docs.map((item) => item.data().data as WorkoutRecord);
      setRemoteHistoryResults((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        page.forEach((item) => byId.set(item.id, item));
        return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
      });
    } catch (error) {
      if (auth?.currentUser?.uid !== uid) return;
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

  const beginSplitChange = useCallback((patch: (documents: SplitDocument[]) => SplitDocument[]) => {
    const mutationId = `${Date.now()}-${++mutationSequence.current}-${Math.random().toString(36).slice(2)}`;
    splitCache.current?.register(mutationId, patch);
    return mutationId;
  }, []);

  const commitSplitChange = useCallback(async (
    patch: (documents: SplitDocument[]) => SplitDocument[],
    write: (batch: ReturnType<typeof writeBatch>, firestore: NonNullable<typeof db>) => void,
  ) => {
    if (!uid || !db) throw new Error('Sign in to update workout splits.');
    const mutationId = beginSplitChange(patch);
    const coordinator = splitCache.current;
    const batch = writeBatch(db);
    write(batch, db);
    batch.set(doc(db, 'users', uid, 'settings', 'main'), { splitsRevision: increment(1), splitsMutationId: mutationId }, { merge: true });
    try { await batch.commit(); }
    catch (error) { coordinator?.forget(mutationId); throw error; }
  }, [uid, beginSplitChange]);

  const syncSplits = useCallback(async ({ items }: { items: any[] }) => {
    const firestore = db;
    if (!uid || !firestore) return;
    const mutationId = beginSplitChange(documents => items.map((item, position) => upsertCachedSplit(documents, item, position).find(value => value.clientId === item.id)!));
    try { await billingRequest('/api/splits',{mutationId,items:items.map((item,position)=>({item,position})),replace:true}); }
    catch (error) { splitCache.current?.forget(mutationId); throw error; }
  }, [uid, beginSplitChange]);

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

  const upsertSplit = useCallback(async ({ item, position }: { item: any; position: number }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to save workout splits.'));
    const mutationId = beginSplitChange(documents => upsertCachedSplit(documents, item, position, true));
    try { await billingRequest('/api/splits',{mutationId,items:[{item,position,resetTargets:true}]}); }
    catch (error) { splitCache.current?.forget(mutationId); throw error; }
  }, [uid, beginSplitChange]);

  const appendSplitExercise = useCallback(({ splitId, move }: { splitId: string; move: any }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to update workout splits.'));
    const { activeSessionOnly: _activeSessionOnly, addToSplitOnFinish: _addToSplitOnFinish, ...savedMove } = move;
    const sets = savedMove.sets.map(({ addedDuringWorkout: _addedDuringWorkout, ...set }: any) => ({ ...set, done: false }));
    const saved = { ...savedMove, sets };
    return commitSplitChange(documents => documents.map(document => document.clientId === splitId ? appendCachedMove(document, saved) : document), (batch, firestore) => batch.update(doc(firestore, 'users', uid, 'splits', splitDocumentId(splitId)), {
      'data.moves': arrayUnion(saved),
      updatedAt: Date.now(),
    }));
  }, [uid, commitSplitChange]);

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
    return commitSplitChange(documents => documents.map(document => document.clientId === splitId ? { ...document, setTargets: { ...document.setTargets, ...setTargets } } : document), batch => batch.set(targetRef, { setTargets }, { merge: true }));
  }, [uid, commitSplitChange]);

  const deleteSplit = useCallback(({ clientId }: { clientId: string }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to delete workout splits.'));
    return commitSplitChange(documents => documents.filter(document => document.clientId !== clientId), (batch, firestore) => batch.delete(doc(firestore, 'users', uid, 'splits', splitDocumentId(clientId))));
  }, [uid, commitSplitChange]);

  const reorderSplitPositions = useCallback(async ({ clientIds }: { clientIds: string[] }) => {
    const firestore = db;
    if (!uid || !firestore) return;
    if (!clientIds.length) return;
    await commitSplitChange(documents => documents.map(document => { const position = clientIds.indexOf(document.clientId); return position < 0 ? document : { ...document, position }; }), batch => {
      clientIds.forEach((clientId, position) => batch.set(doc(firestore, 'users', uid, 'splits', splitDocumentId(clientId)), { clientId, position, updatedAt: Date.now() }, { merge: true }));
    });
  }, [uid, commitSplitChange]);

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
    remoteDataError: startupReady || startupExhausted ? remoteDataError : null,
    retryRemoteData,
    remoteSettings,
    remoteSplits,
    remoteHistoryResults,
    remoteHistoryStatus,
    remoteHistoryWeek,
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
