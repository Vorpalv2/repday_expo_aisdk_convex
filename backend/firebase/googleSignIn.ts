import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  linkWithPopup,
  reauthenticateWithPopup,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';

export async function signInWithGoogleProvider(auth: Auth) {
  return signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver);
}

export async function linkGoogleProvider(user: User) {
  return linkWithPopup(user, new GoogleAuthProvider(), browserPopupRedirectResolver);
}

export async function reauthenticateGoogleUser(user: User) {
  return reauthenticateWithPopup(user, new GoogleAuthProvider(), browserPopupRedirectResolver);
}
