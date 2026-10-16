# Guided training plans

## User flow

New accounts reach the builder after the existing onboarding preferences. The five steps collect experience and goal, 2–6 days per week with exact weekdays, 30/45/60-minute session preference, equipment, and an optional focus. The final step previews all seven days; workout cards expand to show exercises, sets, reps and rest. Users can skip and build their own splits.

Profile → Build a training plan opens the same builder with the last saved choices. Saving changes the weekly schedule and appends independent new splits; old splits and workout history are retained. The action is disabled during an active workout.

## Catalog and selection

`planTemplates/catalog-v1` in Firestore stores the versioned curated catalog. Authenticated clients can get this published document; client listing and writes are denied. Administrative access is required to publish or edit templates. `data/plans/catalog.json` is the matching bundled fallback when the network/catalog is unavailable.

Templates cover full-body training for 2/3 days, upper/lower for 4 days, upper/lower + push/pull/legs for 5, and push/pull/legs for 6. Structured tags support balanced, upperbody, chest, shoulders, back, legs and core. A deterministic selector substitutes equipment-compatible movements, removes duplicate substitutions, limits exercises by session length, sets starting reps from the goal, and adds one focus set in applicable workouts. Session duration is an estimate, not a measured completion time.

Equipment options: full gym; dumbbells and a bench; home with bodyweight, resistance bands and a sturdy chair. Beginner starting volume is two sets; experienced users with longer sessions start at three. Weight is 0 until the user chooses and logs a starting load. Existing rest-time and weight-unit preferences remain applicable.

## Saved account data

A single Firestore batch writes:

- `users/{uid}/splits/{generatedSessionId}`: editable session copies with unique IDs and positions.
- `users/{uid}/settings/main`: seven-day `weeklyPlan`, selected session, cleared daily edit draft, an onboarding activity-tracking start date/cursor, and `guidedPlan` metadata (installation ID, template ID/version, preferences, creation timestamp).

Shared templates are never edited by saving a user plan. A failed/retried save uses the same preview IDs and cannot create duplicate splits. The current weekly schedule is replaced only when the user presses Use this plan / Save new plan. Local app storage continues to cache the copies through the existing persistence flow.

`repday.onboardingOwner` scopes onboarding resumption to the new account. Refresh during onboarding resumes that account's saved step. `repday.planDraft.{uid}` preserves builder choices, preview IDs and the current builder step until saving or skipping completes. Completion is recorded only after the selected plan's batch has succeeded.

## Maintenance and checks

Keep the bundled catalog and published Firestore catalog in sync. Publish a new schema/document version before making incompatible changes. Template names and slots are curated source data, not model-generated workouts. Exercise names, media and English instructions come from the app's existing [exercises dataset](https://github.com/hasaneyldrm/exercises-dataset).

Plan structure follows the [ACSM 2026 guidance](https://acsm.org/resistance-training-guidelines-update-2026/) to cover all major muscle groups, prioritize consistency, and keep starting routines manageable. The exact templates are Repday's implementation choices, not individual prescriptions from ACSM.

Run `npx tsx --test tests/training-plan.test.ts` for schedule, focus, equipment, independence and invalid-input coverage. Browser QA covers onboarding, refresh resumption, preview, cloud persistence, rebuild, and catalog access rules using a disposable test account.

Automatic rest tracking starts on the account’s first app use, never by retroactively classifying yesterday. New guided onboarding saves its start timestamp with the plan; rebuilding a plan keeps that tracking boundary. Legacy automatic entries before account creation are repaired to false without changing manual rest choices. Weekly Activity’s planned-day count comes from the recurring weekly plan; historical rest exceptions do not change that count.
