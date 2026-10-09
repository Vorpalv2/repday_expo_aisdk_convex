import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  GoogleAuthProvider,
  linkWithCredential,
  signInWithCredential,
  type Auth,
  type User,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { googleWebClientId } from './config';

let configured = false;

function configureGoogleSignIn() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: googleWebClientId });
  configured = true;
}

async function getGoogleCredential() {
  configureGoogleSignIn();
  if (Platform.OS === 'android') await GoogleSignin.hasPlayServices();
  const result = await GoogleSignin.signIn() as unknown as
    | { type: 'success'; data: { idToken: string | null } }
    | { type: 'cancelled' };
  if (result.type !== 'success') throw new Error('Google sign-in was cancelled.');
  const idToken = result.data.idToken ?? (await GoogleSignin.getTokens()).idToken;
  if (!idToken) throw new Error('Google did not return an ID token. Check the native Google OAuth setup.');
  return GoogleAuthProvider.credential(idToken);
}

export async function signInWithGoogleProvider(auth: Auth) {
  return signInWithCredential(auth, await getGoogleCredential());
}

export async function linkGoogleProvider(user: User) {
  return linkWithCredential(user, await getGoogleCredential());
}
