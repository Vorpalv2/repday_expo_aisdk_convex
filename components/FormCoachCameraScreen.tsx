import React, { useCallback, useEffect, useState } from 'react';
import { CameraView, type CameraMountError } from 'expo-camera';
import type { PermissionResponse } from 'expo';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Move, WeightUnit } from '../backend/contracts';

type Props = {
  exercise: Move;
  weightUnit: WeightUnit;
  elapsedSeconds: number;
  permission: PermissionResponse | null;
  onRequestPermission: () => Promise<PermissionResponse>;
  onClose: () => void;
};

export function FormCoachCameraScreen({ exercise, weightUnit, elapsedSeconds, permission, onRequestPermission, onClose }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [cameraError, setCameraError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (countdown === null || countdown === 0) return;
    const timer = setTimeout(() => setCountdown(value => value === null ? null : value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);
  const handleCameraError = useCallback((event: CameraMountError) => setCameraError(event.message || 'The camera could not start.'), []);
  const handleRequestPermission = useCallback(async () => {
    try {
      const result = await onRequestPermission();
      setCameraError(result.granted ? '' : 'Camera access is needed to open the live preview.');
    } catch {
      setCameraError('Camera permission could not be requested. Check your browser or device settings.');
    }
  }, [onRequestPermission]);

  const hasPermission = permission?.granted === true;
  const currentSetIndex = exercise.sets.findIndex(set => !set.done);
  const displaySetIndex = currentSetIndex >= 0 ? currentSetIndex : exercise.sets.length - 1;
  const currentSet = displaySetIndex >= 0 ? exercise.sets[displaySetIndex] : undefined;
  const rawWeight = Number(currentSet?.weight);
  const shownWeight = Number.isFinite(rawWeight) ? weightUnit === 'lb' ? rawWeight * 2.2046226218 : rawWeight : null;
  const loadLabel = shownWeight === null ? '—' : shownWeight > 0 ? `${Number(shownWeight.toFixed(1))} ${weightUnit}` : 'Body weight';
  const repsLabel = currentSet?.reps || '—';
  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const targetLabel = exercise.target?.trim() || exercise.equipment?.trim() || 'Exercise form';
  const metrics = [
    { label: 'TARGET REPS', value: repsLabel, detail: 'planned' },
    { label: 'SESSION TIME', value: elapsedLabel, detail: 'elapsed' },
    { label: 'WORKING SET', value: `${Math.max(1, displaySetIndex + 1)}/${exercise.sets.length || 1}`, detail: 'planned' },
    { label: 'LOAD', value: loadLabel, detail: 'planned' },
  ];

  return (
    <SafeAreaView style={styles.screen}>
      {hasPermission ? (
        <View style={styles.cameraStage}>
          <CameraView style={StyleSheet.absoluteFill} facing={facing} onMountError={handleCameraError} />
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to active session" onPress={onClose} style={styles.iconButton}><Text style={styles.backGlyph}>‹</Text></Pressable>
            <View style={styles.heading}><Text style={styles.kicker}>FORM COACH · LIVE PREVIEW</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={styles.exerciseName}>{exercise.name}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Switch to ${facing === 'back' ? 'front' : 'back'} camera`} onPress={() => setFacing(current => current === 'back' ? 'front' : 'back')} style={styles.iconButton}><Text style={styles.flipGlyph}>↻</Text></Pressable>
          </View>
          <View style={styles.metricRow} pointerEvents="none">
            {metrics.map((metric, index) => <View key={metric.label} style={[styles.metricCard, index === 3 && styles.accentCard]}><Text style={styles.metricLabel}>{metric.label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricValue, index === 3 && styles.accentValue]}>{metric.value}</Text><Text style={styles.metricDetail}>{metric.detail}</Text></View>)}
          </View>
          {countdown !== null && <View pointerEvents="none" style={styles.countdownOverlay}><View style={styles.countdownBadge}>{countdown > 0 ? <Text style={[styles.countdownNumber, { fontSize: Math.max(96, (windowHeight - 312) * 0.72), lineHeight: Math.max(112, (windowHeight - 312) * 0.82) }]}>{countdown}</Text> : <Text style={styles.countdownDone}>POSE TRACKING{ '\n' }NOT CONNECTED</Text>}</View></View>}
          <View style={styles.bottomPanel}>
            <Pressable accessibilityRole="button" accessibilityLabel="Begin live analysis countdown" disabled={countdown !== null} onPress={() => setCountdown(5)} style={[styles.beginButton, countdown !== null && styles.beginButtonDisabled]}><Text style={styles.beginButtonText}>{countdown === null ? 'Begin' : countdown > 0 ? `Starting in ${countdown}…` : 'Pose tracking not connected'}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.returnButton}><Text style={styles.returnButtonText}>Back to workout</Text></Pressable>
          </View>
          {!!cameraError && <View style={styles.cameraError}><Text style={styles.cameraErrorText}>{cameraError}</Text></View>}
        </View>
      ) : (
        <View style={styles.permissionScreen}>
          <View style={styles.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Back to active session" onPress={onClose} style={styles.iconButton}><Text style={styles.backGlyph}>‹</Text></Pressable><View style={styles.heading}><Text style={styles.kicker}>FORM COACH</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={styles.exerciseName}>{exercise.name}</Text></View><View style={styles.iconButton}/></View>
          <View style={styles.permissionPanel}><View style={styles.cameraIcon}><Text style={styles.cameraIconGlyph}>◎</Text></View><Text style={styles.permissionTitle}>Camera access</Text><Text style={styles.permissionCopy}>Allow camera access to open a live preview for {exercise.name}. Video is not recorded or saved.</Text>{!!cameraError && <Text style={styles.permissionError}>{cameraError}</Text>}{permission?.granted === false && permission.canAskAgain === false ? <Text style={styles.permissionHint}>Camera access is turned off for this app or site. Enable it in your device or browser settings, then reopen Form Coach.</Text> : <Pressable accessibilityRole="button" onPress={() => void handleRequestPermission()} style={styles.allowButton}><Text style={styles.allowButtonText}>Allow camera</Text></Pressable>}</View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080b10' }, cameraStage: { flex: 1, overflow: 'hidden', backgroundColor: '#111821' },
  topBar: { minHeight: 88, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(8,11,16,0.66)' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, backGlyph: { color: '#fff', fontSize: 38, lineHeight: 42 }, flipGlyph: { color: '#fff', fontSize: 27 },
  heading: { flex: 1, minWidth: 0, alignItems: 'center' }, kicker: { color: '#c3cbd5', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }, exerciseName: { color: '#fff', fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'Impact', fontSize: 40, lineHeight: 44, fontWeight: '900', letterSpacing: -0.4, textTransform: 'uppercase', marginTop: 2 },
  metricRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingTop: 10 }, metricCard: { flex: 1, minWidth: 0, minHeight: 72, paddingHorizontal: 8, paddingVertical: 9, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(18,23,30,0.8)' },
  accentCard: { borderColor: 'rgba(212,246,76,0.6)', backgroundColor: 'rgba(65,75,35,0.72)' }, metricLabel: { color: '#c3cbd5', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 }, metricValue: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 5 }, accentValue: { color: '#d4f64c' }, metricDetail: { color: '#b4bdc8', fontSize: 9, marginTop: 1 },
  countdownOverlay: { position: 'absolute', top: 180, bottom: 132, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }, countdownBadge: { alignItems: 'center', justifyContent: 'center', minWidth: '100%', minHeight: '100%' }, countdownNumber: { color: '#fff', fontWeight: '900', textAlign: 'center', includeFontPadding: false, textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 5 }, textShadowRadius: 16 }, countdownDone: { color: '#d4f64c', textAlign: 'center', fontSize: 13, lineHeight: 19, fontWeight: '900', letterSpacing: 0.7 },
  bottomPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 17, paddingTop: 16, paddingBottom: 16, backgroundColor: 'transparent', gap: 12 },
  cameraError: { position: 'absolute', top: 150, left: 16, right: 16, padding: 12, borderRadius: 14, backgroundColor: 'rgba(12,17,23,0.92)' }, cameraErrorText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  permissionScreen: { flex: 1 }, permissionPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }, cameraIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#202a36', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }, cameraIconGlyph: { color: '#84b8ff', fontSize: 42 }, permissionTitle: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' }, permissionCopy: { maxWidth: 360, color: '#b8c2ce', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 }, permissionError: { color: '#ffb3ae', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 12 }, permissionHint: { maxWidth: 360, color: '#ffcf8a', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 18 }, allowButton: { minHeight: 50, paddingHorizontal: 24, borderRadius: 16, backgroundColor: '#3478f6', alignItems: 'center', justifyContent: 'center', marginTop: 22 }, allowButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  beginButton: { minHeight: 46, width: '100%', borderRadius: 15, backgroundColor: '#d4f64c', alignItems: 'center', justifyContent: 'center' }, beginButtonDisabled: { opacity: 0.62 }, beginButtonText: { color: '#12170b', fontSize: 15, fontWeight: '900' },
  returnButton: { minHeight: 46, width: '100%', borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' }, returnButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
