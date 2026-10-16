import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { RestPushController } from '../lib/restPushTypes';

export function RestPushSettings({ controller, ink, muted, surface, compact = false }: {
  controller: RestPushController; ink: string; muted: string; surface: string; compact?: boolean;
}) {
  if (Platform.OS !== 'web') return null;
  return <View style={{ width: '100%', paddingHorizontal: compact ? 20 : 0, paddingVertical: compact ? 4 : 14, gap: 5 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontSize: compact ? 13 : 16, fontWeight: '700', color: ink }}>Rest notifications</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={controller.enabled ? 'Turn off rest alerts' : 'Enable rest alerts'}
        accessibilityState={{ disabled: controller.busy }} disabled={controller.busy} onPress={() => void controller.toggle()}
        style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: controller.enabled ? surface : '#3478f6', alignItems: 'center', justifyContent: 'center', opacity: controller.busy ? 0.6 : 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: controller.enabled ? ink : '#fff' }}>{controller.busy ? 'Connecting…' : controller.enabled ? 'Turn off' : 'Enable'}</Text>
      </Pressable>
    </View>
    <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, lineHeight: 17, color: muted }}>{controller.status}</Text>
  </View>;
}

// Keep workout controls compact; the full preferences row stays in Profile.
export function RestPushBell({ controller, ink, muted, surface }: {
  controller: RestPushController; ink: string; muted: string; surface: string;
}) {
  const [open, setOpen] = useState(false);
  if (Platform.OS !== 'web') return null;
  return <View style={{ position: 'relative', zIndex: 50 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Rest notification settings"
      accessibilityHint={controller.enabled ? 'Rest alerts are on. Open notification settings.' : 'Rest alerts are off. Open notification settings.'}
      accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: controller.enabled ? '#3478f6' : surface }}>
      {controller.busy ? <ActivityIndicator size="small" color={controller.enabled ? '#fff' : '#3478f6'} /> :
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={controller.enabled ? '#fff' : '#3478f6'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </Svg>}
    </Pressable>
    {open && <View style={{ position: 'absolute', top: 48, right: 0, width: 260, padding: 14, borderRadius: 18, backgroundColor: surface, borderWidth: 1, borderColor: muted, zIndex: 100, boxShadow: '0 6px 22px rgba(0,0,0,0.14)' }}>
      <Text style={{ color: ink, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Rest notifications</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: muted, fontSize: 12, lineHeight: 17 }}>{controller.status}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={controller.enabled ? 'Turn off rest alerts' : 'Enable rest alerts'}
        disabled={controller.busy} accessibilityState={{ disabled: controller.busy }} onPress={() => void controller.toggle()}
        style={{ marginTop: 12, minHeight: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3478f6', opacity: controller.busy ? 0.6 : 1 }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{controller.busy ? 'Connecting…' : controller.enabled ? 'Turn off' : 'Enable alerts'}</Text>
      </Pressable>
    </View>}
  </View>;
}
