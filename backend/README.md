# Backend boundary

`contracts.ts` is the shared language between app screens and a backend implementation: TypeScript data shapes and the operations the UI needs. It does **not** inspect the selected provider or contain a runtime `if Firebase / else Convex` switch.

This branch is the Firebase build. `useWorkoutData` in the root of this folder is a stable import for screens; it forwards to the Firebase adapter. Authentication is provided by `BackendProvider`. Keep Firebase SDK calls in `firebase/` so a future provider can implement the same app-facing operations without putting database calls in screens.

The other branch remains the Convex app. No Convex SDK, server functions, or Convex calls are used in this Firebase branch. A later backend should have its own branch/build configuration and adapter implementation rather than selecting a backend at app startup.

## Firebase data layout

All user-owned Firestore data is scoped beneath `users/{uid}`:

- `settings/main`
- `splits/{splitId}`
- `history/{workoutId}`
- `activeWorkouts/current` and its `sets/{moveIndex_setIndex}` subcollection
- `profilePhotos/current` (the image itself is in Cloud Storage)

The Firestore and Storage rules at the repository root restrict each user to their own path. Review rules before deploying them to a production Firebase project.
