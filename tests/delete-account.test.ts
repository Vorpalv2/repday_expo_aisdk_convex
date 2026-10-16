import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';

// Exercise the deletion flow with SDK boundaries stubbed, without deleting real users.
const compiled = ts.transpileModule(readFileSync(new URL('../backend/firebase/deleteAccount.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup({ photo = false, storageCode = '', authCode = '', google = false } = {}) {
  const calls: string[] = [];
  const stages: string[] = [];
  const storage = { maxOperationRetryTime: 120_000 };
  const sdk = {
    'firebase/auth': {
      EmailAuthProvider: { credential: () => ({}) },
      reauthenticateWithCredential: async () => { calls.push('reauth'); if (authCode) throw { code: authCode }; },
      deleteUser: async () => { calls.push('delete-auth'); },
    },
    'firebase/firestore': {
      collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
      doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
      getDocFromServer: async (path: string) => { calls.push(`photo-read:${path}`); return { exists: () => photo }; },
      getDocs: async (path: string) => {
        calls.push(`list:${path}`);
        return { docs: path.endsWith('/activeWorkouts') ? [{ id: 'current', ref: `${path}/current` }] : [{ id: 'qa', ref: `${path}/qa` }] };
      },
      writeBatch: () => ({ delete: (path: string) => calls.push(`delete:${path}`), commit: async () => {} }),
      deleteDoc: async (path: string) => { calls.push(`delete:${path}`); },
    },
    'firebase/storage': {
      ref: (_storage: unknown, path: string) => path,
      deleteObject: async (path: string) => { assert.equal(storage.maxOperationRetryTime, 15_000); calls.push(`photo-delete:${path}`); if (storageCode) throw { code: storageCode }; },
    },
    '../billing': { billingRequest: async () => { calls.push('cancel-subscription'); } },
    './client': { auth: {}, db: {}, storage },
    './googleSignIn': { reauthenticateGoogleUser: async () => { calls.push('reauth-google'); } },
  };
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, require: (name: keyof typeof sdk) => sdk[name] });
  const user = { uid: 'qa-user', email: 'qa@example.com', providerData: [{ providerId: google ? 'google.com' : 'password' }] };
  return { calls, storage, stages, run: () => exports.deleteFirebaseAccount(user, 'test-password', (stage: string) => stages.push(stage)) };
}

for (const google of [false, true]) test(`no uploaded photo skips Storage (${google ? 'Google' : 'password'})`, async () => {
  const flow = setup({ google }); await flow.run();
  assert.equal(flow.calls.some(call => call.startsWith('photo-delete:')), false);
  assert.equal(flow.stages.includes('Removing your profile photo…'), false);
  assert.ok(flow.calls.includes('delete:users/qa-user/activeWorkouts/current/sets/qa'));
  assert.ok(flow.calls.includes('delete:users/qa-user/settings/qa'));
  assert.equal(flow.calls.at(-1), 'delete-auth');
});
for (const storageCode of ['', 'storage/object-not-found']) test(`uploaded photo ${storageCode ? 'already missing' : 'exists'} permits complete deletion`, async () => {
  const flow = setup({ photo: true, storageCode }); await flow.run();
  assert.ok(flow.calls.includes('photo-delete:users/qa-user/profile/profile-image'));
  assert.equal(flow.calls.at(-1), 'delete-auth');
  assert.equal(flow.storage.maxOperationRetryTime, 120_000);
});
for (const [storageCode, message] of [['storage/retry-limit-exceeded', 'Could not reach photo storage'], ['storage/unauthorized', 'Photo storage denied deletion']]) test(`${storageCode} stops before removing account data`, async () => {
  const flow = setup({ photo: true, storageCode });
  await assert.rejects(flow.run, new RegExp(message));
  assert.equal(flow.calls.some(call => call.startsWith('delete:') || call === 'delete-auth'), false);
  assert.equal(flow.storage.maxOperationRetryTime, 120_000);
});
test('failed reauthentication leaves every record untouched', async () => {
  const flow = setup({ authCode: 'auth/invalid-credential' });
  await assert.rejects(flow.run, /password didn’t match/);
  assert.deepEqual(flow.calls, ['reauth']);
});
test('subscription cancellation runs after reauthentication and before any account data removal',async()=>{
 const flow=setup();await flow.run();
 assert.ok(flow.calls.indexOf('cancel-subscription')>flow.calls.indexOf('reauth'));
 assert.ok(flow.calls.indexOf('cancel-subscription')<flow.calls.findIndex(call=>call.startsWith('photo-read:')));
});
