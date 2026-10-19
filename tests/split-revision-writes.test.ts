import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';
import { z } from 'zod';
import { stableSerialize } from '../lib/stableSerialize';

const compiled = ts.transpileModule(readFileSync(new URL('../lib/server/splits.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(existing: Record<string, any>[] = []) {
  let writes: any[] = [];
  const exports: any = {};
  const admin = {
    readDocument: async (path: string) => path.startsWith('splitQuotas/') ? { revision: 7 } : path.startsWith('billingAccounts/') ? {} : existing.find(item => path.endsWith('/' + encodeURIComponent(item.clientId))) ?? null,
    listDocuments: async () => existing.map(data => ({ id: encodeURIComponent(data.clientId), data })),
    documentDelete: (path: string) => ({ delete: path }),
    documentWrite: (path: string, value: any, merge: boolean) => ({ update: { name: path, fields: value }, merge }),
    inTransaction: async (work: any) => { const result = await work('transaction'); writes = result.writes; return result.result; },
    ServerError: class extends Error {},
  };
  vm.runInNewContext(compiled, { exports, crypto, Date, require: (path: string) => path === 'zod' ? { z } : path.endsWith('/billing') ? { billingEnforced: () => false, hasPlusAccess: () => true } : path.endsWith('/firebaseAdmin') ? admin : path.endsWith('/stableSerialize') ? { stableSerialize } : { FREE_SPLIT_LIMIT: 6 } });
  return { save: exports.saveSplits, writes: () => JSON.parse(JSON.stringify(writes)) as any[] };
}
const item = (id: string) => ({ id, name: 'Push', moves: [{ name: 'Bench', sets: [{ weight: '20', reps: '8' }] }] });

test('multi-split plan installation increments once within its existing settings write', async () => {
  const h = harness();
  await h.save('owner', { items: [item('push'), item('pull')].map((item, position) => ({ item, position })), mutationId: 'install', settings: { initialized: true, weeklyPlan: { 0: 'push' }, selectedSessionId: 'push', focusDraft: null, guidedPlan: {}, updatedAt: 123 } });
  const settings = h.writes().filter(write => write.update?.name === 'users/owner/settings/main');
  assert.equal(settings.length, 1);
  assert.deepEqual(settings[0].updateTransforms, [{ fieldPath: 'splitsRevision', increment: { integerValue: '1' } }]);
  assert.equal(settings[0].update.fields.splitsMutationId, 'install');
  assert.equal(settings[0].update.fields.initialized, true);
  assert.equal(h.writes().length, 4); // two splits, settings, existing quota lock
});

test('unchanged split save writes neither a revision nor quota document', async () => {
  const data = item('push'); const h = harness([{ clientId: 'push', data, position: 0, setTargets: {} }]);
  await h.save('owner', { items: [{ item: data, position: 0, resetTargets: true }] });
  assert.deepEqual(h.writes(), []);
});

test('replacement deletion and remaining edits share one atomic revision bump', async () => {
  const h = harness([item('push'), item('pull')].map((data, position) => ({ clientId: data.id, data, position })));
  await h.save('owner', { items: [{ item: item('pull'), position: 0 }], replace: true, mutationId: 'replace' });
  assert.equal(h.writes().filter(write => write.updateTransforms).length, 1);
  assert.deepEqual(h.writes().filter(write => write.delete), [{ delete: 'users/owner/splits/push' }]);
});
