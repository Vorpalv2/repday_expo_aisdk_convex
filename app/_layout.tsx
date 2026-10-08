import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { Stack } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false }) : null;
const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

function ConvexSetup() {
  return <View style={styles.setup}><View style={styles.logo}><Text style={styles.logoText}>R</Text></View><Text style={styles.title}>Connect your training cloud</Text><Text style={styles.body}>Add your Convex deployment URL as EXPO_PUBLIC_CONVEX_URL in .env.local, then restart Expo. Convex Auth and cloud sync are ready once this app is linked to a deployment.</Text></View>;
}

export default function RootLayout() {
  return <SafeAreaProvider><StatusBar style="dark"/>{convex ? <ConvexAuthProvider client={convex} storage={Platform.OS === 'web' ? undefined : secureStorage}><Stack screenOptions={{headerShown:false}}/></ConvexAuthProvider> : <ConvexSetup/>}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  setup: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 30, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#17191d', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  logoText: { color: '#fff', fontSize: 24, fontWeight: '800' },
  title: { color: '#17191d', fontSize: 27, fontWeight: '700' },
  body: { color: '#77808a', fontSize: 14, lineHeight: 21, marginTop: 10 },
});
