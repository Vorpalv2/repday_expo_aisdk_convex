# Repday documentation

The documentation is grouped by the kind of decision or workflow it describes.

## Architecture and data

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

## Product and implementation guides

- [Training plan builder](guides/training-plan-builder.md)

## Incident reports and follow-ups

- [Firestore quota incident](incidents/firestore-quota-incident-2026-10-16.md)
- [Billing worker subrequest incident](incidents/billing-worker-subrequest-incident.md)
- [UPI checkout retry incident](incidents/upi-checkout-retry-incident.md)

The broader product and screen design notes remain in [`app_design_flow`](../app_design_flow/README.md), while backend implementation notes remain in [`backend`](../backend/README.md).
