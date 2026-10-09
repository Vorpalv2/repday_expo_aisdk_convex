import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
} from 'firebase/auth';
import * as FirebaseAuth from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
  if (Platform.OS === 'web') return getAuth(app);
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Fast refresh may keep the Auth instance alive between module reloads.
    return getAuth(app);
  }
}

export const auth = createAuth();
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
export { app };
export { isFirebaseConfigured };
