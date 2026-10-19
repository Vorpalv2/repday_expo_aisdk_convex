import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';
import { effectiveSessionIdForDayKey, swapAdjacentScheduleOverrides } from '../lib/restDays';

const compiled = ts.transpileModule(readFileSync(new URL('../backend/firebase/scheduleWrites.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Model Firestore's field masks so these regressions exercise the actual write
// adapter, including the distinction between recursive merge and map replacement.
function harness(initial: Record<string, any>) {
  let stored = structuredClone(initial);
  let failure: Error | null = null;
  let release: (() => void) | undefined;
  let gate: Promise<void> | undefined;
  const deleted = Symbol('delete');
  const commit = async (apply: () => void) => { if (gate) await gate; if (failure) throw failure; apply(); };
  const exports: any = {};
  const sdk = {
    doc: (_db: unknown, ...path: string[]) => { assert.equal(path.join('/'), 'users/owner/settings/main'); return path; },
    deleteField: () => deleted,
    updateDoc: (_ref: unknown, fields: Record<string, any>) => commit(() => {
      for (const [path, value] of Object.entries(fields)) {
        const keys = path.split('.'); let target = stored;
        for (const key of keys.slice(0, -1)) target = target[key] ??= {};
        if (value === deleted) delete target[keys.at(-1)!]; else target[keys.at(-1)!] = structuredClone(value);
      }
    }),
    setDoc: (_ref: unknown, fields: Record<string, any>, options: { mergeFields?: string[]; merge?: boolean }) => commit(() => {
      if (options.mergeFields) for (const field of options.mergeFields) stored[field] = structuredClone(fields[field]);
      else if (options.merge) for (const [field, value] of Object.entries(fields)) {
        stored[field] = value && typeof value === 'object' && Object.keys(value).length ? { ...stored[field], ...value } : structuredClone(value);
      }
      else stored = structuredClone(fields);
    }),
  };
  vm.runInNewContext(compiled, { exports, require: () => sdk, Date });
  return { api: exports, read: () => structuredClone(stored), fail: (error: Error) => { failure = error; }, hold: () => { gate = new Promise<void>(resolve => { release = resolve; }); return () => release!(); } };
}

test('swaps survive reloading and reversing removes obsolete dates while retaining other overrides', async () => {
  const today = '2026-10-19'; const plan = { 0: 'push', 1: 'pull' };
  const future = { '2026-11-01': 'legs' };
  const h = harness({ weeklyPlan: plan, theme: 'platinum', scheduleOverrides: future });
  const first = swapAdjacentScheduleOverrides(today, plan, {}, future);
  await h.api.persistScheduleOverrides({}, 'owner', first);
  const reloaded = h.read();
  assert.equal(effectiveSessionIdForDayKey(today, plan, {}, reloaded.scheduleOverrides), 'pull');
  assert.equal(effectiveSessionIdForDayKey('2026-10-20', plan, {}, reloaded.scheduleOverrides), 'push');
  await h.api.persistScheduleOverrides({}, 'owner', swapAdjacentScheduleOverrides(today, plan, {}, reloaded.scheduleOverrides));
  assert.deepEqual(h.read().scheduleOverrides, future);
  assert.deepEqual(h.read().weeklyPlan, plan);
  assert.equal(h.read().theme, 'platinum');
});

test('manual rest after a swap persists, clears only today’s assignment, and undo restores the recurring workout', async () => {
  const today = '2026-10-19'; const plan = { 0: 'push', 1: 'pull' };
  const h = harness({ weeklyPlan: plan, restDays: { '2026-10-18': 'auto' }, scheduleOverrides: { [today]: 'pull', '2026-10-20': 'push' } });
  await h.api.persistRestDay({}, 'owner', today, true);
  let saved = h.read();
  assert.equal(effectiveSessionIdForDayKey(today, plan, saved.restDays, saved.scheduleOverrides), null);
  assert.equal(saved.restDays['2026-10-18'], 'auto');
  assert.deepEqual(saved.scheduleOverrides, { '2026-10-20': 'push' });
  await h.api.persistRestDay({}, 'owner', today, false);
  saved = h.read();
  assert.equal(effectiveSessionIdForDayKey(today, plan, saved.restDays, saved.scheduleOverrides), 'push');
});

test('save promises wait for acknowledgment and propagate failures without reporting success', async () => {
  const h = harness({ restDays: {}, scheduleOverrides: {} });
  const release = h.hold(); let finished = false;
  const pending = h.api.persistRestDay({}, 'owner', '2026-10-19', true).then(() => { finished = true; });
  await Promise.resolve(); assert.equal(finished, false);
  assert.deepEqual(h.read().restDays, {});
  release(); await pending; assert.equal(finished, true);
  h.fail(new Error('permission-denied'));
  await assert.rejects(h.api.persistRestDay({}, 'owner', '2026-10-19', false), /permission-denied/);
  await assert.rejects(h.api.persistScheduleOverrides({}, 'owner', {}), /permission-denied/);
  assert.equal(h.read().restDays['2026-10-19'], true);
});
