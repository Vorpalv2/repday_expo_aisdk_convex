import type { PlanPreferences } from '../lib/trainingPlan';
/** Domain shapes shared by the UI and every backend adapter. */
export type AuthFlow = 'signIn' | 'signUp';
export type WorkoutTheme = 'light' | 'dark' | 'cyberpunk';
export type TrainingGoal = 'strength' | 'muscle' | 'fitness' | 'endurance';
export type WeightUnit = 'kg' | 'lb';
export type SetEntry = { weight: string; reps: string; done: boolean; addedDuringWorkout?: boolean };
export type Move = {
  key: string;
  name: string;
  sets: SetEntry[];
  restSeconds?: string;
  image?: string;
  gif_url?: string;
  target?: string;
  equipment?: string;
  instructions?: Record<string, string>;
  instruction_steps?: Record<string, string[]>;
  /** Kept on-device during an active workout and excluded from the saved split. */
  activeSessionOnly?: boolean;
  /** Append this session-only exercise to the saved split when the workout finishes. */
  addToSplitOnFinish?: boolean;
};
export type Session = {
  id: string;
  name: string;
  description: string;
  accent: string;
  moves: Move[];
};
export type FocusDraft = { day: string; session: Session };
export type ActiveWorkout = { startedAt: number; pausedAt: number | null; pausedMs: number };
export type WorkoutRecord = {
  id: string;
  name: string;
  startedAt: number;
  duration: number;
  volume: number;
  sets: number;
  exercises: number;
  session: Session;
};

export interface BackendAuth {
  isLoading: boolean;
  isAuthenticated: boolean;
  googleLinked: boolean;
  signIn: (email: string, password: string, flow: AuthFlow) => Promise<{ isNewUser: boolean; name?: string }>;
  signInWithGoogle: () => Promise<{ isNewUser: boolean; name?: string }>;
  deleteAccount: (password?: string, onProgress?: (stage: string) => void) => Promise<void>;
  linkGoogleAccount: () => Promise<void>;
  signOut: () => Promise<void>;
}

export type WorkoutSettings = {
  userId?: string;
  user?: { name?: string | null; email?: string | null } | null;
  initialized?: boolean;
  guidedPlan?: {id:string;templateId:string;templateVersion:number;preferences:PlanPreferences;createdAt:number};
  weeklyPlan?: Record<number, string | null>;
  restDays?: Record<string, boolean | 'auto'>;
  scheduleOverrides?: Record<string, string | null>;
  autoRestNextDate?: string | null;
  autoRestStartedAt?: number;
  focusDraft?: FocusDraft | null;
  selectedSessionId?: string | null;
  country?: string;
  timeZone?: string;
  theme?: WorkoutTheme;
  activityDefaultCollapsed?: boolean;
  trainingGoal?: TrainingGoal;
  restPreferenceSeconds?: 60 | 90 | 120 | 180;
  weightUnit?: WeightUnit;
  remindersEnabled?: boolean;
};

/** App-facing read/write contract. Adapters translate these operations to their SDK. */
export interface WorkoutBackendBindings {
  remoteDataError: string | null;
  retryRemoteData: () => void;
  remoteSettings: WorkoutSettings | null | undefined;
  remoteSplits: { userId?: string; sessions: Session[] } | null | undefined;
  remoteHistoryResults: WorkoutRecord[];
  remoteHistoryStatus: string;
  loadMoreHistory: (count: number) => void;
  loadHistoryDate: (timestamp: number) => Promise<void>;
  syncSplits: (args: { items: Session[] }) => Promise<unknown>;
  syncHistory: (args: { items: WorkoutRecord[] }) => Promise<unknown>;
  upsertHistoryItem: (args: { item: WorkoutRecord }) => Promise<unknown>;
  deleteHistoryItem: (args: { clientId: string }) => Promise<unknown>;
  upsertSplit: (args: { item: Session; position: number }) => Promise<unknown>;
  appendSplitExercise: (args: { splitId: string; move: Move }) => Promise<unknown>;
  updateSplitSetTargets: (args: { splitId: string; targets: { moveKey: string; setIndex: number; weight: string; reps: string }[] }) => Promise<unknown>;
  deleteSplit: (args: { clientId: string }) => Promise<unknown>;
  reorderSplitPositions: (args: { clientIds: string[] }) => Promise<unknown>;
  saveSettings: (args: {
    weeklyPlan: Record<number, string | null>; restDays: Record<string, boolean | 'auto'>; autoRestNextDate: string | null;
    focusDraft: FocusDraft | null;
    selectedSessionId: string | null;
    country: string;
    timeZone: string;
    theme: WorkoutTheme;
    activityDefaultCollapsed: boolean;
    trainingGoal: TrainingGoal;
    restPreferenceSeconds: 60 | 90 | 120 | 180;
    weightUnit: WeightUnit;
    remindersEnabled: boolean;
  }) => Promise<unknown>;
  saveScheduleOverrides: (args: { scheduleOverrides: Record<string, string | null> }) => Promise<unknown>;
}
