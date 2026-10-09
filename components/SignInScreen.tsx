import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useBackendAuth } from '../backend/BackendProvider';
import { SafeAreaView } from 'react-native-safe-area-context';

export function SignInScreen() {
  const { signIn } = useBackendAuth();
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entrance, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 }).start();
  }, [entrance]);

  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await signIn(email.trim(), password, flow);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message.toLowerCase() : '';
      if (flow === 'signUp' && /(already exists|already registered|account.*exists|email.*taken)/.test(detail)) {
        setError('An account already exists for this email. Sign in instead.');
      } else if (flow === 'signUp' && detail.includes('password')) {
        setError('Use a password with at least 8 characters.');
      } else {
        setError(flow === 'signIn'
          ? 'Check your email and password, then try again.'
          : 'Couldn’t create your account. Check your details and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.content, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>R</Text></View>
          <Text style={styles.eyebrow}>REP DAY</Text>
          <Text style={styles.title}>{flow === 'signIn' ? <>Your training,{ '\n' }your way.</> : <>Start your{'\n'}next chapter.</>}</Text>
          <Text style={styles.subtitle}>Sign in to keep your workouts, splits and weekly plan with you.</Text>

          <View style={styles.form}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput value={email} onChangeText={setEmail} style={styles.input} placeholder="you@example.com" placeholderTextColor="#a4aab2" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" returnKeyType="next" />
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput value={password} onChangeText={setPassword} style={styles.input} placeholder="At least 8 characters" placeholderTextColor="#a4aab2" secureTextEntry textContentType={flow === 'signIn' ? 'password' : 'newPassword'} onSubmitEditing={submit} returnKeyType="done" />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={[styles.submit, (busy || !email.trim() || !password) && styles.disabled]} onPress={submit} disabled={busy || !email.trim() || !password}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{flow === 'signIn' ? 'Sign in' : 'Create account'}　›</Text>}
            </Pressable>
          </View>
          <Pressable style={styles.switch} onPress={() => { setError(''); setFlow(flow === 'signIn' ? 'signUp' : 'signIn'); }}>
            <Text style={styles.switchText}>{flow === 'signIn' ? 'New to Repday? ' : 'Already have an account? '}<Text style={styles.switchAction}>{flow === 'signIn' ? 'Create an account' : 'Sign in'}</Text></Text>
          </Pressable>
          <Text style={styles.privacy}>Your account keeps your training data private and in sync.</Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 27, paddingVertical: 25, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brandMark: { width: 49, height: 49, borderRadius: 17, backgroundColor: '#17191d', alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  brandMarkText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  eyebrow: { color: '#3478f6', fontSize: 13, fontWeight: '800', letterSpacing: 2.2, marginBottom: 11 },
  title: { color: '#17191d', fontSize: 43, lineHeight: 49, fontWeight: '700' },
  subtitle: { color: '#818994', fontSize: 17, lineHeight: 24, marginTop: 12, maxWidth: 350 },
  form: { marginTop: 30 },
  label: { fontSize: 12, fontWeight: '800', color: '#8e959e', letterSpacing: 1, marginBottom: 9, marginTop: 13 },
  input: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#e9edf1', paddingHorizontal: 15, fontSize: 18, color: '#17191d', backgroundColor: '#fff' },
  submit: { minHeight: 54, borderRadius: 28, backgroundColor: '#17191d', marginTop: 21, justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.45 },
  submitText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  error: { color: '#c33d3d', fontSize: 14, lineHeight: 20, marginTop: 11 },
  switch: { alignSelf: 'center', padding: 14, marginTop: 13 },
  switchText: { color: '#777f89', fontSize: 16 },
  switchAction: { color: '#3478f6', fontWeight: '700' },
  privacy: { textAlign: 'center', color: '#a1a7ae', fontSize: 13, lineHeight: 19, marginTop: 10 },
});
