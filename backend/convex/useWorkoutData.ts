import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { WorkoutBackendBindings } from '../contracts';

export type UseWorkoutDataOptions = {
  isAuthenticated: boolean;
  tab: string;
  cloudOwnerId: string | null;
};

/** Convex-specific queries and mutations used by the workout UI. */
export function useConvexWorkoutData({ isAuthenticated, tab, cloudOwnerId }: UseWorkoutDataOptions): WorkoutBackendBindings {
  const remoteSettings = useQuery(api.workouts.getMySettings, isAuthenticated ? {} : 'skip');
  const remoteSplits = useQuery(api.workouts.getMySplits, isAuthenticated ? {} : 'skip');
  const {
    results: remoteHistoryResults,
    status: remoteHistoryStatus,
    loadMore: loadMoreHistory,
  } = usePaginatedQuery(api.workouts.getMyHistoryPage, isAuthenticated ? {} : 'skip', { initialNumItems: 30 });
  const shouldLoadActiveWorkout = Boolean(
    isAuthenticated && (!remoteSettings?.userId || cloudOwnerId !== remoteSettings.userId),
  );
  const remoteActiveWorkout = useQuery(
    api.workouts.getMyActiveWorkout,
    shouldLoadActiveWorkout ? {} : 'skip',
  );
  const profilePhotoUrl = useQuery(
    api.profilePhotos.getMyUrl,
    isAuthenticated && tab === 'Profile' ? {} : 'skip',
  );

  const syncSplits = useMutation(api.workouts.syncSplits);
  const syncHistory = useMutation(api.workouts.syncHistory);
  const upsertHistoryItem = useMutation(api.workouts.upsertHistoryItem);
  const deleteHistoryItem = useMutation(api.workouts.deleteHistoryItem);
  const upsertSplit = useMutation(api.workouts.upsertSplit);
  const deleteSplit = useMutation(api.workouts.deleteSplit);
  const reorderSplitPositions = useMutation(api.workouts.reorderSplitPositions);
  const saveSettings = useMutation(api.workouts.saveWorkoutSettings);
  const saveActiveWorkout = useMutation(api.workouts.saveActiveWorkout);
  const updateActiveWorkoutSet = useMutation(api.workouts.updateActiveWorkoutSet);
  const addActiveWorkoutSet = useMutation(api.workouts.addActiveWorkoutSet);
  const migrateLegacyActiveWorkout = useMutation(api.workouts.migrateLegacyActiveWorkout);
  const generateProfilePhotoUploadUrl = useMutation(api.profilePhotos.generateUploadUrl);
  const saveProfilePhoto = useMutation(api.profilePhotos.save);

  const uploadProfilePhoto = async (blob: Blob, contentType: string) => {
    const uploadUrl = await generateProfilePhotoUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    if (!response.ok) throw new Error('The image could not be uploaded.');
    const { storageId } = await response.json();
    await saveProfilePhoto({ storageId });
  };

  return {
    remoteSettings,
    remoteSplits,
    remoteHistoryResults,
    remoteHistoryStatus,
    loadMoreHistory,
    remoteActiveWorkout,
    profilePhotoUrl,
    syncSplits,
    syncHistory,
    upsertHistoryItem,
    deleteHistoryItem,
    upsertSplit,
    deleteSplit,
    reorderSplitPositions,
    saveSettings,
    saveActiveWorkout,
    updateActiveWorkoutSet,
    addActiveWorkoutSet,
    migrateLegacyActiveWorkout,
    uploadProfilePhoto,
  };
}
