# App flow map

Use this folder to understand how a user action travels through Repday's frontend, backend, and infrastructure. These docs describe the checked-in implementation; where a capability is only partially wired, the doc calls that out.

## Frontend

- [Onboarding](frontend/onboarding.md) — sign-in, first-run preferences, and settings sync.
- [Active workout](frontend/active-session.md) — session state, device persistence, finish, discard, and the current Firebase-sync gap.
- [Workout splits](frontend/split-management.md) — create, edit, reorder, plan, and delete splits.
- [History and progress](frontend/history-and-progress.md) — finish records, Firebase history, progress views, and deletion.
- [Workout import](frontend/workout-import.md) — shared/pasted notes, on-device parsing, AI parsing, review, and save.
- [Exercise catalog and search](frontend/exercise-catalog-and-search.md) — upstream catalog loading, local filtering, list virtualization, and the current non-paginated scrolling behavior.
- [Form Coach / Pose Coach](frontend/pose-coach.md) — active-session entry, browser camera and MediaPipe inference, movement rules, rep feedback, privacy, and native-platform limits.

## Backend

- [Authentication and account ownership](backend/auth-and-account-ownership.md) — Firebase Auth lifecycle and UID-based access.
- [Local data and Firebase sync](backend/local-and-cloud-sync.md) — startup hydration, owner changes, legacy import, and write behavior.
- [Firestore data model](backend/firestore-data-model.md) — user documents, subcollections, and Storage paths.

## Infrastructure

- [Production and configuration](infrastructure/production-and-configuration.md) — EAS Hosting, Firebase rules, AI Gateway, Upstash, and environment variables.
- [AI request rate limiting](<system design/ai-rate-limiting.md>) — Redis counters, weighted sliding windows, and AI request gates.
