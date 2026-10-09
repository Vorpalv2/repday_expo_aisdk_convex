import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from './client';
import type {
  ActiveWorkoutSnapshot,
  WorkoutBackendBindings,
  WorkoutRecord,
  WorkoutSettings,
} from '../contracts';

const makeInitialSettings = (uid: string): WorkoutSettings => ({
  userId: uid,
  initialized: false,
  weeklyPlan: {},
  focusDraft: null,
  selectedSessionId: null,
  country: 'India',
  timeZone: 'Asia/Kolkata',
  theme: 'light',
  activityDefaultCollapsed: true,
  legacyActiveWorkout: null,
  legacyWorking: null,
  legacyRestEndsAt: null,
});

const stripWorkingSets = (working: any) => ({
  ...working,
  moves: working.moves.map((move: any) => ({ ...move, sets: [] })),
});

const setDocumentId = (moveIndex: number, setIndex: number) => `${moveIndex}_${setIndex}`;
const splitDocumentId = (clientId: string) => encodeURIComponent(clientId);
const historyDocumentId = (clientId: string) => encodeURIComponent(clientId);

export type UseWorkoutDataOptions = {
  isAuthenticated: boolean;
  tab: string;
  cloudOwnerId: string | null;
  googlePhotoUrl: string | null;
};

