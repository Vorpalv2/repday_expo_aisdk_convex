import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBackendAuth } from '../backend/BackendProvider';

export type OnboardingPreferences = {
  theme: 'light' | 'dark' | 'cyberpunk';
  activityDefaultCollapsed: boolean;
  trainingGoal: 'strength' | 'muscle' | 'fitness' | 'endurance';
  restPreferenceSeconds: 60 | 90 | 120 | 180;
  weightUnit: 'kg' | 'lb';
  remindersEnabled: boolean;
  country: string;
  timeZone: string;
};

const INITIAL_PREFERENCES: OnboardingPreferences = {
  theme: 'light', activityDefaultCollapsed: true, trainingGoal: 'strength',
  restPreferenceSeconds: 90, weightUnit: 'kg', remindersEnabled: false,
  country: 'India', timeZone: 'Asia/Kolkata',
};

const GOALS = [
  { id: 'strength', label: 'Build strength', detail: 'Get stronger on your main lifts', glyph: '↗' },
  { id: 'muscle', label: 'Build muscle', detail: 'Train for steady growth', glyph: '✳' },
  { id: 'fitness', label: 'General fitness', detail: 'Build a consistent routine', glyph: '⌁' },
  { id: 'endurance', label: 'Improve endurance', detail: 'Keep moving for longer', glyph: '♡' },
] as const;

const TIME_ZONES = [
  { country: 'India', label: 'India', timeZone: 'Asia/Kolkata' },
  { country: 'United States', label: 'United States · Eastern', timeZone: 'America/New_York' },
  { country: 'United States', label: 'United States · Central', timeZone: 'America/Chicago' },
  { country: 'United States', label: 'United States · Mountain', timeZone: 'America/Denver' },
  { country: 'United States', label: 'United States · Pacific', timeZone: 'America/Los_Angeles' },
  { country: 'Canada', label: 'Canada · Eastern', timeZone: 'America/Toronto' },
  { country: 'Canada', label: 'Canada · Pacific', timeZone: 'America/Vancouver' },
  { country: 'United Kingdom', label: 'United Kingdom', timeZone: 'Europe/London' },
  { country: 'Australia', label: 'Australia · Sydney', timeZone: 'Australia/Sydney' },
  { country: 'Australia', label: 'Australia · Perth', timeZone: 'Australia/Perth' },
  { country: 'Germany', label: 'Germany', timeZone: 'Europe/Berlin' },
  { country: 'Singapore', label: 'Singapore', timeZone: 'Asia/Singapore' },
  { country: 'Japan', label: 'Japan', timeZone: 'Asia/Tokyo' },
  { country: 'United Arab Emirates', label: 'United Arab Emirates', timeZone: 'Asia/Dubai' },
] as const;

const STEPS = [
  { key: 'theme', question: 'Pick your look', description: 'Make Repday feel like your training space.', feature: 'A focused home for every session.', art: 2 },
  { key: 'activity', question: 'How should your week appear?', description: 'Choose what you see first when you open Home.', feature: 'See your training rhythm at a glance.', art: 1 },
  { key: 'goal', question: 'What are you training for?', description: 'We’ll keep your goal close as you plan and track workouts.', feature: 'Progress that feels personal.', art: 2 },
  { key: 'rest', question: 'How long do you rest?', description: 'Choose a starting timer between sets. You can change it any time.', feature: 'Keep your next set in reach.', art: 5 },
  { key: 'units', question: 'Which units do you use?', description: 'Your set log and workout summaries will use this unit.', feature: 'Every rep and weight, in your language.', art: 0 },
  { key: 'reminders', question: 'Want a reminder to train?', description: 'Turn reminders on or keep them off for now.', feature: 'Build a routine that fits real life.', art: 5 },
  { key: 'timezone', question: 'Where do you train?', description: 'Set the local time used for your weekly activity and workout history.', feature: 'Your schedule follows your local clock.', art: 3 },
] as const;

