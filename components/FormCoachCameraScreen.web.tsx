import React, { createElement, useCallback, useEffect, useRef, useState } from 'react';
import type { PermissionResponse } from 'expo';
import { Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Move, WeightUnit } from '../backend/contracts';

type Props = {
  exercise: Move;
  weightUnit: WeightUnit;
  elapsedSeconds: number;
  restSeconds?: number;
  permission: PermissionResponse | null;
  onRequestPermission: () => Promise<PermissionResponse>;
  onClose: () => void;
  onTargetReached?: () => boolean;
};
type Point = { x: number; y: number; visibility?: number; presence?: number };
type PoseResult = { landmarks: Point[][] };
type PoseLandmarkerInstance = { detectForVideo: (video: HTMLVideoElement, timestamp: number) => PoseResult; close: () => void };
type VisionApi = { FilesetResolver: { forVisionTasks: (wasmPath: string) => Promise<unknown> }; PoseLandmarker: { createFromOptions: (vision: unknown, options: Record<string, unknown>) => Promise<PoseLandmarkerInstance> } };
declare global { interface Window { Vision?: VisionApi } }
let visionLoadPromise: Promise<VisionApi> | null = null;
function loadVisionApi(): Promise<VisionApi> {
  if (window.Vision) return Promise.resolve(window.Vision);
  if (!visionLoadPromise) visionLoadPromise = new Promise<VisionApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.js`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => { const api = window.Vision; if (api) resolve(api); else reject(new Error('MediaPipe loaded without its browser API.')); };
    script.onerror = () => { script.remove(); reject(new Error('MediaPipe could not be downloaded. Check your internet connection and try again.')); };
    document.head.appendChild(script);
  }).catch(error => { visionLoadPromise = null; throw error; });
  return visionLoadPromise!;
}
function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}
type MovementKind = 'elbow' | 'knee' | 'latPulldown' | 'row' | 'unsupported';
const MEDIAPIPE_VERSION = '1.1.0';
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const POSE_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],
  [11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],
  [11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32],
];

function movementKind(move: Move): MovementKind {
  const name = `${move.name} ${move.target ?? ''}`.toLowerCase();
  if (/\b(lat\s*)?pulldowns?\b|\bpull[\s-]*downs?\b/.test(name)) return 'latPulldown';
  if (/\b(row|rows|rowing)\b/.test(name)) return 'row';
  if (/\b(squat|lunge|leg press|step.?up)\b/.test(name)) return 'knee';
  if (/\b(curl|bench press|chest press|shoulder press|push.?up|dip|triceps|biceps|pectorals)\b/.test(name)) return 'elbow';
  return 'unsupported';
}
function angleAt(a: Point, b: Point, c: Point) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  const degrees = Math.abs((radians * 180) / Math.PI);
  return Math.round(degrees > 180 ? 360 - degrees : degrees);
}
function confidence(point: Point | undefined) { return point?.visibility ?? point?.presence ?? 0; }
function bestJointAngle(points: Point[], kind: 'elbow' | 'knee') {
  const candidates = kind === 'elbow'
    ? [[11, 13, 15], [12, 14, 16]]
    : [[23, 25, 27], [24, 26, 28]];
  const visible = candidates.map(([a,b,c]) => ({ a: points[a], b: points[b], c: points[c] }))
    .filter(({a,b,c}) => a && b && c && Math.min(confidence(a), confidence(b), confidence(c)) >= 0.48)
    .sort((left, right) => Math.min(confidence(right.a), confidence(right.b), confidence(right.c)) - Math.min(confidence(left.a), confidence(left.b), confidence(left.c)))[0];
  return visible ? angleAt(visible.a, visible.b, visible.c) : null;
}
function distance2d(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
function movementZone(points: Point[], kind: MovementKind, angle: number, bendThreshold: number): 'top' | 'bottom' | null {
  if (kind !== 'latPulldown' && kind !== 'row') return angle >= 155 ? 'top' : angle <= bendThreshold ? 'bottom' : null;
  const sides = [[11, 13, 15, 23], [12, 14, 16, 24]];
  const arm = sides.map(([shoulder, elbow, wrist, hip]) => ({ shoulder: points[shoulder], elbow: points[elbow], wrist: points[wrist], hip: points[hip] }))
    .filter((candidate): candidate is { shoulder: Point; elbow: Point; wrist: Point; hip: Point } => {
      const { shoulder, elbow, wrist, hip } = candidate;
      return !!shoulder && !!elbow && !!wrist && !!hip && Math.min(confidence(shoulder), confidence(elbow), confidence(wrist), confidence(hip)) >= 0.48;
    })
    .sort((a, b) => Math.min(confidence(b.shoulder), confidence(b.elbow), confidence(b.wrist), confidence(b.hip)) - Math.min(confidence(a.shoulder), confidence(a.elbow), confidence(a.wrist), confidence(a.hip)))[0];
  if (!arm) return null;
  const torsoLength = distance2d(arm.shoulder, arm.hip);
  if (torsoLength < 0.05) return null;
  if (kind === 'latPulldown') {
    const armsOverhead = arm.wrist.y < arm.shoulder.y - torsoLength * 0.06 && arm.elbow.y < arm.shoulder.y + torsoLength * 0.12;
    const pulledDown = angle <= 130 && arm.elbow.y > arm.shoulder.y + torsoLength * 0.04 && arm.wrist.y > arm.shoulder.y - torsoLength * 0.12;
    return armsOverhead ? 'top' : pulledDown ? 'bottom' : null;
  }
  const wristReach = distance2d(arm.shoulder, arm.wrist) / torsoLength;
  if (angle >= 145 && wristReach >= 0.95) return 'top';
  if (angle <= 115 && wristReach <= 1.05) return 'bottom';
  return null;
}

function playTargetTone(contextRef: React.MutableRefObject<AudioContext | null>) {
  try {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const audio = contextRef.current ?? new AudioContextConstructor();
    contextRef.current = audio;
    if (audio.state === 'suspended') void audio.resume();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audio.currentTime);
    oscillator.frequency.setValueAtTime(1174.66, audio.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.3);
  } catch { /* Browser audio may be unavailable or blocked. */ }
  try { navigator.vibrate?.([110, 70, 110]); } catch { /* Haptics may be unavailable. */ }
}

export function FormCoachCameraScreen({ exercise, weightUnit, elapsedSeconds, restSeconds = 0, permission, onRequestPermission, onClose, onTargetReached }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const isResting = restSeconds > 0;
  const [bottomPanelHeight, setBottomPanelHeight] = useState(170);
  const repPulseOpacity = useRef(new Animated.Value(0)).current;
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'tracking' | 'error'>('idle');
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [poseVisible, setPoseVisible] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [jointAngle, setJointAngle] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('Position yourself in the camera view');
  const [targetReached, setTargetReached] = useState(false);
  const [attemptOutcome, setAttemptOutcome] = useState<'good' | 'short' | null>(null);
  const [coachStats, setCoachStats] = useState({ counted: 0, short: 0, fast: 0, slow: 0 });
  const [summaryVisible, setSummaryVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const requestedRef = useRef(false);
  const endingRef = useRef(false);
  const repCountRef = useRef(0);
  const repPhaseRef = useRef<'top' | 'moving' | 'bottom' | 'unknown'>('unknown');
  const smoothedAngleRef = useRef<number | null>(null);
  const stableZoneRef = useRef<'top' | 'bottom' | null>(null);
  const stableZoneFramesRef = useRef(0);
  const targetReachedRef = useRef(false);
  const lastRepTopAtRef = useRef<number | null>(null);
  const wasRestingRef = useRef(isResting);
  const restActiveRef = useRef(isResting);
  const userPausedRef = useRef(false);
  const onTargetReachedRef = useRef(onTargetReached);
  const exerciseRef = useRef(exercise);
  onTargetReachedRef.current = onTargetReached;
  exerciseRef.current = exercise;
  const audioContextRef = useRef<AudioContext | null>(null);
  const attemptOutcomeRef = useRef<'good' | 'short' | null>(attemptOutcome);
  const attemptFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  attemptOutcomeRef.current = attemptOutcome;
  restActiveRef.current = isResting;
  const lastFrameTimeRef = useRef(-1);
  const lastUiUpdateRef = useRef(0);
  const kind = movementKind(exercise);
  const allSetsComplete = exercise.sets.length > 0 && exercise.sets.every(set => set.done);
  userPausedRef.current = userPaused;

  const announceAttempt = useCallback((outcome: 'good' | 'short') => {
    setAttemptOutcome(outcome);
    repPulseOpacity.stopAnimation();
    repPulseOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(repPulseOpacity, { toValue: 0.24, duration: 110, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(repPulseOpacity, { toValue: 0, duration: 460, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    if (attemptFeedbackTimerRef.current) clearTimeout(attemptFeedbackTimerRef.current);
    attemptFeedbackTimerRef.current = setTimeout(() => setAttemptOutcome(null), 1500);
  }, [repPulseOpacity]);

  const stopTracking = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const finishCoach = useCallback(() => {
    endingRef.current = true;
    stopTracking();
    setSummaryVisible(true);
  }, [stopTracking]);

  const startTracking = useCallback(() => {
    if (restActiveRef.current || userPausedRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker) {
      if (requestedRef.current) {
        setAnalysisState('error');
        setCameraError('Pose analysis could not connect to the camera or model. Choose a setup timer to retry.');
      }
      return;
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      const waitStartedAt = performance.now();
      const waitForVideoFrame = () => {
        const currentVideo = videoRef.current;
        if (endingRef.current || !requestedRef.current || restActiveRef.current || userPausedRef.current) {
          rafRef.current = null;
          return;
        }
        if (currentVideo?.readyState && currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          rafRef.current = null;
          startTracking();
          return;
        }
        if (performance.now() - waitStartedAt > 10000) {
          rafRef.current = null;
          setAnalysisState('error');
          setCameraError('The camera opened but did not provide a video frame. Keep this page open and check browser camera access.');
          return;
        }
        rafRef.current = requestAnimationFrame(waitForVideoFrame);
      };
      rafRef.current = requestAnimationFrame(waitForVideoFrame);
      return;
    }
    stopTracking();
    setAnalysisState('tracking');
    lastFrameTimeRef.current = -1;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      setAnalysisState('error');
      setCameraError('This browser could not start the pose overlay. Try a recent version of Chrome or Safari.');
      return;
    }
    const tick = () => {
      if (endingRef.current) return;
      const currentVideo = videoRef.current;
      const currentCanvas = canvasRef.current;
      const currentLandmarker = landmarkerRef.current;
      if (!currentVideo || !currentCanvas || !currentLandmarker) return;
      const now = performance.now();
      if (currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && currentVideo.currentTime !== lastFrameTimeRef.current && now - lastUiUpdateRef.current >= 70) {
        lastFrameTimeRef.current = currentVideo.currentTime;
        lastUiUpdateRef.current = now;
        try {
          const result = currentLandmarker.detectForVideo(currentVideo, now) as PoseResult;
          const points = result.landmarks?.[0];
          const width = currentCanvas.clientWidth;
          const height = currentCanvas.clientHeight;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          if (width > 0 && height > 0 && (currentCanvas.width !== Math.round(width * dpr) || currentCanvas.height !== Math.round(height * dpr))) {
            currentCanvas.width = Math.round(width * dpr);
            currentCanvas.height = Math.round(height * dpr);
          }
          context.setTransform(dpr, 0, 0, dpr, 0, 0);
          context.clearRect(0, 0, width, height);
          if (points?.length) {
            setPoseVisible(true);
            const sourceWidth = currentVideo.videoWidth || width;
            const sourceHeight = currentVideo.videoHeight || height;
            const scale = Math.max(width / sourceWidth, height / sourceHeight);
            const drawWidth = sourceWidth * scale;
            const drawHeight = sourceHeight * scale;
            const offsetX = (width - drawWidth) / 2;
            const offsetY = (height - drawHeight) / 2;
            const mapX = (x: number) => facing === 'user' ? width - (offsetX + x * drawWidth) : offsetX + x * drawWidth;
            const mapY = (y: number) => offsetY + y * drawHeight;
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.lineWidth = Math.max(2, width * 0.006);
            for (const [from, to] of POSE_CONNECTIONS) {
              const a = points[from]; const b = points[to];
              if (!a || !b || confidence(a) < 0.35 || confidence(b) < 0.35) continue;
              const activeJointSegment = kind !== 'unsupported' && kind !== 'knee' ? (from === 11 && to === 13) || (from === 13 && to === 15) || (from === 12 && to === 14) || (from === 14 && to === 16) : kind === 'knee' ? (from === 23 && to === 25) || (from === 25 && to === 27) || (from === 24 && to === 26) || (from === 26 && to === 28) : false;
              context.strokeStyle = activeJointSegment && attemptOutcomeRef.current === 'short' ? '#ffbd4a' : activeJointSegment && attemptOutcomeRef.current === 'good' ? '#d4f64c' : '#40e8f2';
              context.beginPath(); context.moveTo(mapX(a.x), mapY(a.y)); context.lineTo(mapX(b.x), mapY(b.y)); context.stroke();
            }
            for (let index = 0; index < points.length; index++) {
              const point = points[index];
              if (confidence(point) < 0.38) continue;
              context.beginPath(); context.fillStyle = index === 13 || index === 14 || index === 25 || index === 26 ? attemptOutcomeRef.current === 'short' ? '#ffbd4a' : '#d4f64c' : '#fff';
              context.arc(mapX(point.x), mapY(point.y), Math.max(3, width * 0.009), 0, Math.PI * 2); context.fill();
            }
            if (kind !== 'unsupported') {
              const angle = bestJointAngle(points, kind === 'knee' ? 'knee' : 'elbow');
              setJointAngle(angle);
              if (angle === null) setFeedback(kind === 'knee' ? 'Keep a hip, knee and ankle visible' : 'Keep a shoulder, elbow and wrist visible');
              else {
                const filteredAngle = smoothedAngleRef.current === null ? angle : smoothedAngleRef.current * 0.65 + angle * 0.35;
                smoothedAngleRef.current = filteredAngle;
                const bendThreshold = kind === 'elbow' && /curl/i.test(exercise.name) ? 76 : kind === 'elbow' ? 94 : kind === 'knee' ? 102 : kind === 'latPulldown' ? 130 : 115;
                const zone = movementZone(points, kind, filteredAngle, bendThreshold);
                if (zone !== stableZoneRef.current) {
                  stableZoneRef.current = zone;
                  stableZoneFramesRef.current = zone ? 1 : 0;
                } else if (zone) stableZoneFramesRef.current += 1;
                if (stableZoneFramesRef.current >= 3 && zone === 'top') {
                  if (repPhaseRef.current === 'bottom' && !targetReachedRef.current) {
                    repCountRef.current += 1;
                    setRepCount(repCountRef.current);
                    setCoachStats(stats => ({ ...stats, counted: stats.counted + 1 }));
                    announceAttempt('good');
                    const repDuration = lastRepTopAtRef.current === null ? null : (now - lastRepTopAtRef.current) / 1000;
                    lastRepTopAtRef.current = now;
                    if (repDuration !== null && repDuration < 1.2) setCoachStats(stats => ({ ...stats, fast: stats.fast + 1 }));
                    else if (repDuration !== null && repDuration > 6) setCoachStats(stats => ({ ...stats, slow: stats.slow + 1 }));
                    const target = Number.parseInt(String(exerciseRef.current.sets.find(set => !set.done)?.reps ?? ''), 10);
                    if (Number.isFinite(target) && target > 0 && repCountRef.current >= target) {
                      targetReachedRef.current = true;
                      setTargetReached(true);
                      setFeedback('Target reached · set complete');
                      playTargetTone(audioContextRef);
                      const hasNextSet = onTargetReachedRef.current?.() ?? false;
                      if (hasNextSet) {
                        targetReachedRef.current = false;
                        repCountRef.current = 0;
                        setRepCount(0);
                        setTargetReached(false);
                        repPhaseRef.current = 'top';
                        setFeedback('Set complete · next set ready');
                      } else setFeedback('All sets complete · end coach when you’re ready');
                    } else if (repDuration !== null && repDuration < 1.2) setFeedback('Too fast · slow down and control the rep');
                    else if (repDuration !== null && repDuration > 6) setFeedback('Too slow · move through the rep a little more smoothly');
                    else setFeedback('Good pace · rep counted');
                  } else if (repPhaseRef.current === 'moving' && !targetReachedRef.current) {
                    setCoachStats(stats => ({ ...stats, short: stats.short + 1 }));
                    announceAttempt('short');
                    setFeedback(kind === 'latPulldown' ? 'Incomplete pull · bring your elbows farther down' : kind === 'row' ? 'Incomplete row · pull your elbows farther back' : kind === 'elbow' ? 'Short range · bend your elbow further next rep' : 'Short range · bend your knee further next rep');
                  } else if (repPhaseRef.current !== 'top') setFeedback('Good start position · lower with control');
                  repPhaseRef.current = 'top';
                } else if (stableZoneFramesRef.current >= 3 && zone === 'bottom' && (repPhaseRef.current === 'top' || repPhaseRef.current === 'moving')) {
                  repPhaseRef.current = 'bottom';
                  setFeedback(kind === 'latPulldown' ? 'Full pull reached · return your arms overhead' : kind === 'row' ? 'Row reached · extend your arms forward again' : 'Full range reached · return to the start');
                } else if (repPhaseRef.current === 'top' && filteredAngle <= 140) {
                  repPhaseRef.current = 'moving';
                  setFeedback('Lower through a full, controlled range');
                } else if (repPhaseRef.current === 'unknown') {
                  setFeedback('Stand at the start position, then complete the full movement');
                }
              }
            } else {
              setJointAngle(null);
              setFeedback('Pose detected · rep guidance is not configured for this exercise yet');
            }
          } else {
            setPoseVisible(false);
            setJointAngle(null);
            setFeedback('Move into view and keep your body visible');
            repPhaseRef.current = 'unknown';
            smoothedAngleRef.current = null;
            stableZoneRef.current = null;
            stableZoneFramesRef.current = 0;
          }
        } catch (error) {
          console.warn('Pose frame could not be analyzed', error);
          requestedRef.current = false;
          stopTracking();
          setCountdown(null);
          setAnalysisState('error');
          setCameraError(error instanceof Error ? `Pose analysis stopped: ${error.message}` : 'Pose analysis stopped unexpectedly. Choose a setup timer to retry.');
          return;
        }
      }
      rafRef.current = endingRef.current ? null : requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [announceAttempt, exercise.name, facing, kind, stopTracking]);

  const loadAndStart = useCallback(async () => {
    if (landmarkerRef.current) {
      if (countdownRef.current === null && requestedRef.current) startTracking();
      return;
    }
    if (analysisState === 'loading') return;
    setAnalysisState('loading');
    try {
      const visionApi = await loadVisionApi();
      const vision = await visionApi.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`);
      const options = {
        runningMode: 'VIDEO' as const,
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: (isMobileBrowser() ? 'CPU' : 'GPU') as 'CPU' | 'GPU' },
      };
      let landmarker: PoseLandmarkerInstance;
      try {
        landmarker = await visionApi.PoseLandmarker.createFromOptions(vision, options);
      } catch {
        const alternateDelegate = isMobileBrowser() ? 'GPU' : 'CPU';
        landmarker = await visionApi.PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: alternateDelegate } });
      }
      landmarkerRef.current = landmarker;
      if (requestedRef.current && countdownRef.current === null) startTracking();
      else if (requestedRef.current) setAnalysisState('idle');
    } catch (error) {
      if (!requestedRef.current) return;
      requestedRef.current = false;
      countdownRef.current = null;
      setCountdown(null);
      setAnalysisState('error');
      setCameraError(error instanceof Error ? `Pose tracking could not load: ${error.message}` : 'Pose tracking could not load. Check your internet connection and try again.');
    }
  }, [analysisState, startTracking]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      countdownRef.current = null;
      setCountdown(null);
      if (landmarkerRef.current) startTracking();
      else setFeedback('Loading the pose model…');
      return;
    }
    const timer = setTimeout(() => {
      const next = countdown - 1;
      countdownRef.current = next;
      setCountdown(next);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, startTracking]);

  useEffect(() => {
    if (!permission?.granted) return;
    let active = true;
    setCameraReady(false);
    setCameraError('');
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not provide camera access. Open Repday over HTTPS and allow camera access.');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
        if (!active) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error('Camera preview could not be attached.');
        video.srcObject = stream;
        await video.play();
        if (active) setCameraReady(true);
      } catch (error) {
        if (active) setCameraError(error instanceof Error ? error.message : 'Camera could not be started. Check browser permissions.');
      }
    };
    void startCamera();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraReady(false);
    };
  }, [facing, permission?.granted]);

  useEffect(() => () => {
    requestedRef.current = false;
    stopTracking();
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (attemptFeedbackTimerRef.current) clearTimeout(attemptFeedbackTimerRef.current);
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }, [stopTracking]);

  const handleRequestPermission = useCallback(async () => {
    try {
      const result = await onRequestPermission();
      if (!result.granted) setCameraError('Camera access is needed for live pose tracking.');
    } catch {
      setCameraError('Camera permission could not be requested. Check your browser settings.');
    }
  }, [onRequestPermission]);

  const begin = useCallback((seconds: number) => {
    if (!cameraReady || restActiveRef.current) return;
    setCameraError('');
    requestedRef.current = true;
    endingRef.current = false;
    repCountRef.current = 0;
    repPhaseRef.current = 'unknown';
    smoothedAngleRef.current = null;
    stableZoneRef.current = null;
    stableZoneFramesRef.current = 0;
    targetReachedRef.current = false;
    setTargetReached(false);
    setAttemptOutcome(null);
    if (attemptFeedbackTimerRef.current) clearTimeout(attemptFeedbackTimerRef.current);
    setRepCount(0);
    setJointAngle(null);
    setPoseVisible(false);
    setUserPaused(false);
    setCountdown(seconds);
    countdownRef.current = seconds;
    setAnalysisState('loading');
    void loadAndStart();
  }, [cameraReady, loadAndStart]);

  const togglePause = useCallback(() => {
    if (userPausedRef.current) {
      userPausedRef.current = false;
      setUserPaused(false);
      repPhaseRef.current = 'unknown';
      smoothedAngleRef.current = null;
      stableZoneRef.current = null;
      stableZoneFramesRef.current = 0;
      setFeedback('Resumed · start from the top position');
      startTracking();
      return;
    }
    userPausedRef.current = true;
    setUserPaused(true);
    stopTracking();
    setFeedback('Analysis paused');
    setPoseVisible(false);
  }, [startTracking, stopTracking]);

  const stopAnalysis = useCallback(() => {
    requestedRef.current = false;
    countdownRef.current = null;
    setCountdown(null);
    stopTracking();
    userPausedRef.current = false;
    setUserPaused(false);
    setAnalysisState('idle');
    setPoseVisible(false);
    setFeedback('Analysis stopped');
    const context = canvasRef.current?.getContext('2d');
    if (context && canvasRef.current) context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }, [stopTracking]);

  useEffect(() => {
    if (isResting) {
      wasRestingRef.current = true;
      stopTracking();
      repPhaseRef.current = 'unknown';
      smoothedAngleRef.current = null;
      stableZoneRef.current = null;
      stableZoneFramesRef.current = 0;
      lastRepTopAtRef.current = null;
      setPoseVisible(false);
      setFeedback('Rest period · pose tracking paused');
      const context = canvasRef.current?.getContext('2d');
      if (context && canvasRef.current) context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }
    if (!wasRestingRef.current) return;
    wasRestingRef.current = false;
    if (!userPausedRef.current && !allSetsComplete && analysisState === 'tracking' && landmarkerRef.current) {
      repPhaseRef.current = 'unknown';
      smoothedAngleRef.current = null;
      stableZoneRef.current = null;
      stableZoneFramesRef.current = 0;
      lastRepTopAtRef.current = null;
      setFeedback('Rest complete · start from the top position');
      startTracking();
    }
  }, [isResting, analysisState, allSetsComplete, startTracking, stopTracking]);

  const currentSetIndex = exercise.sets.findIndex(set => !set.done);
  const displaySetIndex = currentSetIndex >= 0 ? currentSetIndex : Math.max(0, exercise.sets.length - 1);
  const currentSet = exercise.sets[displaySetIndex];
  const rawWeight = Number(currentSet?.weight);
  const shownWeight = Number.isFinite(rawWeight) ? weightUnit === 'lb' ? rawWeight * 2.2046226218 : rawWeight : null;
  const loadLabel = shownWeight === null ? '—' : shownWeight > 0 ? `${Number(shownWeight.toFixed(1))} ${weightUnit}` : 'Body weight';
  const repsTarget = currentSet?.reps || '—';
  useEffect(() => {
    targetReachedRef.current = false;
    setTargetReached(false);
    repCountRef.current = 0;
    setRepCount(0);
    repPhaseRef.current = 'unknown';
    smoothedAngleRef.current = null;
    stableZoneRef.current = null;
    stableZoneFramesRef.current = 0;
  }, [displaySetIndex, repsTarget]);
  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const statusText = isResting ? 'REST TIMER' : userPaused ? 'PAUSED' : analysisState === 'tracking' ? poseVisible ? 'POSE DETECTED' : 'FINDING YOUR POSE…' : analysisState === 'loading' ? 'PREPARING POSE TRACKING' : 'CAMERA PREVIEW';
  const setupCue = kind === 'latPulldown' ? 'Face the phone; keep shoulders, elbows and hands visible overhead.' : kind === 'row' ? 'Set the phone at a slight side angle; keep hips, shoulders, elbows and wrists in frame.' : kind === 'knee' ? 'Set the phone side-on; keep hips, knees and ankles in frame.' : kind === 'elbow' ? 'Set the phone side-on; keep shoulder, elbow and wrist in frame.' : 'Set the phone so your body and the full movement stay in frame.';
  const videoElement = createElement('video', { ref: videoRef, autoPlay: true, playsInline: true, muted: true, 'aria-label': 'Live camera preview used for on-device pose tracking', style: { position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : undefined, backgroundColor: '#111821' } });
  const canvasElement = createElement('canvas', { ref: canvasRef, 'aria-hidden': true, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' } });

  return (
    <SafeAreaView style={styles.screen}>
      {permission?.granted ? (
        <View style={styles.cameraStage}>
          <View collapsable={false} style={StyleSheet.absoluteFill}>{videoElement}{canvasElement}</View>
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="End form coach" onPress={finishCoach} style={styles.iconButton}><Text style={styles.backGlyph}>‹</Text></Pressable>
            <View style={styles.heading}><Text style={styles.kicker}>FORM COACH · {statusText}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={styles.exerciseName}>{exercise.name}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Switch to ${facing === 'user' ? 'back' : 'front'} camera`} onPress={() => { stopTracking(); setAnalysisState('idle'); setCountdown(null); countdownRef.current = null; requestedRef.current = false; setCameraReady(false); setFacing(value => value === 'user' ? 'environment' : 'user'); }} style={styles.iconButton}><Text style={styles.flipGlyph}>↻</Text></Pressable>
          </View>
          <View style={styles.metricRow} pointerEvents="none">
            {[
              { label: 'REPS', value: String(repCount).padStart(2, '0'), detail: targetReached ? 'target reached' : `target ${repsTarget}` },
              { label: 'TIME', value: elapsedLabel, detail: 'session' },
              { label: 'SET', value: `${displaySetIndex + 1}/${exercise.sets.length || 1}`, detail: 'planned' },
              { label: kind === 'unsupported' ? 'LOAD' : 'ANGLE', value: kind === 'unsupported' ? loadLabel : jointAngle === null ? '—' : `${jointAngle}°`, detail: kind === 'unsupported' ? 'planned' : kind === 'knee' ? 'knee' : 'elbow' },
            ].map((metric, index) => <View key={metric.label} style={[styles.metricCard, index === 0 && styles.accentCard]}><Text style={styles.metricLabel}>{metric.label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricValue, index === 0 && styles.accentValue]}>{metric.value}</Text><Text style={styles.metricDetail}>{metric.detail}</Text></View>)}
          </View>
          {countdown !== null && countdown > 0 && <View pointerEvents="none" style={[styles.countdownOverlay, { bottom: bottomPanelHeight + 8 }]}><Text style={[styles.countdownNumber, { fontSize: Math.max(92, (windowHeight - 312) * 0.58), lineHeight: Math.max(108, (windowHeight - 312) * 0.66) }]}>{countdown}</Text></View>}
          {cameraReady && countdown === null && !isResting && !allSetsComplete && !summaryVisible && (analysisState === 'idle' || analysisState === 'error') && <View style={styles.countdownChoices}><Text style={styles.delayTitle}>{analysisState === 'error' ? 'TRY AGAIN' : 'SET UP'}</Text>{[5, 10, 15].map(seconds => <Pressable key={seconds} accessibilityRole="button" accessibilityLabel={`Start analysis after ${seconds} seconds`} onPress={() => { setCameraError(''); begin(seconds); }} style={styles.delayChoice}><Text style={styles.delayChoiceText}>{seconds}s</Text></Pressable>)}</View>}
          <Animated.View pointerEvents="none" style={[styles.repPulse, { opacity: repPulseOpacity, backgroundColor: attemptOutcome === 'short' ? 'rgba(255,72,64,0.72)' : 'rgba(67,255,115,0.72)' }]} />
          {isResting && <View pointerEvents="none" style={styles.restOverlay}>{restSeconds <= 5 ? <><Text style={styles.restEndingLabel}>REST ENDS IN</Text><Text style={styles.restEndingNumber}>{restSeconds}</Text></> : <View style={styles.restClock}><Text style={styles.restClockLabel}>RESTING</Text><Text style={styles.restClockValue}>{`${String(Math.floor(restSeconds / 60)).padStart(2, '0')}:${String(restSeconds % 60).padStart(2, '0')}`}</Text></View>}</View>}
          {analysisState === 'tracking' && attemptOutcome && <View pointerEvents="none" style={[styles.attemptResult, { bottom: bottomPanelHeight + 60 }, attemptOutcome === 'short' ? styles.attemptResultShort : styles.attemptResultGood]}><Text style={styles.attemptResultText}>{attemptOutcome === 'short' ? 'SHORT RANGE · NOT COUNTED' : 'GOOD RANGE · REP COUNTED'}</Text></View>}
          {analysisState === 'tracking' && <View pointerEvents="none" style={[styles.feedbackPill, { bottom: bottomPanelHeight + 8 }]}><View style={[styles.liveDot, poseVisible ? styles.liveGood : null]}/><Text numberOfLines={2} style={styles.feedbackText}>{kind === 'unsupported' && poseVisible ? 'Pose detected · rep counting is not set up for this movement yet' : feedback}</Text></View>}
          {analysisState === 'loading' && countdown === null && <View pointerEvents="none" style={styles.loadingPill}><Text style={styles.feedbackText}>Loading the pose model…</Text></View>}
          {analysisState === 'error' && !!cameraError && <View style={styles.cameraError}><Text style={styles.cameraErrorText}>{cameraError}</Text></View>}
          <View onLayout={({ nativeEvent }) => setBottomPanelHeight(Math.ceil(nativeEvent.layout.height))} style={styles.bottomPanel}>
            <Text style={styles.setupNote}>{setupCue}</Text>
          </View>
          {!summaryVisible && <View style={styles.coachControls}>
            <Pressable accessibilityRole="button" accessibilityLabel={controlsExpanded ? 'Hide coach controls' : 'Show coach controls'} accessibilityState={{ expanded: controlsExpanded }} onPress={() => setControlsExpanded(value => !value)} style={[styles.floatingControl, styles.menuToggle]}><Text style={styles.floatingControlGlyph}>{controlsExpanded ? '⌃' : '⋮'}</Text></Pressable>
            {controlsExpanded && <View style={styles.coachActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={userPaused ? 'Resume analysis' : 'Pause analysis'} onPress={() => { setControlsExpanded(false); togglePause(); }} style={styles.floatingControl}><Text style={styles.floatingControlGlyph}>{userPaused ? '▶' : 'Ⅱ'}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="End coach" onPress={() => { setControlsExpanded(false); finishCoach(); }} style={[styles.floatingControl, styles.endControl]}><Text style={styles.floatingControlGlyph}>×</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Stop analysis" onPress={() => { setControlsExpanded(false); stopAnalysis(); }} style={styles.floatingControl}><Text style={styles.floatingControlGlyph}>■</Text></Pressable>
            </View>}
          </View>}
          {summaryVisible && <View style={styles.summaryOverlay}><View style={styles.summaryCard}><Text style={styles.summaryKicker}>FORM COACH</Text><Text style={styles.summaryTitle}>Session summary</Text><Text style={styles.summaryExercise}>{exercise.name}</Text><View style={styles.summaryCount}><Text style={styles.summaryCountNumber}>{coachStats.counted}</Text><Text style={styles.summaryCountLabel}>reps counted with full range</Text></View>{coachStats.counted + coachStats.short === 0 ? <Text style={styles.summaryNote}>No complete reps were recorded during this session.</Text> : <View style={styles.summaryDetails}><Text style={styles.summaryGood}>✓  {coachStats.counted} full-range reps counted</Text>{coachStats.short > 0 && <Text style={styles.summaryCaution}>!  {coachStats.short} short-range {coachStats.short === 1 ? 'attempt' : 'attempts'} not counted</Text>}{coachStats.fast > 0 && <Text style={styles.summaryNote}>•  {coachStats.fast} reps moved too fast</Text>}{coachStats.slow > 0 && <Text style={styles.summaryNote}>•  {coachStats.slow} reps moved too slowly</Text>}</View>}<Pressable accessibilityRole="button" onPress={onClose} style={styles.summaryButton}><Text style={styles.summaryButtonText}>Back to workout</Text></Pressable></View></View>}
          {!!cameraError && analysisState !== 'error' && <View style={styles.cameraError}><Text style={styles.cameraErrorText}>{cameraError}</Text></View>}
        </View>
      ) : (
        <View style={styles.permissionScreen}>
          <View style={styles.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Back to active session" onPress={onClose} style={styles.iconButton}><Text style={styles.backGlyph}>‹</Text></Pressable><View style={styles.heading}><Text style={styles.kicker}>FORM COACH</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={styles.exerciseName}>{exercise.name}</Text></View><View style={styles.iconButton}/></View>
          <View style={styles.permissionPanel}><View style={styles.cameraIcon}><Text style={styles.cameraIconGlyph}>◎</Text></View><Text style={styles.permissionTitle}>Camera access</Text><Text style={styles.permissionCopy}>Allow camera access to analyze your pose for {exercise.name}. Video stays on your device and isn’t recorded or uploaded. MediaPipe sends performance and usage metrics to Google.</Text>{!!cameraError && <Text style={styles.permissionError}>{cameraError}</Text>}{permission?.granted === false && permission.canAskAgain === false ? <Text style={styles.permissionHint}>Camera access is turned off for this site. Enable it in your browser settings, then reopen Form Coach.</Text> : <Pressable accessibilityRole="button" onPress={() => void handleRequestPermission()} style={styles.allowButton}><Text style={styles.allowButtonText}>Allow camera</Text></Pressable>}</View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080b10' }, cameraStage: { flex: 1, overflow: 'hidden', backgroundColor: '#111821' },
  topBar: { minHeight: 88, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(8,11,16,0.66)' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, backGlyph: { color: '#fff', fontSize: 38, lineHeight: 42 }, flipGlyph: { color: '#fff', fontSize: 27 },
  heading: { flex: 1, minWidth: 0, alignItems: 'center' }, kicker: { color: '#c3cbd5', fontSize: 9, fontWeight: '800', letterSpacing: 1.1, textAlign: 'center' }, exerciseName: { color: '#fff', fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'Impact', fontSize: 40, lineHeight: 44, fontWeight: '900', letterSpacing: -0.4, textTransform: 'uppercase', marginTop: 2 },
  metricRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingTop: 10 }, metricCard: { flex: 1, minWidth: 0, minHeight: 72, paddingHorizontal: 8, paddingVertical: 9, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(18,23,30,0.8)' }, accentCard: { borderColor: 'rgba(212,246,76,0.6)', backgroundColor: 'rgba(65,75,35,0.72)' }, metricLabel: { color: '#c3cbd5', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 }, metricValue: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 5 }, accentValue: { color: '#d4f64c' }, metricDetail: { color: '#b4bdc8', fontSize: 9, marginTop: 1 },
  countdownOverlay: { position: 'absolute', top: 180, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }, countdownNumber: { color: '#fff', fontWeight: '900', textAlign: 'center', includeFontPadding: false, textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 5 }, textShadowRadius: 16 },
  countdownChoices: { position: 'absolute', top: 180, right: 28, zIndex: 4, alignItems: 'center', gap: 7 }, delayTitle: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textShadowColor: 'rgba(0,0,0,.9)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 }, delayChoice: { width: 58, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(8,11,16,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,.64)' }, delayChoiceText: { color: '#fff', fontSize: 19, fontWeight: '900' },
  repPulse: { ...StyleSheet.absoluteFillObject, zIndex: 2 }, restOverlay: { position: 'absolute', top: '42%', left: 0, right: 0, alignItems: 'center', zIndex: 3 }, restEndingLabel: { color: '#fff', fontSize: 15, lineHeight: 21, fontWeight: '900', letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }, restEndingNumber: { color: '#fff', fontSize: 96, lineHeight: 108, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 14 }, restClock: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: 'rgba(8,11,16,0.78)' }, restClockLabel: { color: '#d7dde4', fontSize: 13, fontWeight: '900', letterSpacing: 1 }, restClockValue: { color: '#fff', fontSize: 24, lineHeight: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  summaryOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10, backgroundColor: 'rgba(4,7,11,0.72)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 }, summaryCard: { width: '100%', maxWidth: 420, borderRadius: 24, padding: 24, backgroundColor: '#111821', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }, summaryKicker: { color: '#d4f64c', fontSize: 11, fontWeight: '900', letterSpacing: 1.6, textAlign: 'center' }, summaryTitle: { color: '#fff', fontSize: 25, fontWeight: '900', textAlign: 'center', marginTop: 7 }, summaryExercise: { color: '#c3cbd5', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 5 }, summaryCount: { alignItems: 'center', paddingVertical: 18, marginTop: 14, borderRadius: 18, backgroundColor: 'rgba(212,246,76,0.1)' }, summaryCountNumber: { color: '#d4f64c', fontSize: 46, lineHeight: 52, fontWeight: '900' }, summaryCountLabel: { color: '#e4e9ef', fontSize: 12, fontWeight: '700', marginTop: 2 }, summaryDetails: { gap: 10, marginTop: 18 }, summaryGood: { color: '#bfffbe', fontSize: 14, lineHeight: 20, fontWeight: '800' }, summaryCaution: { color: '#ffd184', fontSize: 14, lineHeight: 20, fontWeight: '800' }, summaryNote: { color: '#d0d6df', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 16 }, summaryButton: { minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d4f64c', marginTop: 22 }, summaryButtonText: { color: '#14180c', fontSize: 15, fontWeight: '900' },
  attemptResult: { position: 'absolute', left: 24, right: 24, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1, alignItems: 'center', backgroundColor: 'rgba(8,11,16,0.88)' }, attemptResultGood: { borderColor: '#d4f64c' }, attemptResultShort: { borderColor: '#ffbd4a' }, attemptResultText: { fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 0.5, color: '#fff', textAlign: 'center' },
  feedbackPill: { position: 'absolute', left: 14, right: 14, minHeight: 42, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 17, backgroundColor: 'rgba(8,11,16,0.78)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ed625e' }, liveGood: { backgroundColor: '#d4f64c' }, feedbackText: { color: '#fff', fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center', flexShrink: 1 }, loadingPill: { position: 'absolute', left: 20, right: 20, top: '48%', padding: 14, borderRadius: 16, backgroundColor: 'rgba(8,11,16,0.82)', alignItems: 'center' },
  bottomPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 17, paddingTop: 10, paddingBottom: 14, backgroundColor: 'transparent' }, setupNote: { color: '#fff', fontSize: 15, lineHeight: 21, textAlign: 'center', fontWeight: '800', textShadowColor: 'rgba(0,0,0,.9)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 5 },
  coachControls: { position: 'absolute', top: 180, left: 38, zIndex: 5, alignItems: 'center' }, coachActions: { alignItems: 'center', gap: 10, marginTop: 10 }, floatingControl: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,11,16,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,.78)', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 7, shadowOffset: { width: 0, height: 2 } }, menuToggle: { backgroundColor: 'rgba(52,120,246,0.94)', borderColor: 'rgba(255,255,255,.86)' }, endControl: { backgroundColor: 'rgba(178,48,44,0.94)', borderColor: 'rgba(255,255,255,.5)' }, floatingControlGlyph: { color: '#fff', fontSize: 22, lineHeight: 26, fontWeight: '900' },
  cameraError: { position: 'absolute', top: 170, left: 16, right: 16, padding: 12, borderRadius: 14, backgroundColor: 'rgba(12,17,23,0.94)' }, cameraErrorText: { color: '#fff', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  permissionScreen: { flex: 1 }, permissionPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }, cameraIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#202a36', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }, cameraIconGlyph: { color: '#84b8ff', fontSize: 42 }, permissionTitle: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' }, permissionCopy: { maxWidth: 420, color: '#c5ced8', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 }, permissionError: { color: '#ffb3ae', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 12 }, permissionHint: { maxWidth: 360, color: '#ffcf8a', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 18 }, allowButton: { minHeight: 50, paddingHorizontal: 24, borderRadius: 16, backgroundColor: '#d4f64c', alignItems: 'center', justifyContent: 'center', marginTop: 22 }, allowButtonText: { color: '#14180c', fontSize: 16, fontWeight: '900' }, beginButton: { minHeight: 46, width: '100%', borderRadius: 15, backgroundColor: '#d4f64c', alignItems: 'center', justifyContent: 'center' }, beginButtonDisabled: { opacity: 0.62 }, beginButtonText: { color: '#14180c', fontSize: 15, fontWeight: '900' }, stopButton: { minHeight: 42, width: '100%', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,.45)', alignItems: 'center', justifyContent: 'center' }, returnButton: { minHeight: 44, width: '100%', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,.5)', alignItems: 'center', justifyContent: 'center' }, returnButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
