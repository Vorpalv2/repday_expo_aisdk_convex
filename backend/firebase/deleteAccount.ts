import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { auth, db, storage } from './client';
import { reauthenticateGoogleUser } from './googleSignIn';

const USER_COLLECTIONS = ['settings', 'splits', 'history', 'activeWorkouts', 'profilePhotos'] as const;

async function clearCollection(path: string) {
  const database = db;
  if (!database) return;
  const snapshot = await getDocs(collection(database, path));
  const chunks: typeof snapshot.docs[] = [];
  for (let start = 0; start < snapshot.docs.length; start += 400) chunks.push(snapshot.docs.slice(start, start + 400));
  for (let start = 0; start < chunks.length; start += 3) {
    await Promise.all(chunks.slice(start, start + 3).map((items) => {
      const batch = writeBatch(database);
      items.forEach((item) => batch.delete(item.ref));
      return batch.commit();
    }));
  }
}

async function clearUserData(uid: string, onProgress?: (stage: string) => void) {
  if (!db) throw new Error('Firebase is not configured for this build.');
  onProgress?.('Checking your profile photo…');
  const photo = await getDocFromServer(doc(db, 'users', uid, 'profilePhotos', 'current'));
  // Google avatars and accounts without an uploaded photo have no Storage file.
  if (photo.exists()) {
    if (!storage) throw new Error('Photo storage is unavailable. Your account has not been deleted.');
    onProgress?.('Removing your profile photo…');
    const previousRetryTime = storage.maxOperationRetryTime;
    storage.maxOperationRetryTime = 15_000;
    try {
      await deleteObject(ref(storage, `users/${uid}/profile/profile-image`));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'storage/retry-limit-exceeded') {
        throw new Error('Could not reach photo storage. Your account has not been deleted. Check your connection and try again.');
      }
      if (code === 'storage/unauthorized') {
        throw new Error('Photo storage denied deletion. Your account has not been deleted. Please contact support.');
      }
      if (code !== 'storage/object-not-found') throw error;
    } finally {
      storage.maxOperationRetryTime = previousRetryTime;
    }
  }
  // Active workout set logs are the only nested collection in the current data model.
  onProgress?.('Removing workout set details…');
  const activeWorkouts = await getDocs(collection(db, 'users', uid, 'activeWorkouts'));
  await Promise.all(activeWorkouts.docs.map((workout) => clearCollection(`users/${uid}/activeWorkouts/${workout.id}/sets`)));
  onProgress?.('Removing workouts and preferences…');
  await Promise.all(USER_COLLECTIONS.map((name) => clearCollection(`users/${uid}/${name}`)));
  onProgress?.('Finishing account deletion…');
  await deleteDoc(doc(db, 'users', uid));
}

export async function deleteFirebaseAccount(user: User, password?: string, onProgress?: (stage: string) => void) {
  if (!auth || !db) throw new Error('Firebase is not configured for this build.');
  const providers = user.providerData.map((item) => item.providerId);
  try {
    if (providers.includes('password')) {
      if (!password || !user.email) throw new Error('Enter your password to confirm account deletion.');
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } else if (providers.includes('google.com')) {
      await reauthenticateGoogleUser(user);
    } else {
      throw new Error('Sign in again with your account provider before deleting your account.');
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      throw new Error('That password didn’t match. Your account data is unchanged.');
    }
    if (code === 'auth/popup-closed-by-user') throw new Error('Google verification was cancelled. Your account data is unchanged.');
    throw error;
  }

  // Reauthenticate before removing anything so a stale session cannot partially erase data.
  onProgress?.('Deleting your Repday data…');
  await clearUserData(user.uid, onProgress);
  await deleteUser(user);
}
