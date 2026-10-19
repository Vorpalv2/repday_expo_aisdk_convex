import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(file: string, mocks: Record<string, unknown>) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const api: any = {};
  vm.runInNewContext(compiled, { exports: api, require: (name: string) => {
    assert.ok(name in mocks, `Mocked dependency ${name}`);
    return mocks[name];
  } });
  return api;
}

function client(platform: 'web' | 'ios', initializeError?: { code: string }) {
  const app = {}, auth = {}, storage = {};
  const idb = {}, local = {}, session = {}, native = {};
  let options: any, reused = 0, nativeStorage: unknown;
  const api = load('../backend/firebase/client.ts', {
    'firebase/app': { getApps: () => [], initializeApp: () => app },
    'firebase/auth': {
      initializeAuth: (receivedApp: unknown, receivedOptions: unknown) => {
        assert.equal(receivedApp, app); options = receivedOptions;
        if (initializeError) throw initializeError;
        return auth;
      },
      getAuth: () => { reused++; if (initializeError) throw initializeError; return auth; },
      indexedDBLocalPersistence: idb, browserLocalPersistence: local, browserSessionPersistence: session,
      getReactNativePersistence: (received: unknown) => { nativeStorage = received; return native; },
    },
    'firebase/firestore': { initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}), getFirestore: () => ({}) },
    'firebase/storage': { getStorage: () => ({}) },
    '@react-native-async-storage/async-storage': { default: storage },
    'react-native': { Platform: { OS: platform } },
    './config': { firebaseConfig: {}, isFirebaseConfigured: true },
  });
  return { api, auth, options, reused, nativeStorage, storage, idb, local, session, native };
}

test('web delegates persistence and popup initialization to the standard Firebase browser initializer', () => {
  const h = client('web');
  assert.equal(h.api.auth, h.auth);
  assert.equal(h.reused, 1);
  assert.equal(h.options, undefined, 'the custom initializer is not used on web');
});

test('browser initialization errors remain visible instead of silently changing persistence', () => {
  assert.throws(() => client('web', { code: 'auth/invalid-api-key' }), error => (error as { code: string }).code === 'auth/invalid-api-key');
});

test('native auth retains AsyncStorage persistence', () => {
  const h = client('ios');
  assert.equal(h.options.persistence, h.native);
  assert.equal(h.nativeStorage, h.storage);
});

test('web Google sign-in, linking and reauthentication use the initialized default popup resolver', async () => {
  const resolver = {}, auth = {}, user = {}, credential = {};
  const calls: { method: string; args: unknown[] }[] = [];
  class GoogleAuthProvider {}
  const popup = (method: string) => async (...args: unknown[]) => { calls.push({ method, args }); return credential; };
  const api = load('../backend/firebase/googleSignIn.ts', {
    'firebase/auth': { GoogleAuthProvider, browserPopupRedirectResolver: resolver,
      signInWithPopup: popup('signIn'), linkWithPopup: popup('link'), reauthenticateWithPopup: popup('reauthenticate') },
  });
  assert.equal(calls.length, 0, 'loading the module does not open an iframe');
  assert.equal(await api.signInWithGoogleProvider(auth), credential);
  assert.equal(await api.linkGoogleProvider(user), credential);
  assert.equal(await api.reauthenticateGoogleUser(user), credential);
  assert.deepEqual(calls.map(call => call.method), ['signIn', 'link', 'reauthenticate']);
  calls.forEach((call, i) => {
    assert.equal(call.args[0], i === 0 ? auth : user);
    assert.ok(call.args[1] instanceof GoogleAuthProvider);
    assert.equal(call.args.length, 2);
  });
});
