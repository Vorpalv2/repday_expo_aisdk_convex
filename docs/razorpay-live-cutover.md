# Razorpay live cutover — 18 October 2026

## Current status

Live mode is deployed to https://repday.expo.app using the INR 1 plan below. Immutable deployment: https://repday--acx36u8up4.expo.app.

The live key pair was read from the user-provided RAZORPAY_LIVEAPI_KEY_ID and RAZORPAY_LIVEAPI_KEY_SECRET entries in .env.local. Canonical server variables were uploaded to the EAS production environment with sensitive visibility. Local test credentials were preserved under RAZORPAY_TEST_* names. No credentials are committed.

The live Razorpay API confirmed the plan is monthly, interval 1, INR, and 100 paise. Production rejects an invalid webhook HMAC with 401 and accepts a correctly signed non-subscription no-op with 200. This verifies the deployed signing configuration without changing billing data. Client artifacts were checked for embedded live billing secrets; none were found.

All 48 mocked billing/deletion checks, typecheck, and the web build passed. These checks are not evidence of a successful real payment.

**Pending:** the merchant must enter the prepared RAZORPAY_LIVE_WEBHOOK_SECRET value in Razorpay's live webhook form and submit it. The form is prepared with the production URL and all 10 subscription events. Real webhook delivery, payment, and live cancellation still require end-to-end verification.

The old INR 1 plan was a test-mode object and cannot be used with live credentials. A separate live plan was created in the merchant dashboard:

- Plan: `plan_TpBSwrZKmhJx9M`
- Name: Repday Plus live verification
- Amount: INR 1 (100 paise)
- Interval: once per month
- Linked subscriptions at creation: 0

Creating this plan does not charge anyone or create a recurring mandate.

## Code changes

- Server validates that `RAZORPAY_MODE` and the API key prefix agree (`test`/`rzp_test_`, `live`/`rzp_live_`). Checkout also validates the returned mode/key pair.
- Production checkout and membership copy omit sandbox labels in live mode.
- Live entitlements use verified paid invoice billing end dates. The sandbox 60-second deadline never applies in live mode, even if an old test field is present.
- Old test subscription IDs and paidUntil values do not grant live subscription access or get fetched using live credentials. Manual complimentary access remains available.
- Billing cache keys include the mode, preventing a cached sandbox account from granting live access.
- Each new subscription stores its plan ID and amount alongside the billing account. Switching the configured offer later does not invalidate invoices from an existing subscription's original plan.
- Renewal cancellation retains the verified paid period. Account deletion still cancels renewal immediately before deleting data.
- These changes add no provider calls to ordinary status reads or premium feature checks.

## Production environment

Configure these together before redeploying:

| Variable | Live verification value |
| --- | --- |
| RAZORPAY_MODE | live |
| RAZORPAY_KEY_ID | live key from merchant dashboard |
| RAZORPAY_KEY_SECRET | matching live secret, server-side only |
| RAZORPAY_PLAN_ID | plan_TpBSwrZKmhJx9M |
| RAZORPAY_PLAN_AMOUNT_PAISE | 100 |
| RAZORPAY_WEBHOOK_SECRET | secret matching the live webhook |
| BILLING_ENABLED | true |

Do not commit credentials or expose secrets with EXPO_PUBLIC_. Keep Firebase Admin and other existing production credentials intact. Deploy with `npm run deploy:web:prod` after setting EAS production variables.

## Live webhook

Endpoint: `https://repday.expo.app/api/billing/webhook`.

Use the live-mode dashboard and enable subscription lifecycle events: authenticated, activated, charged, pending, halted, cancelled, completed, paused, resumed, and updated where supported. The endpoint reconciles canonical provider data rather than trusting payload entitlement fields. HMAC verification uses the configured webhook secret. Payment-only events are acknowledged but do not change access.

The merchant must create/download the live API credential if none exists. Browser security requires credential creation to be performed by the user.

## Release verification

Mocked regression checks cover live verification, explicit refresh, webhook processing, cancellation, legacy-test isolation, complimentary access, per-subscription pricing, and the hosted 10-subrequest ceiling. Run typecheck and the billing tests before deployment.

Real-world verification remains pending until someone completes a live payment:

1. Open a free account; check INR 1/month and real checkout mode.
2. Close checkout and retry; verify it resumes without duplicate active subscriptions.
3. Complete the INR 1 payment personally. Verify automatic Plus unlock and activation toast.
4. Inspect live webhook delivery and verified paidUntil; refresh must not impose a 60-second deadline.
5. Cancel renewal; verify a cancellation toast and continued access through the paid period. Confirm no future automatic charge remains after testing.
6. Verify cancellation/reconciliation from another reload. Test expiry using mocked clocks rather than altering a real customer's entitlement.
7. Test account deletion only with an explicitly authorized disposable account.

## Switch back to INR 75

Create a separate INR 75 monthly plan in live mode; set its ID and 7500 paise in EAS production, then redeploy. Existing INR 1 subscriptions retain their original recurring price; changing the offer does not migrate them. Cancel the verification subscription after testing. Never describe these live tests as sandbox or simulated payments.

## Rollback

Use the last known deployment and a consistent test-mode environment if rollback is needed. Do not mix test plan IDs with live keys. Billing status is mode-aware; complimentary grants remain available across modes. No existing live subscription should be deleted or modified merely to roll back the app.
