import {
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
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

export async function reauthenticateGoogleUser(user: User) {
  return reauthenticateWithPopup(user, new GoogleAuthProvider());
}
