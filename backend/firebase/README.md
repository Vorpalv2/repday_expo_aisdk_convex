# Firebase adapter

This is the active backend implementation on this branch. It contains Firebase app/Auth initialization and the Firestore/Storage adapter used by the app. Keep provider-specific calls here; screens use `backend/useWorkoutData.ts` and the app-facing types in `backend/contracts.ts`.

Configure the Firebase web app values in `.env.local` and enable Email/Password Auth. The default Standard Firestore database for `repday-expo` is in `asia-south2`; `firestore.rules` has been deployed and restricts each signed-in user to their own `users/{uid}/...` data. The rules are important because client Firebase configuration is public.

Profile photo uploads use Cloud Storage, but a Storage bucket has not been provisioned for this project. Firebase currently requires the Blaze plan to create or use a Cloud Storage for Firebase bucket. Do not deploy `storage.rules` or expect profile photo uploads to work until the project owner has enabled billing and created the bucket.

## Firebase AI Logic

AI Coach and workout-note parsing use Firebase AI Logic through the Gemini Developer API. Calls are made from the app using the provider wrapper in `ai.ts`; no Vercel AI Gateway key or app API route is used. The selected Gemini model is controlled by `EXPO_PUBLIC_FIREBASE_AI_MODEL` and defaults to `gemini-3.5-flash`.

Firebase AI Logic has been enabled for the `repday-expo` web app. Configure App Check before relying on AI requests:

- Web production builds need a reCAPTCHA Enterprise site key in `EXPO_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`, and the web app must be registered with that provider in Firebase App Check.
- Native development builds use the App Check debug provider. Register the generated debug token in Firebase Console > App Check > the app > Manage debug tokens.
- Native production builds use Play Integrity on Android and App Attest with DeviceCheck fallback on iOS. Register both apps and configure those providers in Firebase App Check.
- Rebuild the iOS and Android apps after adding the React Native Firebase native modules. OTA updates cannot add native modules to an already-installed binary.

The prompts include the workout context the user asks about, so that context is sent to Google through Firebase AI Logic. Gemini Developer API model availability and free-tier quotas can change; App Check protects the project from unauthorized clients but does not provide a per-user usage limit.
