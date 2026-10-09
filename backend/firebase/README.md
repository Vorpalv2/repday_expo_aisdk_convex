# Firebase adapter

This is the active backend implementation on this branch. It contains Firebase app/Auth initialization and the Firestore/Storage adapter used by the app. Keep provider-specific calls here; screens use `backend/useWorkoutData.ts` and the app-facing types in `backend/contracts.ts`.

Configure the Firebase web app values in `.env.local` and enable Email/Password Auth. The default Standard Firestore database for `repday-expo` is in `asia-south2`; `firestore.rules` has been deployed and restricts each signed-in user to their own `users/{uid}/...` data. The rules are important because client Firebase configuration is public.

Profile photo uploads use Cloud Storage, but a Storage bucket has not been provisioned for this project. Firebase currently requires the Blaze plan to create or use a Cloud Storage for Firebase bucket. Do not deploy `storage.rules` or expect profile photo uploads to work until the project owner has enabled billing and created the bucket.

## AI Coach

AI Coach and workout-note parsing use the Vercel AI SDK through the app API routes in `app/api/`. The provider key stays server-side as `AI_GATEWAY_API_KEY`. Firebase remains responsible for authentication and workout data on this branch; it does not receive AI requests.

AI Coach model choices are validated server-side and sent through Vercel AI Gateway. Native app builds call the deployed API origin configured by `EXPO_PUBLIC_API_URL`; web uses same-origin API routes.
