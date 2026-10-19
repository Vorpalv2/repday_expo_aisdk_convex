import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../backend/firebase/historyQueries.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api: any = {};
const sdk = {
  collection: (_db: unknown, ...path: string[]) => { assert.equal(path.join('/'), 'users/owner/history'); return {}; },
  where: (field: string, op: string, value: number) => ({ kind: 'where', field, op, value }),
  orderBy: (field: string, direction: string) => ({ kind: 'order', field, direction }),
  limit: (count: number) => ({ kind: 'limit', count }),
  startAfter: (cursor: { startedAt: number }) => ({ kind: 'after', cursor }),
  query: (_collection: unknown, ...constraints: any[]) => constraints,
};
vm.runInNewContext(compiled, { exports: api, require: () => sdk, Map });
const record = (id: string, startedAt: number) => ({ id, startedAt });
function run(constraints: any[], data: { id: string; startedAt: number }[]) {
  let rows = [...data].sort((a, b) => b.startedAt - a.startedAt);
  for (const c of constraints) {
    if (c.kind === 'where') rows = rows.filter(row => c.op === '>=' ? row.startedAt >= c.value : row.startedAt < c.value);
    if (c.kind === 'after') rows = rows.filter(row => row.startedAt < c.cursor.startedAt);
    if (c.kind === 'limit') rows = rows.slice(0, c.count);
  }
  return rows;
}

test('startup week query includes more than seven workouts and excludes records outside Monday–Sunday', () => {
  const monday = Date.parse('2026-10-18T18:30:00Z');
  const nextMonday = monday + 7 * 86400000;
  const workouts = Array.from({ length: 12 }, (_, i) => record(String(i), monday + i * 3600000));
  const query = api.weekHistoryQuery({}, 'owner', monday, nextMonday);
  const result = run(query, [record('old', monday - 1), ...workouts, record('next-week', nextMonday)]);
  assert.equal(result.length, 12);
  assert.equal(result.at(-1)?.id, '0');
  assert.equal(query.some((c: any) => c.kind === 'limit'), false);
});

test('empty current week can independently paginate older history without a current-week cursor', () => {
  const monday = Date.parse('2026-10-18T18:30:00Z');
  const rows = Array.from({ length: 5 }, (_, i) => record(String(i), monday - (i + 1) * 3600000));
  assert.equal(run(api.weekHistoryQuery({}, 'owner', monday, monday + 7 * 86400000), rows).length, 0);
  const first = run(api.olderHistoryQuery({}, 'owner', monday, 3, null), rows);
  const second = run(api.olderHistoryQuery({}, 'owner', monday, 3, first.at(-1)), rows);
  assert.deepEqual([...first, ...second].map(row => row.id), ['0', '1', '2', '3', '4']);
});

test('a refreshed current week replaces edits and deletions while preserving cached historical weeks', () => {
  const old = record('old', 90), removed = record('removed', 110), edited = record('edit', 120);
  const result = api.mergeHistoryWeek([old, removed, edited], [{ ...edited, name: 'Updated' }, record('new', 150)], 100, 200);
  assert.deepEqual([...result].map(row => row.id), ['new', 'edit', 'old']);
  assert.equal(result[1].name, 'Updated');
  const empty = api.mergeHistoryWeek(result, [], 100, 200);
  assert.deepEqual([...empty].map(row => row.id), ['old']);
});
