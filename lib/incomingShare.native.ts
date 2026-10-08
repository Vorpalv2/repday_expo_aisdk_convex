import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  clearSharedPayloads as clearNativeSharedPayloads,
  getResolvedSharedPayloadsAsync,
  getSharedPayloads,
} from 'expo-sharing';
import type { ResolvedSharePayload, SharePayload } from 'expo-sharing';

/**
 * Expo Sharing reads its App Group synchronously when its built-in hook mounts.
 * On iOS installs made before the sharing config plugin was applied, that read
 * throws and prevents the entire app from starting. Keep the app usable while
 * still enabling incoming shares on correctly configured native builds.
 */
export default function useIncomingShare() {
  const [sharedPayloads, setSharedPayloads] = useState<SharePayload[]>([]);
  const [resolvedSharedPayloads, setResolvedSharedPayloads] = useState<ResolvedSharePayload[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refreshSharePayloads = useCallback(async () => {
    try {
      const payloads = getSharedPayloads();
      setSharedPayloads(payloads);
      setError(null);

      if (payloads.length === 0) {
        setResolvedSharedPayloads([]);
        return;
      }

      setIsResolving(true);
      try {
        setResolvedSharedPayloads(await getResolvedSharedPayloadsAsync());
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error('Unable to read shared content.'));
        setResolvedSharedPayloads([]);
      } finally {
        setIsResolving(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Incoming sharing is unavailable.'));
      setSharedPayloads([]);
      setResolvedSharedPayloads([]);
      setIsResolving(false);
    }
  }, []);

  const clearSharedPayloads = useCallback(() => {
    try {
      clearNativeSharedPayloads();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Unable to clear shared content.'));
    }
    setSharedPayloads([]);
    setResolvedSharedPayloads([]);
  }, []);

  useEffect(() => {
    void refreshSharePayloads();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshSharePayloads();
    });
    return () => subscription.remove();
  }, [refreshSharePayloads]);

  return {
    sharedPayloads,
    resolvedSharedPayloads,
    clearSharedPayloads,
    isResolving,
    error,
    refreshSharePayloads,
  };
}
