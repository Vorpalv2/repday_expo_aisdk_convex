# Repday

Repday is an Expo workout-planning app with workout splits, active sessions, history, exercise search, and profile preferences.

## Backend on this branch

This branch is the Firebase implementation. The app uses Firebase Authentication, Cloud Firestore, and Cloud Storage. UI screens call the stable app-facing operations in `backend/useWorkoutData.ts` and the auth context in `backend/BackendProvider.tsx`; Firebase SDK calls live under `backend/firebase/`. There is no runtime backend selector on this branch.

The Convex version remains on the Convex branch. Firebase and Convex accounts and data are separate; this branch does not read or write Convex.

## Set up Firebase

1. Create a Firebase project and register a web app.
2. Enable **Email/Password** under Authentication → Sign-in method.
3. Create a Cloud Firestore database and a Cloud Storage bucket.
4. Copy `.env.example` to `.env.local` and fill in the Firebase web app configuration values.
5. Deploy the access rules in `firestore.rules` and `storage.rules` with the Firebase CLI.
6. Install dependencies with `npm install`, then start Expo with `npm run web`, `npm run ios`, or `npm run android`.

The browser uses Firebase's web authentication persistence. Native builds initialize Firebase Auth with React Native AsyncStorage persistence. Firebase web configuration is included in the client app; authorization must be enforced by Firebase Authentication and Security Rules. Never put server credentials in `EXPO_PUBLIC_*` variables.

## Backend layout

- `backend/contracts.ts` defines app-facing data shapes and operations. It does not detect or choose a backend.
- `backend/BackendProvider.tsx` provides Firebase Authentication to the app.
- `backend/firebase/` contains Firebase initialization and Firestore/Storage operations.
- `backend/useWorkoutData.ts` is the stable hook import used by screens and binds to Firebase on this branch.

See [`backend/README.md`](backend/README.md) for the adapter boundary and data layout.
