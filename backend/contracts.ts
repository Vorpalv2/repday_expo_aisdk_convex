/** Domain shapes shared by the UI and every backend adapter. */
export type AuthFlow = 'signIn' | 'signUp';
export type WorkoutTheme = 'light' | 'dark' | 'cyberpunk';
export type SetEntry = { weight: string; reps: string; done: boolean };
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
  signIn: (email: string, password: string, flow: AuthFlow) => Promise<void>;
  signOut: () => Promise<void>;
}

export type WorkoutSettings = {
  userId?: string;
  user?: { name?: string | null; email?: string | null } | null;
  initialized?: boolean;
  weeklyPlan?: Record<number, string | null>;
  focusDraft?: FocusDraft | null;
  selectedSessionId?: string | null;
  country?: string;
  timeZone?: string;
  theme?: WorkoutTheme;
  activityDefaultCollapsed?: boolean;
  legacyActiveWorkout?: ActiveWorkout | null;
  legacyWorking?: Session | null;
  legacyRestEndsAt?: number | null;
};

export type ActiveWorkoutSnapshot = {
  userId?: string;
  sessionKey?: string | null;
  activeWorkout: ActiveWorkout | null;
  working: Session | null;
  restEndsAt: number | null;
};

/** App-facing read/write contract. Adapters translate these operations to their SDK. */
export interface WorkoutBackendBindings {
  remoteSettings: WorkoutSettings | null | undefined;
  remoteSplits: { userId?: string; sessions: Session[] } | null | undefined;
  remoteHistoryResults: WorkoutRecord[];
  remoteHistoryStatus: string;
  loadMoreHistory: (count: number) => void;
  remoteActiveWorkout: ActiveWorkoutSnapshot | null | undefined;
  profilePhotoUrl: string | null | undefined;
  syncSplits: (args: { items: Session[] }) => Promise<unknown>;
  syncHistory: (args: { items: WorkoutRecord[] }) => Promise<unknown>;
  upsertHistoryItem: (args: { item: WorkoutRecord }) => Promise<unknown>;
  deleteHistoryItem: (args: { clientId: string }) => Promise<unknown>;
  upsertSplit: (args: { item: Session; position: number }) => Promise<unknown>;
  deleteSplit: (args: { clientId: string }) => Promise<unknown>;
  reorderSplitPositions: (args: { clientIds: string[] }) => Promise<unknown>;
  saveSettings: (args: {
    weeklyPlan: Record<number, string | null>;
    focusDraft: FocusDraft | null;
    selectedSessionId: string | null;
    country: string;
    timeZone: string;
    theme: WorkoutTheme;
    activityDefaultCollapsed: boolean;
  }) => Promise<unknown>;
  saveActiveWorkout: (args: {
    activeWorkout: ActiveWorkout | null;
    working: Session | null;
    restEndsAt: number | null;
  }) => Promise<unknown>;
  updateActiveWorkoutSet: (args: {
    sessionKey: string;
    moveIndex: number;
    setIndex: number;
    field: 'weight' | 'reps' | 'done';
    value: string | boolean;
  }) => Promise<unknown>;
  addActiveWorkoutSet: (args: {
    sessionKey: string;
    moveIndex: number;
    setIndex: number;
    weight: string;
    reps: string;
  }) => Promise<unknown>;
  migrateLegacyActiveWorkout: (args: Record<string, never>) => Promise<unknown>;
  uploadProfilePhoto: (blob: Blob, contentType: string) => Promise<void>;
}
