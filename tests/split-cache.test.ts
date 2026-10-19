import assert from 'node:assert/strict';
import test from 'node:test';
import { SplitCacheCoordinator, decodeSplitCache, splitSessions, upsertCachedSplit, type SplitCacheEntry, type SplitDocument } from '../backend/firebase/splitCache';

const split = (id = 'push', weight = '20'): SplitDocument => ({ clientId: id, position: 0, data: { id, name: id, moves: [{ key: 'bench', name: 'Bench', sets: [{ weight, reps: '8', done: false }] }] } });
const entry = (revision = 1, documents = [split()]): SplitCacheEntry => ({ version: 1, userId: 'owner', revision, documents });
async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(check(), true, 'async cache operation completed');
}
function harness(cached: SplitCacheEntry | null, fetch?: () => Promise<{ documents: SplitDocument[]; revision: number }>) {
  let reads = 0;
  let saved: SplitCacheEntry | null = null;
  const published: { entry: SplitCacheEntry; confirmed: boolean }[] = [];
  const errors: unknown[] = [];
  const cache = new SplitCacheCoordinator({ uid: 'owner', read: async () => cached ? JSON.stringify(cached) : null,
    write: async value => { saved = structuredClone(value); },
    fetch: async () => { reads++; return fetch ? fetch() : { documents: [split()], revision: 1 }; },
    publish: (value, confirmed) => published.push({ entry: value, confirmed }), error: error => errors.push(error),
  });
  return { cache, published, errors, reads: () => reads, saved: () => saved };
}

test('unchanged revision renders persisted splits and makes zero collection reads across reloads', async () => {
  const h = harness(entry()); await h.cache.ready; h.cache.observe(1);
  await until(() => h.published.some(value => value.confirmed));
  assert.equal(h.reads(), 0);
  assert.equal(h.published[0].confirmed, false);
  const reloaded = harness(entry()); await reloaded.cache.ready; reloaded.cache.observe(1);
  await until(() => reloaded.published.some(value => value.confirmed));
  assert.equal(reloaded.reads(), 0);
});

test('first browser fetches once; a complete empty cache is also a valid cache hit', async () => {
  const h = harness(null); await h.cache.ready; h.cache.observe(1);
  await until(() => h.saved() !== null); assert.equal(h.reads(), 1);
  const empty = harness(entry(4, [])); await empty.cache.ready; empty.cache.observe(4);
  await until(() => empty.published.some(value => value.confirmed)); assert.equal(empty.reads(), 0);
});

test('other-device changes refresh once and replace deleted splits', async () => {
  const h = harness(entry(1, [split('push'), split('pull')]), async () => ({ documents: [split('pull')], revision: 2 }));
  await h.cache.ready; h.cache.observe(2);
  await until(() => h.saved()?.revision === 2);
  assert.deepEqual(h.saved()!.documents.map(document => document.clientId), ['pull']);
  assert.equal(h.reads(), 1);
});

test('confirmed local edit advances cache without reading splits; failed/unconfirmed edits do not', async () => {
  const h = harness(entry()); await h.cache.ready; h.cache.observe(1);
  await until(() => h.published.some(value => value.confirmed));
  h.cache.register('local-edit', documents => upsertCachedSplit(documents, split('push', '25').data, 0, true));
  assert.equal(h.saved(), null);
  h.cache.observe(2, 'local-edit'); await until(() => h.saved()?.revision === 2);
  assert.equal(h.reads(), 0); assert.equal(splitSessions(h.saved()!.documents)[0].moves[0].sets[0].weight, '25');
  h.cache.register('failed', () => []); h.cache.forget('failed');
  assert.equal(h.saved()!.documents.length, 1);
});

test('a revision jump cannot apply only this browser’s patch and miss another device edit', async () => {
  const h = harness(entry(), async () => ({ documents: [split('push', '35'), split('pull')], revision: 3 }));
  await h.cache.ready; h.cache.observe(1); await until(() => h.published.some(value => value.confirmed));
  h.cache.register('mine', documents => upsertCachedSplit(documents, split('push', '25').data, 0));
  h.cache.observe(3, 'mine'); await until(() => h.saved()?.revision === 3);
  assert.equal(h.reads(), 1); assert.equal(h.saved()!.documents.length, 2);
});

test('change during collection fetch retries rather than certifying old data as a new revision', async () => {
  let calls = 0;
  const h = harness(entry(), async () => {
    calls++;
    if (calls === 1) { h.cache.observe(3); return { documents: [split('push', '25')], revision: 3 }; }
    return { documents: [split('push', '30')], revision: 3 };
  });
  await h.cache.ready; h.cache.observe(2); await until(() => h.saved()?.revision === 3);
  assert.equal(h.reads(), 2);
  assert.equal(h.saved()!.documents[0].data.moves[0].sets[0].weight, '30');
});

test('corrupt caches and another account’s cache cannot be accepted', () => {
  assert.equal(decodeSplitCache('broken', 'owner'), null);
  assert.equal(decodeSplitCache(JSON.stringify(entry()), 'another-owner'), null);
  assert.equal(decodeSplitCache(JSON.stringify({ ...entry(), documents: [{ data: null }] }), 'owner'), null);
  assert.equal(decodeSplitCache(JSON.stringify({ ...entry(), revision: -1 }), 'owner'), null);
});

test('a late verification response cannot downgrade a newer observed revision', async () => {
  const h = harness(entry(), async () => {
    h.cache.observe(3);
    h.cache.observe(2); // older verification read arrives after the listener
    return { documents: [split('push', '30')], revision: 3 };
  });
  await h.cache.ready; h.cache.observe(2); await until(() => h.saved()?.revision === 3);
  assert.equal(h.reads(), 2); assert.equal(h.saved()!.revision, 3);
});

test('offline failure retains known cache, and stopping prevents a late fetch crossing accounts', async () => {
  const offline = harness(entry(), async () => { throw new Error('offline'); });
  await offline.cache.ready; offline.cache.observe(2); await until(() => offline.errors.length === 1);
  assert.equal(offline.published.at(-1)!.entry.revision, 1); assert.equal(offline.saved(), null);
  let release!: (value: { documents: SplitDocument[]; revision: number }) => void;
  const late = harness(null, () => new Promise(resolve => { release = resolve; }));
  await late.cache.ready; late.cache.observe(1); await until(() => !!release);
  late.cache.stop(); release({ documents: [split()], revision: 1 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(late.saved(), null); assert.equal(late.published.length, 0);
});
