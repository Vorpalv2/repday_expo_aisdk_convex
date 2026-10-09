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
import type { AuthFlow, BackendAuth } from './contracts';

type AuthContextValue = BackendAuth & { user: User | null };
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
    signIn: async (email: string, password: string, flow: AuthFlow) => {
      if (!auth) throw new Error('Firebase is not configured for this build.');
      try {
        if (flow === 'signUp') await createUserWithEmailAndPassword(auth, email, password);
        else await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'auth/email-already-in-use') throw new Error('An account already exists for this email.');
        if (code === 'auth/weak-password') throw new Error('Use a password with at least 8 characters.');
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
