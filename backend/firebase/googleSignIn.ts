import {
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';

export async function signInWithGoogleProvider(auth: Auth) {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function linkGoogleProvider(user: User) {
  return linkWithPopup(user, new GoogleAuthProvider());
}
