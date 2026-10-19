import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
} from 'firebase/auth';
import * as FirebaseAuth from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { firebaseConfig, isFirebaseConfigured } from './config';

// The Firebase JS SDK exposes this function in its React Native runtime entry,
// but omits it from the generic web TypeScript surface.
const getReactNativePersistence = (FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Parameters<typeof initializeAuth>[1] extends { persistence?: infer T } ? T : never;
}).getReactNativePersistence;

const app = isFirebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

function createAuth() {
  if (!app) return null;
  if (Platform.OS === 'web') {
    try {
      // Keep getAuth's persistence hierarchy, but defer its popup resolver.
      // On mobile/Safari the default resolver awaits a cross-origin iframe
      // before restoring the user. Popup flows supply the resolver explicitly.
      return initializeAuth(app, { persistence: [
        FirebaseAuth.indexedDBLocalPersistence,
        FirebaseAuth.browserLocalPersistence,
        FirebaseAuth.browserSessionPersistence,
      ] });
    } catch (error) {
      if ((error as { code?: string }).code === 'auth/already-initialized') return getAuth(app);
      throw error;
    }
  }
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Fast refresh may keep the Auth instance alive between module reloads.
    return getAuth(app);
  }
}

function createFirestore() {
  if (!app) return null;
  if (Platform.OS !== 'web') return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Fast refresh can retain an already initialized instance. In that case,
    // reuse it instead of creating a second Firestore client.
    return getFirestore(app);
  }
}

export const auth = createAuth();
export const db = createFirestore();
export const storage = app ? getStorage(app) : null;
export { app };
export { isFirebaseConfigured };
