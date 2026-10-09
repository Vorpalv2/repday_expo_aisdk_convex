import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { DEFAULT_AI_COACH_MODEL, type AICoachModelId } from './aiModels';

export { AI_COACH_MODELS, type AICoachModelId } from './aiModels';

function getApiBaseUrl() {
  if (Platform.OS === 'web') return '';
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host) return `http://${host}:8081`;
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return configured;
  return 'https://repday.expo.app';
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error('AI Coach returned an unreadable response. Try again.');
  }
  if (!response.ok) throw new Error(payload.error || 'AI Coach is temporarily unavailable.');
  return payload as T;
}

export async function askCoachQuestion(
  question: string,
  context: string,
  model: AICoachModelId = DEFAULT_AI_COACH_MODEL,
) {
  const result = await post<{ answer: string }>('/api/coach', { question, context, model });
  return result.answer;
}

export async function analyzeWorkoutNote(note: string) {
  return post<{ splits: { name: string; exercises: { name: string; sets: { weight?: number; reps: number }[] }[] }[] }>(
    '/api/analyze-workout',
    { note },
  );
}
