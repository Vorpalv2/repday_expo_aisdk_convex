import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { StyleSheet, Text, View } from 'react-native';
import { auth, isFirebaseConfigured } from './firebase/client';
import { linkGoogleProvider, signInWithGoogleProvider } from './firebase/googleSignIn';
import type { AuthFlow, BackendAuth } from './contracts';

type AuthContextValue = BackendAuth & {
  user: User | null;
  googleLinked: boolean;
  signInWithGoogle: () => Promise<void>;
  linkGoogleAccount: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

function FirebaseAuthBridge({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsLoading(false);
    }, () => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    googleLinked: Boolean(user?.providerData.some((provider) => provider.providerId === 'google.com')),
    signIn: async (email: string, password: string, flow: AuthFlow) => {
      if (!auth) throw new Error('Firebase is not configured for this build.');
      try {
        if (flow === 'signUp') await createUserWithEmailAndPassword(auth, email, password);
        else await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'auth/email-already-in-use') throw new Error('An account already exists for this email.');
        if (code === 'auth/weak-password') throw new Error('Use a password with at least 8 characters.');
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
          throw new Error('Check your email and password, then try again.');
        }
        throw error;
      }
    },
    signInWithGoogle: async () => {
      if (!auth) throw new Error('Firebase is not configured for this build.');
      try {
        await signInWithGoogleProvider(auth);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'auth/account-exists-with-different-credential' || code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
          throw new Error('An account already uses this email. Sign in with your email and password, then link Google from Profile.');
        }
        if (code === 'auth/popup-closed-by-user') throw new Error('Google sign-in was cancelled.');
        if (code === 'auth/unauthorized-domain') throw new Error('This website is not authorized for Google sign-in in Firebase.');
        throw error;
      }
    },
    linkGoogleAccount: async () => {
      if (!auth?.currentUser) throw new Error('Sign in before linking a Google account.');
      try {
        const result = await linkGoogleProvider(auth.currentUser);
        setUser(result.user);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'auth/credential-already-in-use' || code === 'auth/provider-already-linked') {
          throw new Error('That Google account is already linked to a Repday account.');
        }
        if (code === 'auth/popup-closed-by-user') throw new Error('Google linking was cancelled.');
        if (code === 'auth/unauthorized-domain') throw new Error('This website is not authorized for Google sign-in in Firebase.');
        throw error;
      }
    },
    signOut: async () => {
      if (auth) await firebaseSignOut(auth);
    },
  }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useBackendAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useBackendAuth must be used inside BackendProvider.');
  return context;
}

export function BackendProvider({ children }: React.PropsWithChildren) {
  if (!isFirebaseConfigured || !auth) return <BackendSetup/>;
  return <FirebaseAuthBridge>{children}</FirebaseAuthBridge>;
}

export const isBackendConfigured = isFirebaseConfigured;

export function BackendSetup() {
  return <View style={styles.setup}>
    <View style={styles.logo}><Text style={styles.logoText}>R</Text></View>
    <Text style={styles.title}>Connect your Firebase project</Text>
    <Text style={styles.body}>Add the Firebase app values from your Firebase project to the EXPO_PUBLIC_FIREBASE_* entries in .env.local, enable Email/Password sign-in, then restart Expo.</Text>
  </View>;
}

const styles = StyleSheet.create({
  setup: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 30, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#17191d', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  logoText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  title: { color: '#17191d', fontSize: 32, fontWeight: '700' },
  body: { color: '#77808a', fontSize: 17, lineHeight: 24, marginTop: 10 },
});
