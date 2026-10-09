import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function ConvexSetup() {
  return (
    <View style={styles.setup}>
      <View style={styles.logo}><Text style={styles.logoText}>R</Text></View>
      <Text style={styles.title}>Connect your training cloud</Text>
      <Text style={styles.body}>
        Add your Convex deployment URL as EXPO_PUBLIC_CONVEX_URL in .env.local, then restart Expo.
        Convex Auth and cloud sync are ready once this app is linked to a deployment.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  setup: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 30, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#17191d', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  logoText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  title: { color: '#17191d', fontSize: 32, fontWeight: '700' },
  body: { color: '#77808a', fontSize: 17, lineHeight: 24, marginTop: 10 },
});
