import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BackendProvider, BackendSetup, isBackendConfigured } from '../backend/BackendProvider';

export default function RootLayout() {
  return <SafeAreaProvider><StatusBar style="dark"/>{isBackendConfigured ? <BackendProvider><Stack screenOptions={{headerShown:false}}/></BackendProvider> : <BackendSetup/>}</SafeAreaProvider>;
}
