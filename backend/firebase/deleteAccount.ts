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
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { auth, db, storage } from './client';
import { reauthenticateGoogleUser } from './googleSignIn';

const USER_COLLECTIONS = ['settings', 'splits', 'history', 'activeWorkouts', 'profilePhotos'] as const;

async function clearCollection(path: string) {
  if (!db) return;
  const snapshot = await getDocs(collection(db, path));
  const chunks: typeof snapshot.docs[] = [];
  for (let start = 0; start < snapshot.docs.length; start += 400) chunks.push(snapshot.docs.slice(start, start + 400));
  for (let start = 0; start < chunks.length; start += 3) {
    await Promise.all(chunks.slice(start, start + 3).map((items) => {
    const batch = writeBatch(db);
      items.forEach((item) => batch.delete(item.ref));
      return batch.commit();
    }));
  }
}

async function clearUserData(uid: string, onProgress?: (stage: string) => void) {
  if (!db) throw new Error('Firebase is not configured for this build.');
  if (storage) {
    onProgress?.('Removing your profile photo…');
    try {
      await deleteObject(ref(storage, `users/${uid}/profile/profile-image`));
    } catch (error) {
      if ((error as { code?: string }).code !== 'storage/object-not-found') throw error;
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
