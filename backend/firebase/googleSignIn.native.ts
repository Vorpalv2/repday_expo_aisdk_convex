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

type GoogleSigninClient = typeof import('@react-native-google-signin/google-signin').GoogleSignin;

async function getGoogleSignin(): Promise<GoogleSigninClient> {
  try {
    // Load lazily so Expo Go or an older native binary can still start the app.
    // The native module is only available after installing a custom EAS build.
    return (await import('@react-native-google-signin/google-signin')).GoogleSignin;
  } catch {
    throw new Error('Google sign-in needs a new native build with the Google Sign-In module. Install an EAS development build; Expo Go does not include it.');
  }
}

async function configureGoogleSignIn() {
  const googleSignin = await getGoogleSignin();
  if (!configured) {
    googleSignin.configure({ webClientId: googleWebClientId });
    configured = true;
  }
  return googleSignin;
}

async function getGoogleCredential() {
  const googleSignin = await configureGoogleSignIn();
  if (Platform.OS === 'android') await googleSignin.hasPlayServices();
  const result = await googleSignin.signIn() as unknown as
    | { type: 'success'; data: { idToken: string | null } }
    | { type: 'cancelled' };
  if (result.type !== 'success') throw new Error('Google sign-in was cancelled.');
  const idToken = result.data.idToken ?? (await googleSignin.getTokens()).idToken;
  if (!idToken) throw new Error('Google did not return an ID token. Check the native Google OAuth setup.');
  return GoogleAuthProvider.credential(idToken);
}

export async function signInWithGoogleProvider(auth: Auth) {
  return signInWithCredential(auth, await getGoogleCredential());
}

export async function linkGoogleProvider(user: User) {
  return linkWithCredential(user, await getGoogleCredential());
}
