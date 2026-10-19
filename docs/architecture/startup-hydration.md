# Startup hydration and recovery

Updated 19 October 2026.

## Why the startup path changed

A reported cold browser/PWA launch or returning sign-in could spend long enough loading to reach the recovery screen, then work immediately after pressing Try again. Source inspection found avoidable sequencing and blocking: the workout-data hook was mounted only after billing and entry animations; initialized accounts could not render until current-week history completed; retrying recreated all data subscriptions, but only after the user requested it.

These findings explain unnecessary delay and why recreating subscriptions could help. They do **not** prove a Firebase Auth SDK defect, a particular production network failure, or that `auth.currentUser` was observed diverging from the auth observer. The UID race discussed during investigation was a hypothesis. Measuring the original network stall still requires a trace from an affected device.

Inspection of the installed Firebase Auth SDK also found a concrete mobile-specific dependency: `getAuth()` installs `browserPopupRedirectResolver`, whose `_shouldInitProactively` is true on mobile browsers, Safari and iOS. Auth's initialization awaits that resolver's hidden iframe before restoring the current user and notifying the observer. A slow first cross-origin iframe load can therefore delay ordinary session restoration even though no Google popup was requested.

Web now calls `initializeAuth()` with the same IndexedDB → localStorage → sessionStorage persistence hierarchy, omitting the startup popup resolver. Google sign-in, account linking and reauthentication pass `browserPopupRedirectResolver` explicitly, so its iframe is initialized when one of those flows is requested. Existing stored logins retain the same persistence stores. Native Google sign-in uses its existing separate implementation. This removes the unnecessary iframe dependency; it does not prove that the iframe was the stalled request on the reported device.

## Current sequence

1. Firebase restores persistence without eagerly opening the popup iframe, and its auth observer resolves the signed-in user. The data hook receives that React user's UID explicitly.
2. After the entry route identifies an existing account or completed onboarding, the data hook starts in `HomeScreen`, alongside the billing gate. It no longer waits for the large workout screen to mount. Fixed three-second animation gates have been removed.
3. Settings and the account-scoped split snapshot load. A missing settings document reported only by the local Firestore cache is ignored: a cold cache cannot prove the account is empty.
4. An initialized account with usable settings and splits can render while current-week history is still loading. A matching local split revision still requires no split collection download. Settings and revisions continue to reconcile with Firebase.
5. History confirms its own complete Monday–Sunday range. The UI replaces that range with the server result, retaining other cached weeks. History delivery no longer advances the split-hydration version, so a late history response does not reset split edits made while waiting.

The billing gate still waits for a result/error or its existing five-second fallback. Firebase Auth retains its separate fifteen-second recovery screen. This change does not claim instant loading before authentication or eliminate the initial network requests on a genuinely new device.

## Recovery and boundaries

- If required initial data stalls for eight seconds, the hook recreates its subscriptions automatically. It allows two automatic retries, then exposes the recovery screen after another unsuccessful attempt. Without intermediate progress/errors this is roughly 24 seconds.
- Explicit load errors schedule the next attempt after one second initially and two seconds thereafter. Try again resets the retry budget.
- A successful usable snapshot cancels further startup retries. A normal healthy launch adds no retry reads.
- Same-account settings/splits remain available during retry. Once the app has hydrated, a background refresh/history error is shown as a message instead of replacing the whole app with the startup screen.
- Subscriptions and retry timers are cleaned up on account changes/unmount. Account-owned data must match the current UID before the workout screen can render; history state is cleared when the UID changes. Late cancelled settings callbacks are ignored.
- Data loading is paused during onboarding. The atomic plan installation already advances `splitsRevision` in its settings write; starting a free account's startup revision check before that installation could otherwise freeze its initial snapshot at the pre-plan revision.
- Empty, uninitialized accounts still wait for authoritative history before deciding to import legacy local data. Existing-account settings/history are never inferred from a cold empty cache.

## Database I/O

The normal settings, split-revision and current-week query policy is unchanged. Loading those requests concurrently changes waiting time rather than their ordinary document counts. An automatic/manual retry can issue extra settings reads and, when still needed, split verification and current-week requests. Firestore's ordinary per-document/query-minimum and listener billing rules still apply. There are at most two automatic startup retries per UID/manual retry cycle; this is not an unlimited polling loop.

Starting the hook earlier can begin its queries even while the billing gate is visible. No additional routine writes were introduced, and no collection data is marked authoritative merely because it exists in a cache.

## Verification

`tests/auth-startup.test.ts` checks deferred popup initialization, unchanged persistence selection, hot-refresh reuse, native persistence, and explicit resolvers for all three web Google flows. `tests/startup-hydration.test.ts` runs the real data hook against controlled React effects, clocks, storage and Firestore deliveries. It covers cold-cache absence, slow history, automatic recovery, bounded retries, manual retry, warm-cache zero split downloads, independent history/split delivery and cancelled account callbacks. Existing split-cache, revision-write, plan-generation and week-query tests provide the surrounding coverage. These are deterministic regression checks, not measured production latency or a Firestore invoice.

Sources: `app/index.tsx`, `backend/firebase/client.ts`, `backend/firebase/googleSignIn.ts`, `backend/firebase/useWorkoutData.ts`, `backend/contracts.ts`, `backend/firebase/splitCache.ts`. The installed SDK's `AuthImpl._initializeWithPersistence`, `BrowserPopupRedirectResolver._shouldInitProactively` and `getAuth` establish the iframe dependency.
