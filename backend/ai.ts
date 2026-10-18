import Constants from 'expo-constants';
import {fetch as streamFetch} from 'expo/fetch';
import {readCoachStream} from '../lib/coachStream';
import type {CoachMessage} from '../lib/coachConversation';
import { Platform } from 'react-native';
import { DEFAULT_AI_COACH_MODEL, type AICoachModelId } from './aiModels';
import { auth } from './firebase/client';

export { AI_COACH_MODELS, type AICoachModelId } from './aiModels';

export function getApiBaseUrl() {
  if (Platform.OS === 'web') return '';
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host) return `http://${host}:8081`;
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return configured;
  return 'https://repday.expo.app';
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in to use AI features.');
  const idToken = await user.getIdToken();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
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
 question:string, context:string, model:AICoachModelId=DEFAULT_AI_COACH_MODEL,
 options:{messages?:CoachMessage[];onText?:(text:string)=>void;signal?:AbortSignal}={},
){
 const user=auth?.currentUser;if(!user)throw new Error('Sign in to use AI features.');
 const token=await user.getIdToken();
 const response=await streamFetch(`${getApiBaseUrl()}/api/coach`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({question,context,model,messages:options.messages?.slice(-12).map(message=>({role:message.role,text:message.text}))}),signal:options.signal});
 return readCoachStream(response as unknown as Response,options.onText||(()=>{}),options.signal);
}

export async function analyzeWorkoutNote(note: string) {
  return post<{ splits: { name: string; exercises: { name: string; sets: { weight?: number; reps: number }[] }[] }[] }>(
    '/api/analyze-workout',
    { note },
  );
}