type ThemeId = OnboardingPreferences['theme'];
const PALETTES: Record<ThemeId, { bg: string; ink: string; muted: string; blue: string; surface: string; soft: string; border: string; buttonText: string }> = {
  light: { bg: '#fff', ink: '#17191d', muted: '#818994', blue: '#3478f6', surface: '#fff', soft: '#f2f6fc', border: '#e5eaf1', buttonText: '#fff' },
  dark: { bg: '#0c1016', ink: '#f3f5f8', muted: '#9da8b5', blue: '#78aaff', surface: '#151c25', soft: '#202a36', border: '#303b49', buttonText: '#111820' },
  cyberpunk: { bg: '#f5dc42', ink: '#0754bd', muted: '#315f9e', blue: '#0754bd', surface: '#fff1a1', soft: '#f1d443', border: '#d2b927', buttonText: '#ffe957' },
};

const SPRITE_CELL_WIDTH = 1448 / 3;
const SPRITE_CELL_HEIGHT = 1086 / 2;

function OnboardingArt({ sprite, size = 150 }: { sprite: number; size?: number }) {
  const column = sprite % 3;
  const row = Math.floor(sprite / 3);
  const height = size * SPRITE_CELL_HEIGHT / SPRITE_CELL_WIDTH;
  return <View pointerEvents="none" style={{ width: size, height, overflow: 'hidden' }}>
    <ExpoImage source={require('../assets/header-illustrations.png')} contentFit="fill" style={{ position: 'absolute', width: size * 3, height: height * 2, left: -column * size, top: -row * height }} />
  </View>;
}

function LoadingMascot({ width }: { width: number }) {
  const scale = width / 368;
  const column = 1;
  const row = 0;
  return <View pointerEvents="none" style={{ width, height: 496 * scale, overflow: 'hidden', alignSelf: 'center' }}>
    <ExpoImage source={require('../assets/repday-loading-sprite.png')} contentFit="fill" style={{ position: 'absolute', width: 1536 * scale, height: 1024 * scale, left: -(column * 384 + 8) * scale, top: -(row * 512 + 8) * scale }} />
  </View>;
}

type SignInScreenProps = {
  mode?: 'auth' | 'onboarding';
  onAuthAttempt?: () => void;
  onExistingUser?: () => void;
  onNewUser?: () => void;
  onOnboardingComplete?: () => void;
};

