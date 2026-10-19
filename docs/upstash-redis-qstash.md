# Upstash Redis and QStash in Repday

Repday uses two Upstash services for short-lived server infrastructure:

- **Upstash Redis** is the fast, shared state layer for caches, rate limits, and web-push coordination.
- **Upstash QStash** is the durable delayed-delivery layer for rest-reminder callbacks.

They complement Firebase rather than replace it. Firebase Authentication and Firestore remain the authoritative systems for identity and workout data. Redis and QStash hold operational state that is temporary, request-oriented, or safe to recreate.

## Why these services are separate from Firestore

Firestore is the source of truth for user-owned records such as splits, settings, completed workouts, Coach conversations, and billing records. Those records need durable document semantics and security rules.

Redis is better suited to values that are read or updated frequently, expire naturally, or must be changed atomically while a request is in flight. QStash is better suited to “call this HTTPS endpoint later” work that must survive a closed browser or a short-lived server invocation.

Using these services keeps high-frequency coordination out of Firestore and avoids requiring a long-running worker process in the Expo web deployment.

## Where Upstash Redis is used

| Area | Code | Redis data | Lifetime and purpose |
| --- | --- | --- | --- |
| Billing entitlement cache | `lib/server/billingCache.ts` | `repday:billing:account:v2:<mode>:<uid>` | Paid accounts are cached for up to four hours, bounded by `paidUntil`; free, expired, missing, and manual-access states use a five-minute TTL. Firestore remains authoritative. |
| Billing/subscription request limits | `lib/server/billingAuth.ts` | `repday:<bucket>:rate:v2:<uid>:<minute>` | Atomic rolling-minute counters protect billing, split, and other subscription endpoints from repeated changes. |
| AI Coach limits | `app/api/_lib/aiRateLimit.ts` | `repday:ai:coach:<uid>` | Ten Coach requests per user per rolling minute before the request reaches the model gateway. |
| Workout-note import limits | `app/api/_lib/aiRateLimit.ts` | `repday:ai:workout-import:<uid>` | Five AI imports per user per rolling hour. |
| Web-push registration | `lib/server/webPush.ts`, `app/api/push/subscription+api.ts` | `repday:push:<uid>:<deviceId>` | Stores the validated browser subscription and expires it after 90 days without reconnecting. |
| Web-push timer state | `lib/server/webPush.ts`, `app/api/push/timer+api.ts` | The same per-device hash | Stores the current timer revision, timer ID, deadline, lease, and delivered marker. Redis Lua scripts reject stale updates and fence duplicate deliveries. |
| Web-push delivery | `app/api/push/deliver+api.ts` | The same per-device hash | Atomically claims a delivery lease, checks the current timer, marks successful delivery, and removes dead subscriptions. |

The key prefixes are intentionally scoped by feature. A Coach limit cannot consume a push limit, and test/live billing cache entries cannot collide.

### Redis atomicity in Repday

The timer and billing-limit paths use Lua scripts so the read/compare/write sequence happens inside Redis. For example, a late timer request cannot overwrite a newer revision, and two simultaneous requests cannot both pass a limit using the same stale counter.

This is coordination state, not a second workout database. Repday does not store splits, set/rep history, or Coach transcripts as the authoritative record in Redis.

## Where Upstash QStash is used

QStash currently has one job: delayed web rest reminders.

1. The browser registers a Web Push subscription with Repday.
2. Starting or changing a rest sends a device ID, monotonic revision, and deadline to `POST /api/push/timer`.
3. The API updates the current timer in Redis, then publishes a QStash message with `notBefore` set to the rest deadline.
4. QStash calls `POST /api/push/deliver` over public HTTPS when the message is due.
5. The callback verifies the QStash signature, claims the matching Redis timer, encrypts a Web Push payload, and sends it to the browser push service.
6. The service worker displays the notification when the platform accepts it.

The QStash payload contains only the authenticated user ID, device ID, timer ID, and deadline. It does not contain Firebase tokens, subscription encryption keys, VAPID private keys, or workout details.

Repday invalidates an old timer in Redis instead of trying to delete the already-published QStash message. If that old message is delivered later, the callback sees that its timer ID is stale and exits without sending a notification.

QStash signs callbacks. Repday verifies the signature, exact body hash, and expected callback URL using the current or next signing key so key rotation can happen without an interruption.

## Benefits

### Upstash Redis

- **Low-latency shared state:** API instances can coordinate through one regional Redis endpoint.
- **Expiration built in:** entitlement caches, device subscriptions, counters, leases, and timer state clean themselves up.
- **Atomic operations:** Lua scripts provide compare-and-set behavior for limits and timer revisions.
- **Cost control:** billing cache hits avoid repeated Firestore entitlement reads; rate limits prevent unbounded model and billing traffic.
- **Serverless fit:** REST access works from Expo/EAS API routes without a persistent Redis connection or worker.

### Upstash QStash

