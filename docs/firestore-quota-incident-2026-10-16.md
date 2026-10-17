# Firestore quota incident: excessive reads

**Date:** 16 October 2026
**Service:** Cloud Firestore Standard database, `repday-expo`
**Impact:** The app received Firestore `resource-exhausted` errors after exhausting the daily free-tier read and write allowance. Realtime data stopped loading reliably until the daily quota reset. The exact source of the full read and write totals has not been proven.

The implemented follow-up architecture is documented in [Firestore optimizations and caching](./firestore-optimizations-and-caching.md).

## What users saw

The browser console reported two Firestore messages:

```text
Using maximum backoff delay to prevent overloading the backend.
FirebaseError: [code=resource-exhausted]: Quota exceeded.
```

The first message is Firestore slowing down its reconnect attempts after failures. The second is the actual failure: the project had exhausted its available Firestore quota for the day.

## Evidence

The Firestore Usage dashboard showed:

| Operation | Observed total |
| --- | ---: |
| Reads | 60,000 |
| Writes | 20,000 |
| Deletes | 209 |

There was a sharp read increase from almost zero to roughly 60,000 between 7 AM and 8 AM. The 60,000 reads exceeded the Standard database free-tier daily allowance, and 20,000 writes reached its daily free-tier limit. The screenshot only plotted **reads**; it did not show when those writes happened.

Usage totals are cumulative for the reporting day. Deploying a code change does not reduce the numbers already shown in the dashboard or restore quota immediately.

## How the issue was diagnosed

1. We started with the browser error, which identified Firestore quota exhaustion rather than an authentication or UI problem.
2. We checked the Firestore Usage dashboard and confirmed the read spike and daily totals.
3. We searched the app for realtime listeners and found six calls in `backend/firebase/useWorkoutData.ts` at the time of the incident.
4. We inspected the lifecycle effect that created the listeners. Its dependency list included `tab` and `googlePhotoUrl`:

   ```ts
   useEffect(/* subscriptions */, [uid, tab, googlePhotoUrl, retryCount]);
   ```

5. That same effect subscribed to settings, all splits, the first 30 history records, the active-workout document, active-workout sets, and sometimes the profile photo.
6. When the user navigated to another tab, React cleaned up every listener and then opened all of them again. Each newly opened query listener can require Firestore to read its initial matching documents again. The profile screen was a cosmetic concern, but changing screens could reload the entire account data set.

This listener lifecycle was a confirmed source of unnecessary reads. The usage chart alone cannot prove that it accounted for every read in the spike. Normal manual tab changes alone would require an unusually large number of reconnects to reach 60,000 reads in an hour.

## Confirmed read amplification

The main Firestore subscription effect mixed two different responsibilities:

- **Account-wide realtime data** that should stay subscribed while a signed-in user remains in the app.
- **Profile photo data** that is only needed while the Profile tab is visible.

Because `tab` was a dependency of the combined effect, every tab change recreated all account-wide listeners. `googlePhotoUrl` could also recreate them when Firebase Auth populated or updated that value.

## Write-path audit

The 20,000 writes need a separate explanation: reopening a listener causes reads, not writes. A code review of the app's Firestore write paths found these possible contributors:

- The settings effect saves the settings document after account hydration and whenever tracked preferences or the focus draft change. It writes an `updatedAt` value even if the other fields are unchanged. Its dependency list uses the stable user ID, so a settings snapshot does not by itself trigger an endless settings-save loop.
- On first hydration, the app can resync every saved split if its stored rest duration differs from the restored preference. Legacy local-data import can also write all local splits and history. Both paths have guards intended to run once per account load.
- Split updates through `/api/splits` write the changed split and a `splitQuotas/{uid}` revision document. Bulk split sync writes each submitted split.
- A billing status refresh for an account with a Razorpay subscription can update `billingAccounts/{uid}`. The billing hook refreshes on sign-in, every four hours while open, and on foreground only when its last successful check is at least four hours old. The known paid-through timer still checks at expiry.
- Workout set edits, completion, history saves, and account deletion write when the corresponding user action runs.

