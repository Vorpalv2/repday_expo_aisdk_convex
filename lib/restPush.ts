import type { RestPushController, RestPushOptions } from './restPushTypes';

// Native apps continue using expo-notifications.
export function useRestPush(_options: RestPushOptions): RestPushController {
  return { enabled: false, busy: false, status: '', toggle: async () => {} };
}