- **Survives a closed browser:** the server does not need the workout screen or a JavaScript timer to remain open.
- **No worker to operate:** QStash owns delayed delivery and retries the callback.
- **Signed HTTP callbacks:** the delivery endpoint can authenticate the job without receiving a Firebase ID token.
- **Simple deployment model:** the existing public EAS API can receive the callback; no separate queue consumer is required.

## Tradeoffs and limits

### Redis tradeoffs

- **It is not authoritative.** Cache loss or expiry must fall back to Firestore. A Redis outage therefore makes billing checks and AI/push endpoints fail closed or become temporarily unavailable; it must never grant access by default.
- **Eventual cache freshness.** Billing cache entries can be stale until their TTL expires, except mutation paths explicitly invalidate them. Entitlement changes should invalidate the key after checkout, cancellation, verification, or webhook updates.
- **Regional latency and availability.** A REST call adds network latency and can fail independently of Firebase. The billing cache uses a short timeout and no SDK retries to avoid consuming the hosting runtime's outbound-call budget.
- **Usage is separate from Firestore billing.** Redis commands, Lua requests, and QStash messages have their own quotas and pricing. “Zero Firestore reads” does not mean zero infrastructure traffic.
- **Rate limits are approximate windows.** The Upstash sliding-window limiter uses bucketed counters. It is appropriate for abuse protection and product quotas, not financial accounting.
- **Key hygiene matters.** Keys contain stable user/device identifiers, so credentials remain server-only and values must not include unnecessary personal data.

### QStash tradeoffs

- **Scheduling is not display confirmation.** A successful QStash job means the callback was accepted and processed; it does not prove that a phone displayed the notification.
- **Delivery is at least once.** Retries and network failures can produce duplicate callback attempts. Redis timer IDs, leases, delivered markers, QStash deduplication IDs, and the service worker's local guard reduce duplicates without claiming exactly-once delivery.
- **Cancellation is logical.** Replaced or skipped timers can still consume scheduled-message usage because Repday invalidates them in Redis rather than removing the queued message.
- **Public HTTPS is required.** QStash cannot call a private localhost address. Preview deployments need an origin and environment that match their own callbacks.
- **Deadline precision is bounded.** Repday stores deadlines in milliseconds, while QStash schedules in seconds and rounds upward. Browser, push-service, OS, and battery behavior can add delay.
- **Credentials and signing keys are operational dependencies.** Missing tokens, signing keys, or the correct origin disable web push; these values must stay in server-side EAS environment variables.

## Failure behavior

| Failure | Repday behavior |
| --- | --- |
| Billing-cache miss | Read the authoritative Firestore billing account and repopulate Redis. |
| Billing-cache error | Fall back to Firestore; do not authorize from an unavailable cache. |
| AI Redis unavailable | Return HTTP 503 so the request cannot bypass the usage limit. |
| Billing or push limit Redis unavailable | Return a temporary-unavailable response. |
| QStash publish fails | Invalidate the Redis timer and tell the user that the alert could not be scheduled. |
| Unsigned or wrong-destination QStash callback | Reject it before reading the subscription or sending push. |
| Stale or duplicate callback | Return success without sending a notification. |
| Push endpoint returns 404/410 | Remove the expired Redis subscription. |

## Environment variables

These are server-side values. They must not use an `EXPO_PUBLIC_` prefix or be committed to the repository.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Redis clients and limiters | Upstash Redis REST endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | Redis clients and limiters | Redis REST credential. |
| `QSTASH_TOKEN` | `enqueueRestAlert` | Publishes delayed callback messages. |
| `QSTASH_CURRENT_SIGNING_KEY` | `verifyPushDelivery` | Verifies current callback signatures. |
| `QSTASH_NEXT_SIGNING_KEY` | `verifyPushDelivery` | Allows signing-key rotation. |
| `WEB_PUSH_ORIGIN` | Push configuration and callback verification | Exact public HTTPS origin receiving QStash callbacks. |

## Testing and observability

The normal test suite mocks Upstash requests. `tests/web-push.test.ts` covers validation, signature checks, timer transitions, duplicate suppression, retries, expiry, and opt-out. The Redis integration test is opt-in:

```bash
RUN_PUSH_REDIS_TESTS=1 npm run test:push
```

That integration test uses disposable `qa-push-*` keys and deletes them afterward. QStash publishing, Firebase token verification, the browser push service, and actual phone display remain separately mocked or require device verification.

For production debugging, inspect the API logs together with the Upstash Redis and QStash dashboards. A QStash message marked delivered confirms callback processing, not that the user's operating system displayed the alert.

## Related documentation

- [QStash job lifecycle](qstash.md)
- [Web rest notifications](web-push.md)
- [AI request rate limiting](../app_design_flow/system%20design/ai-rate-limiting.md)
- [Subscription flow and billing cache](subscription-flow.md)
- [App-wide database I/O reference](app-database-io-reference.md)