export function useWorkoutData({ isAuthenticated, tab, googlePhotoUrl }: UseWorkoutDataOptions): WorkoutBackendBindings {
  const uid = isAuthenticated ? auth?.currentUser?.uid ?? null : null;
  const [remoteSettings, setRemoteSettings] = useState<WorkoutSettings | null>();
  const [remoteSplits, setRemoteSplits] = useState<WorkoutBackendBindings['remoteSplits']>();
  const [remoteHistoryResults, setRemoteHistoryResults] = useState<WorkoutRecord[]>([]);
  const [remoteHistoryStatus, setRemoteHistoryStatus] = useState('LoadingFirstPage');
  const [remoteActiveWorkout, setRemoteActiveWorkout] = useState<ActiveWorkoutSnapshot | null>();
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>();
  const historyCursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const olderHistory = useRef<WorkoutRecord[]>([]);
  const activeParentPayload = useRef<string | null>(null);
  const activeSetRows = useRef<any[]>([]);

  const withActiveSets = (working: any, rows: any[]) => {
    if (!working) return null;
    const byMove = new Map<number, any[]>();
    for (const row of rows) byMove.set(row.moveIndex, [...(byMove.get(row.moveIndex) ?? []), row]);
    return {
      ...working,
      moves: working.moves.map((move: any, moveIndex: number) => ({
        ...move,
        sets: (byMove.get(moveIndex) ?? []).sort((a, b) => a.setIndex - b.setIndex)
          .map(({ weight, reps, done }) => ({ weight, reps, done })),
      })),
    };
  };

  useEffect(() => {
    if (!uid || !db) {
      setRemoteSettings(null);
      setRemoteSplits(null);
      setRemoteHistoryResults([]);
      setRemoteHistoryStatus('Exhausted');
      setRemoteActiveWorkout(null);
      setProfilePhotoUrl(null);
      historyCursor.current = null;
      olderHistory.current = [];
      activeParentPayload.current = null;
      activeSetRows.current = [];
      return;
    }

    const settingsRef = doc(db, 'users', uid, 'settings', 'main');
    const splitsRef = collection(db, 'users', uid, 'splits');
    const historyRef = collection(db, 'users', uid, 'history');
    const activeRef = doc(db, 'users', uid, 'activeWorkouts', 'current');
    const activeSetsRef = collection(db, 'users', uid, 'activeWorkouts', 'current', 'sets');

    const unsubscribers = [
      onSnapshot(settingsRef, (snapshot) => {
        const authUser = auth?.currentUser;
        setRemoteSettings({
          ...makeInitialSettings(uid),
          ...(snapshot.exists() ? snapshot.data() : {}),
          userId: uid,
          user: { name: authUser?.displayName ?? null, email: authUser?.email ?? null },
          initialized: snapshot.exists() && Boolean(snapshot.data().initialized ?? true),
        } as WorkoutSettings);
      }),
      onSnapshot(query(splitsRef, orderBy('position', 'asc')), (snapshot) => {
        setRemoteSplits({ userId: uid, sessions: snapshot.docs.map((item) => item.data().data) });
      }),
      onSnapshot(query(historyRef, orderBy('startedAt', 'desc'), limit(30)), (snapshot) => {
        historyCursor.current = snapshot.docs.at(-1) ?? null;
        const firstPage = snapshot.docs.map((item) => item.data().data as WorkoutRecord);
        const firstIds = new Set(firstPage.map((item) => item.id));
        const older = olderHistory.current.filter((item) => !firstIds.has(item.id));
        setRemoteHistoryResults([...firstPage, ...older]);
        setRemoteHistoryStatus(snapshot.size < 30 ? 'Exhausted' : 'CanLoadMore');
      }),
      onSnapshot(activeRef, (snapshot) => {
        if (!snapshot.exists()) {
          activeParentPayload.current = null;
          activeSetRows.current = [];
          setRemoteActiveWorkout({ userId: uid, sessionKey: null, activeWorkout: null, working: null, restEndsAt: null });
          return;
        }
        const data = snapshot.data();
        activeParentPayload.current = JSON.stringify({
          sessionKey: data.sessionKey,
          activeWorkout: data.activeWorkout,
          working: data.working,
          restEndsAt: data.restEndsAt ?? null,
        });
        setRemoteActiveWorkout((current) => ({
          userId: uid,
          sessionKey: String(data.sessionKey),
          activeWorkout: data.activeWorkout ?? null,
          working: withActiveSets(data.working, activeSetRows.current),
          restEndsAt: data.restEndsAt ?? null,
        }));
      }),
      onSnapshot(activeSetsRef, (snapshot) => {
        const rows = snapshot.docs.map((item) => item.data());
        activeSetRows.current = rows;
        setRemoteActiveWorkout((current) => {
          if (!current?.working) return current;
          return {
            ...current,
            working: withActiveSets(current.working, rows),
          };
        });
      }),
    ];

    if (tab === 'Profile') {
      const photoRef = doc(db, 'users', uid, 'profilePhotos', 'current');
      unsubscribers.push(onSnapshot(photoRef, (snapshot) => {
        const uploadedPhotoUrl = snapshot.exists() ? String(snapshot.data().downloadURL ?? '') || null : null;
        setProfilePhotoUrl(uploadedPhotoUrl ?? googlePhotoUrl);
      }));
    } else {
      setProfilePhotoUrl(null);
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [uid, tab, googlePhotoUrl]);

  const loadMoreHistory = useCallback(async (count: number) => {
    if (!uid || !db || !historyCursor.current || remoteHistoryStatus !== 'CanLoadMore') return;
    setRemoteHistoryStatus('LoadingMore');
    const next = await getDocs(query(
      collection(db, 'users', uid, 'history'),
      orderBy('startedAt', 'desc'),
      startAfter(historyCursor.current),
      limit(count),
    ));
    const page = next.docs.map((item) => item.data().data as WorkoutRecord);
    olderHistory.current = [...olderHistory.current, ...page];
    historyCursor.current = next.docs.at(-1) ?? historyCursor.current;
    setRemoteHistoryResults((current) => {
      const seen = new Set(current.map((item) => item.id));
      return [...current, ...page.filter((item) => !seen.has(item.id))];
    });
    setRemoteHistoryStatus(next.size < count ? 'Exhausted' : 'CanLoadMore');
  }, [uid, remoteHistoryStatus]);

  const syncSplits = useCallback(async ({ items }: { items: any[] }) => {
    const firestore = db;
    if (!uid || !firestore) return;
    const ref = collection(firestore, 'users', uid, 'splits');
    const current = await getDocs(ref);
    const keep = new Set(items.map((item) => splitDocumentId(String(item.id))));
    let batch = writeBatch(firestore);
    let operations = 0;
    const commitIfFull = async () => {
      if (operations >= 450) {
        await batch.commit();
        batch = writeBatch(firestore);
        operations = 0;
      }
    };
    for (const row of current.docs) {
      if (!keep.has(row.id)) {
        batch.delete(row.ref);
        operations += 1;
        await commitIfFull();
      }
    }
    for (const [position, item] of items.entries()) {
      batch.set(doc(ref, splitDocumentId(String(item.id))), { clientId: String(item.id), data: item, position, updatedAt: Date.now() }, { merge: true });
      operations += 1;
      await commitIfFull();
    }
    if (operations) await batch.commit();
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
    return setDoc(doc(db, 'users', uid, 'splits', splitDocumentId(String(item.id))), { clientId: String(item.id), data: item, position, updatedAt: Date.now() }, { merge: true });
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
    weeklyPlan: Record<number, string | null>; focusDraft: any; selectedSessionId: string | null;
    country: string; timeZone: string; theme: 'light' | 'dark' | 'cyberpunk'; activityDefaultCollapsed: boolean;
  }) => {
    if (!uid || !db) return;
    await setDoc(doc(db, 'users', uid, 'settings', 'main'), { ...settings, initialized: true, updatedAt: Date.now() }, { merge: true });
  }, [uid]);

  const saveActiveWorkout = useCallback(async ({ activeWorkout, working, restEndsAt }: {
    activeWorkout: any; working: any; restEndsAt: number | null;
  }) => {
    if (!uid || !db) return;
    const parentRef = doc(db, 'users', uid, 'activeWorkouts', 'current');
    const setsRef = collection(parentRef, 'sets');
    if (!activeWorkout || !working) {
      const existingSets = await getDocs(setsRef);
      const batch = writeBatch(db);
      existingSets.docs.forEach((set) => batch.delete(set.ref));
      batch.delete(parentRef);
      await batch.commit();
      activeParentPayload.current = null;
      return;
    }

    const sessionKey = String(activeWorkout.startedAt ?? Date.now());
    const parentData = { sessionKey, activeWorkout, working: stripWorkingSets(working), restEndsAt, updatedAt: Date.now() };
    const comparable = JSON.stringify({ sessionKey, activeWorkout, working: parentData.working, restEndsAt });
    if (activeParentPayload.current === comparable) return;

    const current = await getDoc(parentRef);
    const batch = writeBatch(db);
    batch.set(parentRef, parentData, { merge: true });
    if (!current.exists()) {
      working.moves.forEach((move: any, moveIndex: number) => move.sets.forEach((set: any, setIndex: number) => {
        batch.set(doc(setsRef, setDocumentId(moveIndex, setIndex)), {
          moveIndex, setIndex, weight: String(set.weight ?? '0'), reps: String(set.reps ?? '10'), done: Boolean(set.done),
        });
      }));
    } else {
      const existingSets = await getDocs(setsRef);
      const existingIds = new Set(existingSets.docs.map((set) => set.id));
      working.moves.forEach((move: any, moveIndex: number) => move.sets.forEach((set: any, setIndex: number) => {
        const id = setDocumentId(moveIndex, setIndex);
        if (!existingIds.has(id)) batch.set(doc(setsRef, id), {
          moveIndex, setIndex, weight: String(set.weight ?? '0'), reps: String(set.reps ?? '10'), done: Boolean(set.done),
        });
      }));
    }
    await batch.commit();
    activeParentPayload.current = comparable;
  }, [uid]);

  const updateActiveWorkoutSet = useCallback(({ sessionKey, moveIndex, setIndex, field, value }: {
    sessionKey: string; moveIndex: number; setIndex: number; field: 'weight' | 'reps' | 'done'; value: string | boolean;
  }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to update workout sets.'));
    if (remoteActiveWorkout?.sessionKey && sessionKey !== remoteActiveWorkout.sessionKey) return Promise.reject(new Error('This workout is no longer active.'));
    return setDoc(doc(db, 'users', uid, 'activeWorkouts', 'current', 'sets', setDocumentId(moveIndex, setIndex)), {
      moveIndex, setIndex, [field]: field === 'done' ? Boolean(value) : String(value),
    }, { merge: true });
  }, [uid, remoteActiveWorkout?.sessionKey]);

  const addActiveWorkoutSet = useCallback(({ sessionKey: _sessionKey, moveIndex, setIndex, weight, reps }: {
    sessionKey: string; moveIndex: number; setIndex: number; weight: string; reps: string;
  }) => {
    if (!uid || !db) return Promise.reject(new Error('Sign in to add workout sets.'));
    return setDoc(doc(db, 'users', uid, 'activeWorkouts', 'current', 'sets', setDocumentId(moveIndex, setIndex)), { moveIndex, setIndex, weight, reps, done: false });
  }, [uid]);

  const migrateLegacyActiveWorkout = useCallback(async () => undefined, []);

  const uploadProfilePhoto = useCallback(async (blob: Blob, contentType: string) => {
    if (!uid || !db || !storage) throw new Error('Sign in to upload a profile photo.');
    const photoPath = `users/${uid}/profile/profile-image`;
    const fileRef = ref(storage, photoPath);
    await uploadBytes(fileRef, blob, { contentType });
    const downloadURL = await getDownloadURL(fileRef);
    await setDoc(doc(db, 'users', uid, 'profilePhotos', 'current'), { path: photoPath, downloadURL, updatedAt: Date.now() });
  }, [uid]);

  return {
    remoteSettings,
    remoteSplits,
    remoteHistoryResults,
    remoteHistoryStatus,
    loadMoreHistory,
    remoteActiveWorkout,
    profilePhotoUrl,
    syncSplits,
    syncHistory,
    upsertHistoryItem,
    deleteHistoryItem,
    upsertSplit,
    deleteSplit,
    reorderSplitPositions,
    saveSettings,
    saveActiveWorkout,
    updateActiveWorkoutSet,
    addActiveWorkoutSet,
    migrateLegacyActiveWorkout,
    uploadProfilePhoto,
  };
}
