# Repday

A small Expo strength training tracker inspired by the supplied mobile design. It includes starter Push, Pull, and Legs splits, user-created splits, exercise search, editable set weight and rep targets, a live workout timer, pause and finish controls, session summary, weekly planning, and progress tracking.

## Cloud backend and sign-in

Workout splits, exercise prescriptions and media metadata, set completion, workout history, weekly plans, the selected split, the active workout timer, and rest timer state are saved per account in Convex. Email/password sign-up and sign-in use Convex Auth. Auth sessions are held in Expo SecureStore on iOS and Android. Existing on-device workout data is migrated into the first account that signs in; a different account starts with its own data.

The app already has a development deployment linked in `.env.local` (ignored by Git). To create or connect a deployment on another machine:

1. Install dependencies with `npm install`.
2. Run `npx convex dev` and sign in to Convex. Choose the `repday-workout-tracker` project or create a separate one.
3. Run `npx @convex-dev/auth --skip-git-check` to configure the server-side JWT signing keys and check the auth routes. Keep generated keys private.
4. Run `npm start` to load the generated `EXPO_PUBLIC_CONVEX_URL` and start Expo.

The backend schema and authenticated functions live in `convex/`. Convex Auth is currently in beta. The current password flow has no email verification or password reset configured; set up a mail provider before production use.

## Exercise library

The app loads the full [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) catalog in the background so exercise and split cards can use repository thumbnails; exercise detail views use its GIF demonstrations. The source JSON is 16.6 MB and is fetched at runtime rather than bundled.

## Run

Use Expo Go or an iOS/Android simulator with `npm start`. `npm run web` starts the web target.
