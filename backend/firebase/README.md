# Firebase adapter

This is the active backend implementation on this branch. It contains Firebase app/Auth initialization and the Firestore adapter used by the app. Keep provider-specific calls here; screens use `backend/useWorkoutData.ts` and the app-facing types in `backend/contracts.ts`.

Configure the Firebase web app values in `.env.local` and enable Email/Password Auth. The default Standard Firestore database for `repday-expo` is in `asia-south2`; `firestore.rules` has been deployed and restricts each signed-in user to their own `users/{uid}/...` data. The rules are important because client Firebase configuration is public.

The Profile screen uses the photo URL supplied by Firebase Authentication after Google sign-in. The app no longer uploads profile photos or reads profile-photo metadata from Firestore. Account deletion retains legacy Storage and metadata cleanup so accounts that used older versions do not leave uploaded files behind.

## AI Coach

AI Coach and workout-note parsing use the Vercel AI SDK through the app API routes in `app/api/`. The provider key stays server-side as `AI_GATEWAY_API_KEY`. Firebase remains responsible for authentication and workout data on this branch; it does not receive AI requests.

AI Coach model choices are validated server-side and sent through Vercel AI Gateway. Native app builds call the deployed API origin configured by `EXPO_PUBLIC_API_URL`; web uses same-origin API routes.

Both AI endpoints require a Firebase ID token and enforce per-account limits with Upstash Redis before calling AI Gateway. The server validates tokens through Firebase Auth's `accounts:lookup` REST endpoint and uses the returned UID as the rate-limit key. It reuses the existing Firebase web API key and does not require a Firebase Admin service-account key.

- Coach: 10 requests per rolling minute.
- Workout-note import: 5 requests per rolling hour.

Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as server-side environment variables in local development and the API hosting environment. `EXPO_PUBLIC_FIREBASE_API_KEY` is already part of the app's Firebase configuration. The limiter fails closed with HTTP 503 if Redis is unavailable or not configured, and returns HTTP 429 with `Retry-After` when a user reaches a limit.
