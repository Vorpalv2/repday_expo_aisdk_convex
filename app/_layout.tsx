import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BackendProvider, BackendSetup, isBackendConfigured } from '../backend/BackendProvider';

export default function RootLayout() {
  return <SafeAreaProvider><StatusBar style="dark"/>{isBackendConfigured ? <BackendProvider><Stack screenOptions={{headerShown:false}}/></BackendProvider> : <BackendSetup/>}</SafeAreaProvider>;
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <View style={{ flex: 1, minHeight: 300, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
    <Text style={{ color: '#17191d', fontSize: 25, fontWeight: '800', textAlign: 'center' }}>Repday couldn’t open</Text>
    <Text style={{ color: '#69727c', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 10 }}>An unexpected error interrupted this screen. Reload the app to try again.</Text>
    <Pressable accessibilityRole="button" onPress={() => { if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload(); else void retry(); }} style={{ backgroundColor: '#3478f6', borderRadius: 18, paddingHorizontal: 26, paddingVertical: 14, marginTop: 22 }}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Reload app</Text></Pressable>
  </View>;
}
