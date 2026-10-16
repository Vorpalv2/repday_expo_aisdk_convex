# Settings preference write amplification

**Date:** 16 October 2026  
**Service:** Cloud Firestore, project `repday-expo`  
**Status:** Diagnosed; the local-draft and explicit-save improvement is planned for the next bug-fixing phase.

## The issue

Repday currently keeps the user's preferences synchronized with Firestore while the app is being used. A preference change can immediately call the settings save path.

The settings are stored in one document per user:

```text
users/{uid}/settings/main
```

Changing the theme, rest timer, units, training goal, weekly plan, rest days, or another tracked preference updates that same document. It does not create a new settings document for every change.

## What the usage data showed

The Firestore Usage Insights view showed the following write totals for the affected period:

| Collection group | Write operations | Written documents | Written index entries |
| --- | ---: | ---: | ---: |
| `settings` | 61 | 19,642 | 195,048 |
| `splits` | 165 | 178 | 3,531 |
| `billingAccounts` | 172 | 169 | 1,219 |
| `splitQuotas` | 41 | 41 | 138 |
| `billingSubscriptions` | 26 | 26 | 130 |
| `billingEvents` | 8 | 8 | 40 |

The significant number is **19,642 written settings documents**. Firestore counts document writes toward the daily write quota. The 61 operations are API or batch operations; one operation can contain multiple document writes. The data therefore points to settings synchronization as the main source of the write spike, rather than Razorpay billing documents.

The index-entry count is index maintenance caused by those writes. It is not 195,048 additional settings documents.

## Cause

The settings save effect receives the current preference state and writes the complete settings payload. A user changing several preferences in sequence can cause several writes to the same `settings/main` document:

```text
change theme       -> write users/{uid}/settings/main
change units       -> write users/{uid}/settings/main
change rest timer  -> write users/{uid}/settings/main
change goal        -> write users/{uid}/settings/main
```

The document path stays the same, but each successful update is still a Firestore document write. The payload also includes `updatedAt`, so a save request changes the document even when the preference values are otherwise unchanged.

The current code includes a signature and in-flight-write guard that skips saves when the state already matches the remote settings or when an identical save is already underway. That reduces duplicate writes, but the user-facing model is still automatic synchronization rather than an explicit save transaction.

This explains the write spike much better than subscription checks. Billing access is cached and refreshed on a long interval; it does not write a settings document for every premium-feature action.

## Planned fix

Keep preference edits in local React state while the user is editing them, then save the complete settings object once when the user presses **Save changes**.

For example, five preference changes would become one Firestore update:

```text
five local changes -> one Save changes press -> one settings document write
```

The save button should:

1. Start with the values loaded from Firestore.
2. Update only local draft state as the user changes controls.
3. Enable when the draft differs from the saved settings.
4. Submit the full settings payload once.
5. Disable after a successful save and show a short confirmation.
6. Show an error and retain the draft if the write fails.

The existing signature comparison should remain as a second protection against no-op writes.

## Tradeoffs and safeguards

Local drafts can be lost if the user closes the app without saving. The UI should make the unsaved state clear and warn before leaving the preferences screen when there are pending changes.

If an autosave experience is preferred later, debounce the save until the user has stopped making changes for several seconds. A debounce still reduces five rapid changes to one write, while avoiding a permanent Save button. The explicit Save button is the most predictable option for quota control.

## Verification after implementation

1. Change several preferences without pressing Save and confirm Firestore receives no settings write.
2. Press Save once and confirm exactly one `settings/main` document update.
3. Press Save again without changing anything and confirm no additional write.
4. Reload the app and confirm the saved values are restored.
5. Compare Firestore Usage Insights after testing. The `settings` write count should grow by one per save, not once per control change.

## Related code

- [Firestore adapter](/Users/aakash/Desktop/ai_projects/expo_workout_tracker/backend/firebase/useWorkoutData.ts)
- [Firestore quota incident](/Users/aakash/Desktop/ai_projects/expo_workout_tracker/docs/firestore-quota-incident-2026-10-16.md)