export function SignInScreen({ mode = 'auth', onAuthAttempt, onExistingUser, onNewUser, onOnboardingComplete }: SignInScreenProps) {
  const { signIn, signInWithGoogle } = useBackendAuth();
  const [preferences, setPreferences] = useState<OnboardingPreferences>(INITIAL_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [step, setStep] = useState(0);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [selectingTimeZone, setSelectingTimeZone] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const alpha = useRef(new Animated.Value(1)).current;
  const lastStep = STEPS.length;
  const isAccountStep = mode === 'auth';
  const palette = PALETTES[preferences.theme];
  const pageWidth = Dimensions.get('window').width;
  const currentStep = STEPS[Math.min(step, STEPS.length - 1)];

  useEffect(() => {
    let cancelled = false;
    Promise.all([AsyncStorage.getItem('repday.onboardingComplete'), AsyncStorage.getItem('repday.onboardingPrefs'), AsyncStorage.getItem('repday.onboardingStep')]).then(([done, savedPrefs, savedStep]) => {
      if (cancelled) return;
      if (done === 'true') setOnboardingComplete(true);
      else setOnboardingComplete(false);
      if (savedPrefs) {
        try { setPreferences({ ...INITIAL_PREFERENCES, ...JSON.parse(savedPrefs) }); } catch { /* Ignore an invalid draft. */ }
      }
      if (savedStep && Number.isInteger(Number(savedStep))) setStep(Math.max(0, Math.min(lastStep, Number(savedStep))));
      setPreferencesLoaded(true);
    }).catch(() => { if (!cancelled) { setOnboardingComplete(false); setPreferencesLoaded(true); } });
    return () => { cancelled = true; };
  }, [lastStep]);

  useEffect(() => {
    if (preferencesLoaded) AsyncStorage.setItem('repday.onboardingPrefs', JSON.stringify(preferences)).catch(() => {});
  }, [preferences, preferencesLoaded]);

  useEffect(() => {
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 2 }).start();
  }, [slide]);

  const goTo = (nextStep: number) => {
    const destination = Math.max(0, Math.min(lastStep, nextStep));
    if (destination === step) return;
    const direction = destination > step ? 1 : -1;
    Animated.parallel([
      Animated.timing(slide, { toValue: -direction * 34, duration: 125, useNativeDriver: true }),
      Animated.timing(alpha, { toValue: 0, duration: 115, useNativeDriver: true }),
    ]).start(() => {
      setStep(destination);
      AsyncStorage.setItem('repday.onboardingStep', String(destination)).catch(() => {});
      slide.setValue(direction * 34);
      Animated.parallel([
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 3 }),
        Animated.timing(alpha, { toValue: 1, duration: 170, useNativeDriver: true }),
      ]).start();
    });
  };

  const updatePreference = <K extends keyof OnboardingPreferences,>(key: K, value: OnboardingPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const finishOnboarding = async () => {
    await AsyncStorage.setItem('repday.onboardingPrefsPendingSync', 'true');
    await AsyncStorage.multiSet([
      ['repday.onboardingComplete', 'true'],
      ['repday.onboardingPrefs', JSON.stringify(preferences)],
      ['repday.onboardingStep', String(lastStep)],
    ]);
    setOnboardingComplete(true);
    onOnboardingComplete?.();
  };

  const submit = async () => {
    if (busy || googleBusy) return;
    setError('');
    setBusy(true);
    try {
      onAuthAttempt?.();
      const result = await signIn(email.trim(), password, flow);
      if (result.isNewUser) {
        await AsyncStorage.multiSet([
          ['repday.onboardingComplete', 'false'],
          ['repday.onboardingPrefs', JSON.stringify(INITIAL_PREFERENCES)],
          ['repday.onboardingStep', '0'],
          ['repday.onboardingPrefsPendingSync', 'false'],
        ]);
        setPreferences(INITIAL_PREFERENCES);
        setStep(0);
        setOnboardingComplete(false);
        onNewUser?.();
      } else onExistingUser?.();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message.toLowerCase() : '';
      if (flow === 'signUp' && /(already exists|already registered|account.*exists|email.*taken)/.test(detail)) setError('An account already exists for this email. Sign in instead.');
      else if (flow === 'signUp' && detail.includes('password')) setError('Use a password with at least 8 characters.');
      else setError(flow === 'signIn' ? 'Check your email and password, then try again.' : 'Couldn’t create your account. Check your details and try again.');
    } finally { setBusy(false); }
  };

  const continueWithGoogle = async () => {
    if (busy || googleBusy) return;
    setError(''); setGoogleBusy(true);
    try {
      onAuthAttempt?.();
      const result = await signInWithGoogle();
      if (result.isNewUser) {
        await AsyncStorage.multiSet([
          ['repday.onboardingComplete', 'false'],
          ['repday.onboardingPrefs', JSON.stringify(INITIAL_PREFERENCES)],
          ['repday.onboardingStep', '0'],
          ['repday.onboardingPrefsPendingSync', 'false'],
        ]);
        setPreferences(INITIAL_PREFERENCES);
        setStep(0);
        setOnboardingComplete(false);
        onNewUser?.();
      } else onExistingUser?.();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t sign in with Google. Try again.'); }
    finally { setGoogleBusy(false); }
  };

  const selectedOption = (selected: boolean) => [styles.choice, { borderColor: selected ? palette.blue : palette.border, backgroundColor: selected ? palette.soft : palette.surface }, selected && { borderWidth: 2 }];
  const choiceText = { color: palette.ink };

  const renderOptions = () => {
    if (selectingTimeZone) return <View style={styles.optionList}>
      {TIME_ZONES.map((option) => {
        const selected = preferences.timeZone === option.timeZone;
        return <Pressable key={option.timeZone} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { updatePreference('country', option.country); updatePreference('timeZone', option.timeZone); setSelectingTimeZone(false); }} style={selectedOption(selected)}>
          <View style={{ flex: 1 }}><Text style={[styles.choiceTitle, choiceText]}>{option.label}</Text><Text style={[styles.choiceDetail, { color: palette.muted }]}>{option.timeZone}</Text></View>
          <View style={[styles.radio, { borderColor: selected ? palette.blue : palette.muted }, selected && { backgroundColor: palette.blue }]}>{selected && <Text style={styles.radioCheck}>✓</Text>}</View>
        </Pressable>;
      })}
    </View>;

    switch (currentStep.key) {
      case 'theme': return <View style={styles.optionList}>{([
        ['light', 'Light', 'Clean white and charcoal'], ['dark', 'Dark', 'Easy on the eyes'], ['cyberpunk', 'Cyberpunk 2077', 'Neon blue on game-inspired yellow'],
      ] as [ThemeId, string, string][]).map(([id, label, detail]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: preferences.theme === id }} onPress={() => updatePreference('theme', id)} style={selectedOption(preferences.theme === id)}><View style={[styles.themeSample, { backgroundColor: PALETTES[id].bg, borderColor: PALETTES[id].border }]}><View style={{ width: 16, height: 5, borderRadius: 3, backgroundColor: PALETTES[id].blue }} /></View><View style={{ flex: 1 }}><Text style={[styles.choiceTitle, choiceText]}>{label}</Text><Text style={[styles.choiceDetail, { color: palette.muted }]}>{detail}</Text></View>{preferences.theme === id && <Text style={[styles.check, { color: palette.blue }]}>✓</Text>}</Pressable>)}</View>;
      case 'activity': return <View style={styles.optionList}>{[
        { value: true, label: 'Keep it compact', detail: 'Show the week at a glance' },
        { value: false, label: 'Show the full week', detail: 'Open the calendar by default' },
      ].map((option) => <Pressable key={String(option.value)} accessibilityRole="button" accessibilityState={{ selected: preferences.activityDefaultCollapsed === option.value }} onPress={() => updatePreference('activityDefaultCollapsed', option.value)} style={selectedOption(preferences.activityDefaultCollapsed === option.value)}><View style={{ flex: 1 }}><Text style={[styles.choiceTitle, choiceText]}>{option.label}</Text><Text style={[styles.choiceDetail, { color: palette.muted }]}>{option.detail}</Text></View>{preferences.activityDefaultCollapsed === option.value && <Text style={[styles.check, { color: palette.blue }]}>✓</Text>}</Pressable>)}</View>;
      case 'goal': return <View style={styles.optionList}>{GOALS.map((goal) => <Pressable key={goal.id} accessibilityRole="button" accessibilityState={{ selected: preferences.trainingGoal === goal.id }} onPress={() => updatePreference('trainingGoal', goal.id)} style={selectedOption(preferences.trainingGoal === goal.id)}><View style={[styles.goalGlyph, { backgroundColor: palette.soft }]}><Text style={{ color: palette.blue, fontSize: 20, fontWeight: '800' }}>{goal.glyph}</Text></View><View style={{ flex: 1 }}><Text style={[styles.choiceTitle, choiceText]}>{goal.label}</Text><Text style={[styles.choiceDetail, { color: palette.muted }]}>{goal.detail}</Text></View>{preferences.trainingGoal === goal.id && <Text style={[styles.check, { color: palette.blue }]}>✓</Text>}</Pressable>)}</View>;
      case 'rest': return <View style={styles.optionList}>{([60, 90, 120, 180] as const).map((seconds) => { const selected = preferences.restPreferenceSeconds === seconds; const label = seconds >= 60 ? `${seconds / 60} min` : `${seconds} sec`; return <Pressable key={seconds} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => updatePreference('restPreferenceSeconds', seconds)} style={[styles.smallChoice, { borderColor: selected ? palette.blue : palette.border, backgroundColor: selected ? palette.blue : palette.surface }]}><Text style={{ color: selected ? '#fff' : palette.ink, fontSize: 16, fontWeight: '800' }}>{label}</Text></Pressable>; })}</View>;
      case 'units': return <View style={styles.optionList}>{(['kg', 'lb'] as const).map((unit) => { const selected = preferences.weightUnit === unit; return <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => updatePreference('weightUnit', unit)} style={[styles.unitChoice, { borderColor: selected ? palette.blue : palette.border, backgroundColor: selected ? palette.soft : palette.surface }]}><Text style={{ color: selected ? palette.blue : palette.ink, fontSize: 34, fontWeight: '900' }}>{unit}</Text><Text style={[styles.choiceDetail, { color: palette.muted }]}>{unit === 'kg' ? 'Kilograms' : 'Pounds'}</Text></Pressable>; })}</View>;
      case 'reminders': return <View style={styles.optionList}>{[
        { value: false, label: 'Not now', detail: 'I’ll open Repday when I’m ready' },
        { value: true, label: 'Keep me on track', detail: 'Enable workout reminders' },
      ].map((option) => <Pressable key={String(option.value)} accessibilityRole="button" accessibilityState={{ selected: preferences.remindersEnabled === option.value }} onPress={() => updatePreference('remindersEnabled', option.value)} style={selectedOption(preferences.remindersEnabled === option.value)}><View style={{ flex: 1 }}><Text style={[styles.choiceTitle, choiceText]}>{option.label}</Text><Text style={[styles.choiceDetail, { color: palette.muted }]}>{option.detail}</Text></View>{preferences.remindersEnabled === option.value && <Text style={[styles.check, { color: palette.blue }]}>✓</Text>}</Pressable>)}</View>;
      case 'timezone': return <Pressable accessibilityRole="button" onPress={() => setSelectingTimeZone(true)} style={[styles.timeZoneButton, { backgroundColor: palette.soft, borderColor: palette.border }]}><View style={{ flex: 1 }}><Text style={[styles.choiceTitle, choiceText]}>{TIME_ZONES.find((option) => option.timeZone === preferences.timeZone)?.label ?? preferences.country}</Text><Text style={[styles.choiceDetail, { color: palette.muted }]}>{preferences.timeZone}</Text></View><Text style={[styles.timeZoneChange, { color: palette.blue }]}>Change ›</Text></Pressable>;
      default: return null;
    }
  };

  if (onboardingComplete === null) return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]}><View style={styles.center}><ActivityIndicator color={palette.blue} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.shell}>
          {!isAccountStep ? <>
            <View style={styles.topBar}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => selectingTimeZone ? setSelectingTimeZone(false) : goTo(step - 1)} disabled={step === 0 && !selectingTimeZone} style={[styles.backButton, { borderColor: palette.border }, step === 0 && !selectingTimeZone && { opacity: 0 }]}><Text style={{ color: palette.ink, fontSize: 22 }}>‹</Text></Pressable>
              <Text style={[styles.stepCount, { color: palette.muted }]}>{step + 1} / {STEPS.length}</Text>
              <View style={{ width: 42 }} />
            </View>
            <View style={styles.progressRail}>{STEPS.map((item, index) => <View key={item.key} style={[styles.progressSegment, { backgroundColor: index <= step ? palette.blue : palette.border }]} />)}</View>
            <Animated.View style={{ flex: 1, opacity: alpha, transform: [{ translateX: slide }] }}>
              <ScrollView contentContainerStyle={styles.stepScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.heroRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.featureTitle, { color: palette.ink }]}>{selectingTimeZone ? 'Choose your time zone' : currentStep.question}</Text>
                    <Text style={[styles.featureDescription, { color: palette.muted }]}>{selectingTimeZone ? 'Your training plan will follow local time.' : currentStep.description}</Text>
                  </View>
                  {!selectingTimeZone && <OnboardingArt sprite={currentStep.art} size={Math.min(142, pageWidth * 0.32)} />}
                </View>
                {!selectingTimeZone && <View style={[styles.featureNote, { backgroundColor: palette.soft }]}><View style={[styles.featureMark, { backgroundColor: palette.blue }]}><Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>R</Text></View><View style={{ flex: 1 }}><Text style={[styles.featureLabel, { color: palette.blue }]}>REP DAY, MADE PERSONAL</Text><Text style={[styles.featureCopy, { color: palette.ink }]}>{currentStep.feature}</Text></View></View>}
                {renderOptions()}
              </ScrollView>
            </Animated.View>
            <View style={styles.footer}>
              <Pressable accessibilityRole="button" onPress={() => selectingTimeZone ? setSelectingTimeZone(false) : step === STEPS.length - 1 ? void finishOnboarding() : goTo(step + 1)} style={[styles.primary, { backgroundColor: palette.ink }]}>
                <Text style={[styles.primaryText, { color: palette.bg }]}>{selectingTimeZone ? 'Done' : step === STEPS.length - 1 ? 'Finish setup' : 'Continue'}</Text><Text style={{ color: palette.bg, fontSize: 21 }}>›</Text>
              </Pressable>
            </View>
          </> : <>
            <View style={styles.authTopBar}>
              <View style={{ width: 42 }} />
              <Text style={[styles.authKicker, { color: palette.blue }]}>YOUR TRAINING, IN SYNC</Text>
              <View style={{ width: 42 }} />
            </View>
            <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <LoadingMascot width={Math.min(210, pageWidth * 0.52)} />
              <Text style={[styles.authTitle, { color: palette.ink }]}>{flow === 'signIn' ? 'Welcome back.' : 'Start your next chapter.'}</Text>
              <Text style={[styles.authSubtitle, { color: palette.muted }]}>{flow === 'signIn' ? 'Your workouts and weekly plan are ready.' : 'Create an account to keep your training in sync.'}</Text>
              <View style={styles.form}>
                <Text style={[styles.label, { color: palette.muted }]}>EMAIL</Text>
                <TextInput value={email} onChangeText={setEmail} style={[styles.input, { color: palette.ink, backgroundColor: palette.surface, borderColor: palette.border }]} placeholder="you@example.com" placeholderTextColor={palette.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" returnKeyType="next" />
                <Text style={[styles.label, { color: palette.muted }]}>PASSWORD</Text>
                <TextInput value={password} onChangeText={setPassword} style={[styles.input, { color: palette.ink, backgroundColor: palette.surface, borderColor: palette.border }]} placeholder="At least 8 characters" placeholderTextColor={palette.muted} secureTextEntry textContentType={flow === 'signIn' ? 'password' : 'newPassword'} onSubmitEditing={submit} returnKeyType="done" />
                {!!error && <Text style={styles.error}>{error}</Text>}
                <Pressable style={[styles.primary, { backgroundColor: palette.ink }, (busy || !email.trim() || !password) && styles.disabled]} onPress={submit} disabled={busy || !email.trim() || !password}>
                  {busy ? <ActivityIndicator color={palette.bg} /> : <><Text style={[styles.primaryText, { color: palette.bg }]}>{flow === 'signIn' ? 'Sign in' : 'Create account'}</Text><Text style={{ color: palette.bg, fontSize: 21 }}>›</Text></>}
                </Pressable>
                <View style={styles.divider}><View style={[styles.dividerLine, { backgroundColor: palette.border }]} /><Text style={[styles.dividerLabel, { color: palette.muted }]}>OR</Text><View style={[styles.dividerLine, { backgroundColor: palette.border }]} /></View>
                <Pressable accessibilityRole="button" style={[styles.googleButton, { borderColor: palette.border, backgroundColor: palette.surface }, googleBusy && styles.disabled]} onPress={continueWithGoogle} disabled={busy || googleBusy}>
                  {googleBusy ? <ActivityIndicator color={palette.ink} /> : <><View style={styles.googleMark}><Text style={styles.googleMarkText}>G</Text></View><Text style={[styles.googleButtonText, { color: palette.ink }]}>Continue with Google</Text></>}
                </Pressable>
              </View>
              <Pressable style={styles.switch} onPress={() => { setError(''); setFlow(flow === 'signIn' ? 'signUp' : 'signIn'); }}>
                <Text style={[styles.switchText, { color: palette.muted }]}>{flow === 'signIn' ? 'New to Repday? ' : 'Already have an account? '}<Text style={{ color: palette.blue, fontWeight: '800' }}>{flow === 'signIn' ? 'Create an account' : 'Sign in'}</Text></Text>
              </Pressable>
              <Text style={[styles.privacy, { color: palette.muted }]}>Your training data stays private to your account.</Text>
            </ScrollView>
          </>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shell: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 5 },
  topBar: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  stepCount: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  progressRail: { flexDirection: 'row', gap: 5, marginVertical: 10 },
  progressSegment: { flex: 1, height: 4, borderRadius: 4 },
  stepScroll: { paddingTop: 20, paddingBottom: 20, gap: 18 },
  heroRow: { minHeight: 134, flexDirection: 'row', alignItems: 'center', gap: 3 },
  featureTitle: { fontSize: 32, lineHeight: 36, fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'Impact', fontWeight: '900', letterSpacing: -0.7 },
  featureDescription: { fontSize: 15, lineHeight: 21, marginTop: 8, maxWidth: 285 },
  featureNote: { minHeight: 74, borderRadius: 20, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  featureMark: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  featureLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  featureCopy: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  optionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  choice: { width: '100%', minHeight: 64, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 11 },
  choiceTitle: { fontSize: 15, fontWeight: '800' },
  choiceDetail: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  check: { fontSize: 21, fontWeight: '900', paddingHorizontal: 4 },
  themeSample: { width: 43, height: 35, borderWidth: 1, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  radio: { width: 23, height: 23, borderWidth: 1.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  radioCheck: { color: '#fff', fontSize: 13, fontWeight: '900' },
  goalGlyph: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  smallChoice: { width: '48%', minHeight: 56, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  unitChoice: { flex: 1, minHeight: 100, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 4 },
  timeZoneButton: { width: '100%', minHeight: 72, borderWidth: 1, borderRadius: 18, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center' },
  timeZoneChange: { fontSize: 14, fontWeight: '800' },
  footer: { paddingTop: 9, paddingBottom: 8 },
  primary: { minHeight: 56, borderRadius: 29, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryText: { fontSize: 17, fontWeight: '800' },
  signInInstead: { alignItems: 'center', paddingVertical: 12 },
  signInInsteadText: { fontSize: 13 },
  authTopBar: { height: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  authScroll: { flexGrow: 1, justifyContent: 'center', paddingTop: 2, paddingBottom: 17 },
  authTitle: { textAlign: 'center', fontSize: 30, lineHeight: 36, fontWeight: '900', marginTop: -5 },
  authSubtitle: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: 11 },
  form: { width: '100%' },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginTop: 10, marginBottom: 6 },
  input: { height: 51, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  disabled: { opacity: 0.45 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 13 },
  dividerLine: { height: 1, flex: 1 },
  dividerLabel: { fontSize: 11, fontWeight: '700' },
  googleButton: { minHeight: 51, borderRadius: 26, borderWidth: 1, marginTop: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  googleButtonText: { fontSize: 15, fontWeight: '700' },
  googleMark: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#e9edf1', alignItems: 'center', justifyContent: 'center' },
  googleMarkText: { color: '#4285f4', fontSize: 15, fontWeight: '800' },
  error: { color: '#c33d3d', fontSize: 13, lineHeight: 19, marginTop: 9 },
  switch: { alignSelf: 'center', paddingVertical: 11, paddingHorizontal: 8, marginTop: 2 },
  switchText: { fontSize: 14 },
  privacy: { textAlign: 'center', fontSize: 11, lineHeight: 16 },
});
