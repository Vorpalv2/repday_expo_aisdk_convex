import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

export function AppleHealthHandoff({ name, startedAt, endedAt, durationSeconds, timeZone, palette }: {
  name: string; startedAt: number; endedAt: number; durationSeconds: number; timeZone: string;
  palette: { ink: string; muted: string; surface: string; line: string; blue: string };
}) {
  const [available, setAvailable] = useState(Platform.OS === 'ios');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (Platform.OS === 'web') setAvailable(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  }, []);
  if (!available) return null;
  const date = (value: number) => new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(value);
  const details = `${name}\nStart: ${date(startedAt)}\nEnd: ${date(endedAt)}\nActive workout time: ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s\nCalories: enter your own value in Apple Health.`;
  return <View style={{ paddingHorizontal: 21, paddingVertical: 10, gap: 9 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Log workout in Apple Health" onPress={() => { setOpen(value => !value); setNotice(''); }} style={{ minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 15 }}>♥ Log in Apple Health</Text></Pressable>
    {open && <View style={{ padding: 14, borderRadius: 18, backgroundColor: palette.surface, gap: 10 }}>
      <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>Add your workout manually</Text>
      <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 21 }}>In Health, go to Browse → Activity → Workouts → Add (+). Enter your workout details and calories, then save. This does not sync automatically.</Text>
      <Text selectable style={{ color: palette.ink, fontSize: 13, lineHeight: 20 }}>{details}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Apple Health" onPress={() => {
          setNotice('If Health doesn’t open, open it from your Home Screen and follow the steps above.');
          // Apple does not document a supported link to the Add Workout form.
          // A user-initiated app launch is best-effort; never report a sync success.
          void Linking.openURL('x-apple-health://').catch(() => setNotice('Open Health from your Home Screen and follow the steps above.'));
        }} style={{ flex: 1, minHeight: 42, backgroundColor: palette.blue, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>Open Health</Text></Pressable>
        {Platform.OS === 'web' && <Pressable accessibilityRole="button" accessibilityLabel="Copy workout details" onPress={() => {
          if (!navigator.clipboard?.writeText) { setNotice('Select and copy the workout details above.'); return; }
          void navigator.clipboard.writeText(details).then(() => setNotice('Workout details copied. Paste or refer to them while adding your workout.')).catch(() => setNotice('Select and copy the workout details above.'));
        }} style={{ flex: 1, minHeight: 42, borderWidth: 1, borderColor: palette.line, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: palette.ink, fontWeight: '700' }}>Copy details</Text></Pressable>}
      </View>
      {!!notice && <Text accessibilityRole="alert" style={{ color: palette.muted, fontSize: 13, lineHeight: 19 }}>{notice}</Text>}
    </View>}
  </View>;
}
