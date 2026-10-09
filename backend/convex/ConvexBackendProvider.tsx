import React, { createContext, useContext } from 'react';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import { ConvexReactClient, useConvexAuth } from 'convex/react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { BackendAuth } from '../contracts';

const AuthContext = createContext<BackendAuth | null>(null);

const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convexClient = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null;

function ConvexAuthBridge({ children }: React.PropsWithChildren) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn: convexSignIn, signOut: convexSignOut } = useAuthActions();

  const auth: BackendAuth = {
    isLoading,
    isAuthenticated,
    signIn: async (email, password, flow) => {
      await convexSignIn('password', { email, password, flow });
    },
    signOut: async () => {
      await convexSignOut();
    },
  };

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useBackendAuth(): BackendAuth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useBackendAuth must be used inside BackendProvider.');
  return auth;
}

export function ConvexBackendProvider({ children }: React.PropsWithChildren) {
  if (!convexClient) return null;
  return (
    <ConvexAuthProvider client={convexClient} storage={Platform.OS === 'web' ? undefined : secureStorage}>
      <ConvexAuthBridge>{children}</ConvexAuthBridge>
    </ConvexAuthProvider>
  );
}

export const isConvexBackendConfigured = Boolean(convexClient);
