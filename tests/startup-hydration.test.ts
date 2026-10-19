import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as splitCache from '../backend/firebase/splitCache';
import { stableSerialize } from '../lib/stableSerialize';
import { activityWeek } from '../lib/activityWeek';
import { restDayKey } from '../lib/restDays';
import type { WorkoutBackendBindings } from '../backend/contracts';

// Run the real data hook with deterministic React effects, Firestore deliveries,
// storage and timers. No account creation or production database writes.
const compiled = ts.transpileModule(readFileSync(new URL('../backend/firebase/useWorkoutData.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function startup(cached = false, initialized = true) {
  const slots: any[] = [];
  let cursor = 0, dirty = true, stopped = false, clock = 0, timerId = 0, splitReads = 0;
  let result: WorkoutBackendBindings;
  let props = { uid: 'owner' as string | null, hasPlusAccess: false, now: Date.parse('2026-10-19T08:00:00Z') };
  let effects: (() => void)[] = [];
  const timers = new Map<number, { at: number; run: () => void }>();
  const listeners: { next: (value: any) => void; fail: (error: Error) => void; active: boolean }[] = [];
  const historyRequests: ((value: any) => void)[] = [];
  const auth = { currentUser: { uid: 'owner', email: 'owner@example.com' } };
  const fields = { initialized, splitsRevision: 0 };
  const snapshot = (fromCache = false, exists = true) => ({ exists: () => exists, data: () => fields, metadata: { fromCache, hasPendingWrites: false } });
  const depsEqual = (a: unknown[], b: unknown[]) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (update: any) => {
        if (stopped) return;
        const next = typeof update === 'function' ? update(slots[i]) : update;
        if (!Object.is(slots[i], next)) { slots[i] = next; dirty = true; }
      }];
    },
    useRef(initial: any) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(factory: () => any, deps: unknown[]) {
      const i = cursor++;
      if (!slots[i] || !depsEqual(slots[i].deps, deps)) slots[i] = { deps, value: factory() };
      return slots[i].value;
    },
    useCallback(callback: () => any, deps: unknown[]) { return react.useMemo(() => callback, deps); },
    useEffect(effect: () => any, deps: unknown[]) {
      const i = cursor++;
      if (!slots[i] || !depsEqual(slots[i].deps, deps)) {
        const old = slots[i];
        const next = slots[i] = { deps, cleanup: undefined as undefined | (() => void) };
        effects.push(() => { old?.cleanup?.(); next.cleanup = effect(); });
      }
    },
  };
  const mocks: Record<string, any> = {
    react,
    './client': { auth, db: {} },
    './splitCache': splitCache,
    '../../lib/stableSerialize': { stableSerialize },
    '../../lib/activityWeek': { activityWeek },
    '../../lib/restDays': { restDayKey },
    './scheduleWrites': {},
    '../billing': {},
    './historyQueries': {
      weekHistoryQuery: () => ({ kind: 'history' }),
      mergeHistoryWeek: (old: any[], next: any[]) => [...old, ...next],
    },
    '@react-native-async-storage/async-storage': { default: {
      getItem: async () => cached ? JSON.stringify({ version: 1, userId: 'owner', revision: 0, documents: [] }) : null,
      setItem: async () => {},
    } },
    'firebase/firestore': {
      doc: () => ({}), collection: () => ({}), orderBy: () => ({}), query: () => ({ kind: 'splits' }),
      onSnapshot: (_ref: any, _options: any, next: any, fail: any) => {
        const listener = { next, fail, active: true }; listeners.push(listener);
        return () => { listener.active = false; };
      },
      getDocsFromServer: async (query: any) => {
        if (query.kind === 'history') return new Promise(resolve => historyRequests.push(resolve));
        splitReads++;
        return { docs: [], metadata: { hasPendingWrites: false } };
      },
      getDocsFromCache: async () => ({ docs: [] }),
      getDocFromServer: async () => snapshot(),
    },
  };
  const api: any = {};
  vm.runInNewContext(compiled, {
    exports: api, require: (name: string) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
    __DEV__: false, console: { warn() {}, debug() {} },
    setTimeout: (run: () => void, ms: number) => { const id = ++timerId; timers.set(id, { run, at: clock + ms }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  async function flush() {
    for (let turn = 0; turn < 40; turn++) {
      if (dirty) {
        dirty = false; cursor = 0; effects = [];
        result = api.useWorkoutData(props);
        effects.forEach(effect => effect());
      }
      await Promise.resolve();
    }
  }
  async function advance(ms: number) {
    const until = clock + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      clock = next[1].at; timers.delete(next[0]); next[1].run(); await flush();
    }
    clock = until; await flush();
  }
  return {
    flush, advance, listeners, splitReads: () => splitReads, value: () => result!,
    settings: async (fromCache = false, exists = true) => { listeners.at(-1)!.next(snapshot(fromCache, exists)); await flush(); },
    fail: async () => { listeners.at(-1)!.fail(new Error('unavailable')); await flush(); },
    history: async (records: any[] = []) => {
      historyRequests.at(-1)!({ docs: records.map(data => ({ data: () => ({ data }) })) }); await flush();
    },
    switchOwner: async () => { props = { ...props, uid: 'other' }; auth.currentUser.uid = 'other'; dirty = true; await flush(); },
    stop() { stopped = true; slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('cold empty settings cache waits for the server; initialized account loads despite stalled history', async () => {
  const h = startup(); await h.flush();
  await h.settings(true, false);
  assert.equal(h.value().remoteSettings, undefined);
  await h.settings();
  assert.equal(h.value().remoteSettings?.userId, 'owner');
  assert.equal(h.value().remoteSplits?.sessions.length, 0);
  assert.equal(h.value().remoteHistoryStatus, 'LoadingFirstPage');
  await h.advance(30000);
  assert.equal(h.listeners.length, 1, 'history does not restart a usable startup');
  assert.equal(h.value().remoteDataError, null);
  assert.equal(h.splitReads(), 1);
  const splitVersion = h.value().remoteCollectionsVersion;
  await h.history([{ id: 'completed', startedAt: Date.parse('2026-10-19T08:00:00Z') }]);
  assert.equal(h.value().remoteCollectionsVersion, splitVersion, 'history completion must not rehydrate and overwrite edited splits');
  assert.ok(h.value().remoteHistoryWeek, 'the confirmed history range is published independently');
  assert.equal(h.value().remoteHistoryResults[0].id, 'completed');
  h.stop();
});

test('stalled initial connection automatically recreates the listener and recovers without a button', async () => {
  const h = startup(); await h.flush();
  await h.advance(8000);
  assert.equal(h.listeners.length, 2);
  assert.equal(h.listeners[0].active, false);
  await h.settings();
  await h.advance(30000);
  assert.equal(h.listeners.length, 2, 'successful hydration cancels further retries');
  assert.equal(h.value().remoteDataError, null);
  assert.equal(h.value().remoteSplits?.userId, 'owner');
  h.stop();
});

test('an empty uninitialized account waits for authoritative history before legacy import is allowed', async () => {
  const h = startup(false, false); await h.flush(); await h.settings();
  assert.equal(h.value().remoteSettings?.initialized, false);
  assert.equal(h.value().remoteHistoryWeek, null);
  await h.advance(7500);
  assert.equal(h.listeners.length, 1);
  await h.history();
  assert.ok(h.value().remoteHistoryWeek, 'confirmed empty history is sufficient to finish new-account startup');
  await h.advance(30000);
  assert.equal(h.listeners.length, 1, 'the completed empty account does not enter a retry loop');
  assert.equal(h.value().remoteDataError, null);
  h.stop();
});

test('warm account cache renders with zero split downloads while server and history are delayed', async () => {
  const h = startup(true); await h.flush(); await h.settings(true);
  assert.equal(h.value().remoteSplits?.userId, 'owner');
  await h.advance(30000);
  assert.equal(h.splitReads(), 0);
  assert.equal(h.listeners.length, 1);
  await h.settings();
  assert.equal(h.splitReads(), 0, 'matching revision never downloads the split collection');
  h.stop();
});

test('automatic retries are bounded, manual retry resets the budget, and old callbacks are ignored', async () => {
  const h = startup(); await h.flush();
  await h.fail(); await h.advance(1000);
  await h.fail(); await h.advance(2000);
  await h.fail(); await h.advance(2000);
  assert.equal(h.listeners.length, 3);
  assert.match(h.value().remoteDataError!, /Could not connect/);
  await h.advance(60000);
  assert.equal(h.listeners.length, 3);
  h.value().retryRemoteData(); await h.flush();
  assert.equal(h.listeners.length, 4);
  assert.equal(h.value().remoteDataError, null);
  h.listeners[0].fail(new Error('late failure from cancelled attempt')); await h.flush();
  assert.equal(h.value().remoteDataError, null);
  await h.settings();
  const old = h.listeners.at(-1)!;
  await h.switchOwner();
  old.next({ exists: () => true, data: () => ({ initialized: true }), metadata: { fromCache: false } });
  await h.flush();
  assert.equal(h.value().remoteSettings, undefined, 'another account cannot display the old settings');
  assert.equal(h.value().remoteSplits, undefined);
  h.stop();
});
