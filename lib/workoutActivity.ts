import { Platform } from 'react-native';

type WorkoutTimerNative = {
  start: (title: string, startedAtMillis: number) => void;
  pause: (title: string, elapsedSeconds: number) => void;
  stop: () => void;
};
type ActivityState = { title: string; startedAt: number; pausedAt: number | null; elapsed: number };
let activityFactory: any;
let activityInstance: any;

function getActivityFactory() {
  if (!activityFactory) {
    // Expo Go and development binaries built before expo-widgets was added do
    // not contain this native module. Check before importing the package,
    // whose iOS entry point requires ExpoWidgets immediately.
    const { requireOptionalNativeModule } = require('expo-modules-core');
    if (!requireOptionalNativeModule('ExpoWidgets')) return null;
    const { createLiveActivity } = require('expo-widgets');
    const { Text } = require('@expo/ui/swift-ui');
    const React = require('react');
    const label = (title: string, _size = 15) => React.createElement(Text, null, title);
    const timer = (props: ActivityState) => {
      const lower = new Date(props.pausedAt ? props.startedAt : Date.now() - props.elapsed * 1000);
      const upper = new Date(lower.getTime() + 86400000);
      return React.createElement(Text, {
        timerInterval: { lower, upper }, countsDown: false,
        pauseTime: props.pausedAt ? new Date(props.pausedAt) : undefined,
      });
    };
    activityFactory = createLiveActivity('WorkoutActivity', (props: ActivityState) => ({
      banner: React.createElement(require('@expo/ui/swift-ui').VStack, { spacing: 8 }, label('WORKOUT IN PROGRESS', 11), label(props.title), timer(props)),
      compactLeading: label('●', 12),
      compactTrailing: timer(props),
      minimal: label('●', 12),
      expandedLeading: label(props.title),
      expandedTrailing: timer(props),
      expandedBottom: label(props.pausedAt ? 'Paused' : 'Repday · Training'),
    }));
  }
  return activityFactory;
}

export function requestWorkoutNotificationPermission() {
  try {
    const Notifications = require('expo-notifications');
    return Notifications.requestPermissionsAsync();
  } catch {
    return Promise.resolve(null);
  }
}

export function updateWorkoutSurface(state: ActivityState) {
  if (Platform.OS === 'android') {
    try {
      const { requireNativeModule } = require('expo-modules-core');
      const native = requireNativeModule('WorkoutTimer') as WorkoutTimerNative;
      if (state.pausedAt) native.pause(state.title, state.elapsed);
      else native.start(state.title, Date.now() - state.elapsed * 1000);
    } catch {}
  }
  if (Platform.OS === 'ios') {
    try {
      const factory = getActivityFactory();
      if (!factory) return;
      const props = { ...state, startedAt: Date.now() - state.elapsed * 1000, pausedAt: state.pausedAt ? Date.now() : null };
      const existing = factory.getInstances();
      if (existing.length) {
        activityInstance = existing[0];
        activityInstance.update(props);
      } else {
        activityInstance = factory.start(props, 'repday://workout');
      }
    } catch {}
  }
}

export function stopWorkoutSurface() {
  if (Platform.OS === 'android') {
    try {
      const { requireNativeModule } = require('expo-modules-core');
      (requireNativeModule('WorkoutTimer') as WorkoutTimerNative).stop();
    } catch {}
  }
  if (Platform.OS === 'ios') {
    try {
      const factory = getActivityFactory();
      if (!factory) return;
      const instances = factory.getInstances();
      instances.forEach((item: any) => item.end('immediate'));
      activityInstance = null;
    } catch {}
  }
}
