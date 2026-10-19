# Repday documentation

The documentation is grouped by the kind of decision or workflow it describes.

## Architecture and data

- [Startup hydration and recovery](architecture/startup-hydration.md)
- [Performance diagnostics and verification](architecture/performance-diagnostics.md)
- [App-wide database I/O reference](architecture/app-database-io-reference.md)
- [Database I/O case study](architecture/database-io-case-study.md)
- [Firestore optimization guide](architecture/firestore-optimizations-and-caching.md)
- [Split revision cache](architecture/split-revision-cache.md)
- [Earlier cache/live-sync design](architecture/cache-first-splits-history-live-sync.md)
- [Settings preference write amplification](architecture/settings-preference-write-amplification.md)
- [Application data flow](architecture/app-data-flow.svg) and [focus draft data flow](architecture/focus-draft-data-flow.svg)

## Billing and subscriptions

- [Subscription flow](billing/subscription-flow.md)
- [Razorpay setup](billing/razorpay-setup.md)
- [Razorpay live cutover](billing/razorpay-live-cutover.md)

## Notifications and server infrastructure

- [Upstash Redis and QStash architecture](notifications/upstash-redis-qstash.md)
- [QStash job lifecycle](notifications/qstash.md)
- [Web rest notifications](notifications/web-push.md)

## Deployment and configuration

- [Production and configuration](infrastructure/production-and-configuration.md)

## Frontend and product flows

- [Onboarding](frontend/onboarding.md)
- [Active workout](frontend/active-session.md)
- [Workout splits](frontend/split-management.md)
- [History and progress](frontend/history-and-progress.md)
- [Workout import](frontend/workout-import.md)
- [Exercise catalog and search](frontend/exercise-catalog-and-search.md)
- [Form Coach / Pose Coach](frontend/pose-coach.md)
- [Mobile pose coach debugging](frontend/mobile-pose-coach-debugging.md)

## Backend and data model

- [Authentication and account ownership](backend/auth-and-account-ownership.md)
- [Local and cloud sync](backend/local-and-cloud-sync.md)
- [Firestore data model](backend/firestore-data-model.md)

## Analysis and product decisions

- [AI development token cost report](analysis/ai-development-token-cost-report.md)
- [Premium features](analysis/premium-features-breakdown/README.md)

## Product and implementation guides

- [Training plan builder](guides/training-plan-builder.md)

## Incident reports and follow-ups

- [Firestore quota incident](incidents/firestore-quota-incident-2026-10-16.md)
- [Billing worker subrequest incident](incidents/billing-worker-subrequest-incident.md)
- [UPI checkout retry incident](incidents/upi-checkout-retry-incident.md)

The documentation is self-contained under this directory. Frontend, backend, analysis, architecture, billing, infrastructure, notification, guide, and incident notes are grouped above by the area they describe.