No automatic write loop capable of explaining 20,000 writes was found in this static review. The write total is cumulative, and the supplied screenshot did not plot writes over time or identify the operation or document path. That evidence is needed before assigning the write spike to a specific feature.

## Fix

`backend/firebase/useWorkoutData.ts` now uses two effects.

### 1. Core data subscription effect

The effect for settings, splits, and the first history page depends only on:

```ts
[uid, retryCount]
```

Those listeners now remain active while the same signed-in user is using the app. They reconnect only when:

- the signed-in user changes or signs out;
- the user explicitly presses the retry action; or
- the component containing the hook unmounts.

The obsolete active-workout parent and set listeners were removed. Unfinished workout state now remains in AsyncStorage on the current device, and Firestore receives a history document only after the workout finishes.

### 2. Profile photo no longer uses Firestore

The Profile screen now renders the Google photo URL supplied by Firebase Authentication. The upload control, profile-photo metadata subscription, and related Firestore read were removed. Account deletion still cleans up legacy profile-photo data created by older app versions.

## Expected result

Moving between Home, Progress, Profile, and Search does not resubscribe to settings, splits, or history. The history listener now starts with seven records, active-workout listeners no longer exist, and opening Profile does not read a profile-photo document.

The change does not change what data the app needs to load at sign-in, nor does it remove reads caused by genuine document updates. It specifically removes repeated initial reads caused by reopening the same listeners on tab changes.

## Additional read and write reductions

A second code audit found several paths that spent Firestore operations when the stored state had not changed. The app now:

- skips the settings write after account hydration when the saved settings already match the local values;
- reads only the target document for an existing single-split edit, while creation and bulk replacement still read the split list to enforce the free-tier limit;
- skips writes to unchanged split documents and does not bump the split quota revision for a no-op save;
- avoids rewriting an unchanged `billingAccounts/{uid}` document during a Razorpay status refresh;
- reuses the billing status already read by `/api/billing/access`, avoiding a second account read in that endpoint;
- uses the loaded billing status to gate AI Coach and Form Inspection in the UI instead of making an extra access request for every action;
- caches server entitlement reads in Redis for up to four hours, never past the known paid-through time, and invalidates the cache after webhook, checkout, and cancellation updates. Free and complimentary account entries have a five-minute cache lifetime.
- no longer rewrites every split during account hydration to force the default rest duration onto existing exercises.
- avoids a second automatic settings save after the user explicitly saves a preference draft.
- enables Firestore's IndexedDB-backed persistent cache with multi-tab coordination on web, allowing eligible cached documents to survive reloads and be shared between tabs.

AI Coach still checks access in its server endpoint, but a cache hit avoids a Firestore billing-document read. A cache miss falls back to Firestore. Split quota transactions still read the billing document directly to enforce the six-split limit atomically.

## Verification and monitoring

1. Wait for the Firestore daily quota to reset before testing live data again.
2. Sign in once and visit each main tab repeatedly.
3. In browser logs, confirm that navigation does not show new core listener errors or reconnect loops.
4. In the Firestore Usage dashboard, compare read growth during navigation with the prior behavior. Use a time range beginning after this fix was deployed.
5. Review writes separately. The listener change addresses excess reads; a write spike requires its own trace through split, history, and settings mutations.
6. In the Usage dashboard, enable the **Writes** series and note its spike time. Compare it with app/server request logs for `/api/splits`, `/api/billing`, and workout actions. If possible, inspect Cloud Monitoring's Firestore write metrics by operation and Firestore audit logs for the affected time window.

## Prevention guidelines

- Put only values that truly require a subscription to be recreated in that effect's dependency list.
- Keep screen-specific listeners separate from app-wide account listeners.
- Always return every `onSnapshot` unsubscribe function from its React effect.
- Query and listen only to the documents needed by the current feature; retain pagination for workout history.
- Treat `retryCount` as an intentional reconnect trigger, not a general render dependency.
- Watch Firestore read and write dashboards after major navigation or realtime-data changes.

## Related implementation

- [Firestore adapter](/Users/aakash/Desktop/ai_projects/expo_workout_tracker/backend/firebase/useWorkoutData.ts)
- [Firebase backend notes](/Users/aakash/Desktop/ai_projects/expo_workout_tracker/backend/README.md)
