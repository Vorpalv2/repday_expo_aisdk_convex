# Billing failures caused by the hosting outbound-request budget

## What users saw

On October 17, 2026, the production web app returned “Subscriptions are temporarily unavailable” during checkout and account deletion. More specific diagnostics exposed “Too many subrequests by single Worker invocation” during Firestore reads/transactions.

This is a hosting request-budget error. It is distinct from Firestore's daily document read/write quota. Recreating the Firebase account cannot fix the hosting limit.

## Diagnosis and why the first patch was incomplete

Authenticated status reads succeeded while checkout preparation failed. Local adapters also succeeded, because the local Node runtime did not enforce the hosted request budget.

An initial patch removed redundant work when resuming an existing unpaid checkout. That path returned 200 in production, but it did not verify a brand-new checkout. After the account was deleted and recreated, the new Firebase UID took the new-checkout path, which still exceeded the limit.

A temporary authenticated preview measured the limit without reading or writing billing records. After one successful Firebase session verification request, nine lightweight outbound probes succeeded; the next fetch failed. Repeating the probe produced the same result. This measured a budget of **10 outbound fetches per API invocation** on this deployment. It is an observation about this hosting configuration, not a universal Cloudflare limit.

The diagnostic endpoint was removed before the final production deployment.

## Fix

### Conditional writes instead of avoidable transaction round trips

Billing account reads now return Firestore's document updateTime. Checkout uses an atomic conditional commit that succeeds only if that version is unchanged. A missing document uses an exists:false precondition. The lease commit returns the next version, which protects the final account-and-subscription-mapping commit.

This preserves concurrency protection against overlapping checkout, deletion and complimentary-access changes, while avoiding beginTransaction/read/commit sequences for each stage. Precondition failures return HTTP 409 and require a new request instead of spending the remaining Worker budget retrying internally.

Payment reconciliation also compares the account version and atomically writes the account and webhook receipt. It cannot overwrite a newer account state using an older snapshot.

### Return the state already written

Payment verification and renewal cancellation return the resulting account state directly. They do not invalidate a cache, query it again, read Firestore again and repopulate it before returning the response.

Cancellation preserves the previously verified paidUntil timestamp. Cancelling renewal does not revoke the remainder of a paid period. Deletion preparation still cancels renewal as required by that workflow, but skips an invoice reconciliation immediately before account removal.

### Bound optional network work

The billing rate limiter uses one atomic Redis Lua request. Billing cache commands disable SDK retries and automatic pipelining and have a bounded timeout. An optional cache failure does not run a chain of retries before the authoritative storage request.

Ordinary billing status requests only read entitlement state. They no longer trigger provider invoice reconciliation when paidUntil is missing or expired. Signed checkout verification and webhooks reconcile payment data; the backend and frontend derive expiry from paidUntil. Explicit **Refresh access** uses a separate authenticated `/api/billing/refresh` request to fetch canonical provider state. It shares the initial versioned account snapshot with reconciliation, avoiding an extra read. The per-account 60-second sandbox cap and complimentary access behavior remain in place.

### Completed payment with a stale `created` record

A later user test completed a ₹75 sandbox payment: Razorpay was `active` with a paid invoice, but Firestore remained `created` with no paidUntil. Ordinary status reads could not repair that record after automatic invoice reconciliation was removed. A checkout retry correctly refused another subscription but exposed a dead-end error.

Checkout now returns the machine-readable `SUBSCRIPTION_REFRESH_REQUIRED` code for this case. The client handles it by invoking `/api/billing/refresh` in a separate HTTP request, then accepts the recovered premium status without opening another checkout. Checkout dismissal also makes a single reconciliation request to recover a payment whose external checkout callback was missed. The Profile **Refresh access** button uses the same reconciliation path. None of these recovery actions starts another subscription or requires another payment.

Checkout verification may retry a 409 conflict as a separate HTTP request. It never extends the saved sandbox deadline.

## Request counts

The following mocked route-level checks run the real auth, billing and Firestore REST adapter code with a hard 10-fetch cap and an empty OAuth/cache state. They include authentication, rate limiting, OAuth authentication, provider requests, database operations and cache commands.

| Cold path | Outbound fetches |
|---|---:|
| New checkout, no prior subscription | 9 |
| Resume existing unpaid checkout | 5 |
| Replace cancelled unpaid checkout | 10 |
| Verify signed payment, one invoice page | 9 |
| Explicit refresh / completed-payment recovery, one invoice page | 9 |
| Signed subscription webhook, one invoice page | 9 |
| Cancel renewal and return paid entitlement | 8 |
| Prepare billing for account deletion | 8 |
| Read status with a cache miss | 5 |

A second invoice page adds one fetch. Exceptional upstream failures or concurrent changes may require the caller/provider to retry in a new HTTP request; successful-path budgets do not guarantee all external services are available.

Outbound fetch counts are not Firestore billable document operation counts. One Firestore commit can update more than one document and be billed for each write.

## Verification

The production failure was reproduced using the supplied demo account. The full fix was then deployed to a preview using production configuration. New checkout preparation returned HTTP 200, and an immediate retry returned HTTP 200 with the same unpaid subscription ID. No test payment was submitted during that verification.

Regression checks cover request budgets, expired access, the 60-second sandbox deadline, webhook ownership/replay handling, manual Plus access, concurrency conflicts and cancellation preserving paidUntil. All payment/cancellation/deletion scenarios in these regression tests use in-memory mocks. No Playwright tests were run.

A real completed payment, real webhook delivery and actual account deletion were not exercised during the final verification. The earlier single successful checkout retry was insufficient evidence to call the whole flow fixed; future verification must include the cold new-account path.

## Production recovery verification

After deploying the explicit refresh/retry recovery on October 17, the existing paid demo subscription was reconciled through the real Profile **Refresh access** button in the production browser. The page changed to **Membership active**, displayed the paid-through date of November 17, 2026, and removed the Plus locks from Cyberpunk, live sync and the plan builder without another page reload. A read-only Firestore check confirmed status active and the invoice-derived paidUntil. No new payment, cancellation or account deletion was submitted. The recovery regression checks passed with 26 mocked tests and a successful TypeScript check.
