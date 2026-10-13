# Repday

# Repday — Expo Workout Tracker with Swappable Backends & AI Coaching

![Static Badge](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Static Badge](https://img.shields.io/badge/React_Native-61DAFB?logo=react&logoColor=black)
![Static Badge](https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white)
![Static Badge](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black)
![Static Badge](https://img.shields.io/badge/Vercel_AI_SDK-000000?logo=vercel&logoColor=white)
![Static Badge](https://img.shields.io/badge/Zod-3E67B1?logo=zod&logoColor=white)
![Static Badge](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)

---

Most mobile apps hard-code their backend. Repday doesn't — and that design decision is the most interesting thing about it.

Repday is a cross-platform workout tracker built with Expo (v57) and React Native. It handles splits, active sessions, rest timers, history, and an AI coaching layer. But the standout architectural move is the **backend isolation pattern** introduced on this branch.

---

## The Architecture

A single file — `backend/contracts.ts` — defines every data shape and every operation the UI is allowed to call. It has no idea which backend is running.

The UI screens call a stable hook: `useWorkoutData`. That hook is the only import that changes between branches — Firebase on this one, Convex on the other. No runtime `if Firebase / else Convex` switch. No SDK leaking into components. Just a clean TypeScript contract that any adapter must satisfy.

---

## Old Way vs. This Way

**❌ The Old Way**
- Firebase SDK calls scattered directly inside components
- Switching backends = search-and-replace across dozens of files
- Tests couple to a specific SDK's behavior
- Migrating means a big-bang rewrite

**✅ The Repday Way**
- `contracts.ts` defines the app-facing interface — adapters implement it
- Screens never touch Firebase or Convex directly
- Swapping backends = swap the branch + the adapter file
- TypeScript enforces the contract at compile time

---

## AI Coaching — Server-Side, Validated

The AI layer runs in Expo API routes (`app/api/coach+api.ts`, `app/api/analyze-workout+api.ts`).

- `generateText` from the **Vercel AI SDK** calls GPT-5 mini through Vercel AI Gateway
- **Zod v4** validates every AI-generated JSON response before it touches the app
- The workout note parser strips markdown fences, parses JSON, then runs a strict schema check — if the AI drifts, the endpoint rejects cleanly with a user-friendly error

```ts
const validated = workoutSchema.safeParse(parsed);
if (!validated.success || validated.data.splits.length === 0) {
  return Response.json({ error: "I couldn't find a complete workout split in that note." }, { status: 422 });
}
```

---

## What Else Is In Here

🏋️ **Custom native Expo module** — a workout timer built in Kotlin for Android, wired up via the Expo Modules API
📷 **Form Coach camera screen** — live camera preview overlaid with real-time set/rep/load metrics
📄 **Paginated history** — Firestore queries with cursor-based pagination, 30 records at a time
🔐 **Firebase Auth** — Email/Password + Google Sign-In with platform-aware persistence (AsyncStorage on native, web persistence on browser)

---

## The Lesson Worth Stealing

The `contracts.ts` pattern costs almost nothing to set up. A TypeScript interface + a single adapter file per backend. But it buys you:

- The freedom to migrate databases without touching UI
- A clean seam for mocking in tests
- Multi-backend experimentation on parallel branches

You don't need Convex vs. Firebase to be a permanent choice. This repo proves you can keep both alive, in production quality, and switch with a branch checkout.

---

🔗 https://github.com/Vorpalv2/repday_expo_aisdk_convex/tree/codex/backend-isolation

#ExpoSDK #ReactNative #TypeScript #Firebase #VercelAI #MobileApp #SoftwareArchitecture #AIEngineering


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
