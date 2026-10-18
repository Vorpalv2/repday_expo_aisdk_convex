# Declined UPI checkout retry — 18 October 2026

## Report and evidence

During live INR 1 subscription verification, a declined UPI attempt followed by a retry displayed "Transaction ID already exists" inside the UPI app, not in a Repday toast or Firestore error.

Read-only Razorpay API inspection found two failed INR 1 UPI payments on the same order and one subscription in `created` state with `paid_count=0` and `auth_attempts=0`. Both payment records reported `GATEWAY_ERROR`, source `remitter_bank`, step `payment_authentication`, reason `payment_declined`. No successful payment was visible in this inspection. The merchant error description said the bank declined the payment; the records did not specifically prove an incorrect PIN.

Repday passes Razorpay a subscription ID. It does not construct a UPI transaction ID. Multiple failed payments on one Razorpay order are not, by themselves, proof of an invalid integration or the exact cause of a duplicate-reference error in the UPI app.

## Confirmed app-side problem

The browser integration rejected its checkout promise and called `checkout.close()` immediately on every `payment.failed` event. This treated one failed attempt as the end of the entire checkout, interrupting Razorpay's own retry screen. Opening checkout again reused the existing unpaid subscription, as intended by the backend, but the previous failure lifecycle had been forcibly interrupted.

The exact bank/UPI-app duplicate-reference cause remains unconfirmed. The app-side retry lifecycle has been corrected; a real phone retry is still needed to establish whether that resolves the reported UPI message.

## Fix

- Set Razorpay Checkout's `retry.enabled` option explicitly to true.
- Keep checkout open on `payment.failed` so Razorpay can present its native retry/change-payment-method flow.
- Show a failure toast while retaining the active checkout; do not resolve/reject the checkout promise on the failed attempt alone.
- If the customer dismisses checkout, reconcile the subscription once. Return paid access if payment has become confirmed; otherwise report the remembered failure or an ordinary dismissal.
- Ignore late failure/dismissal callbacks after successful verification and deduplicate dismissal reconciliation.
- Do not manufacture UPI transaction IDs, automatically replace subscriptions, cancel mandates, or submit payments in response to an unverified client failure callback.

This change adds no server endpoint or extra database calls for an in-checkout failed attempt. A completed payment still uses the existing signed verification path. Dismissal retains the existing explicit reconciliation request.

## Validation

Six mocked checkout regression tests passed, covering existing paid checkout recovery, test/live dismissal recovery, failure followed by successful retry in one checkout, failure followed by dismissal, and late callback ordering. These tests simulate provider callbacks and do not submit payments.

```sh
node --import tsx --test tests/billing-checkout-recovery.test.ts
npm run typecheck
```

## Real-device verification still needed

Reload the deployed app, use a Free account, and open INR 1 checkout. After a genuine decline, return to Razorpay's payment screen and use its retry/change-payment-method action rather than reopening an old UPI request from the UPI app's history. The user must enter the PIN and authorize payment personally.

Confirm that checkout remains open, the retry is initiated through Razorpay, and Plus activates automatically after successful payment. If the duplicate-reference message persists, retain the payment/order IDs and timestamp privately for Razorpay support; inspect bank/provider error details rather than repeatedly creating or charging subscriptions.

Reference: [Razorpay Standard Checkout integration and retry options](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).
