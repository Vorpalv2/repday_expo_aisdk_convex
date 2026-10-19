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

## Follow-up inspection after the retry fix

The user reported that BHIM still displayed the duplicate-transaction message after the checkout lifecycle fix. A second read-only inspection found three distinct failed Razorpay payment IDs, all attached to the same original subscription authorization order and invoice. Every payment reported remitter-bank `payment_declined` during `payment_authentication`. The subscription remained `created`, with zero paid periods and zero recorded authentication attempts. The issued invoice had zero paid and 100 paise due, with no billing start/end.

The affected Firestore billing document was inspected by its existing subscription owner mapping. It contained subscription/status/plan/amount/lease/expiry fields. It did not contain a BHIM transaction ID or UPI payment-reference field. `paidUntil` was null.

This narrows the diagnosis: each retry already produces a different Razorpay payment ID, while the subscription's original authorization order is reused. Firebase's saved subscription ID participates in resuming that checkout, but does not itself generate or store the BHIM transaction ID. The underlying BHIM/NPCI duplicate reference is not exposed by these merchant API responses, so its exact cause is still unconfirmed.

A controlled fresh authorization order is a possible next recovery test. It must be restricted to a provider-verified unpaid, unauthenticated checkout and must not replace an active or paid subscription. No cancellation, new subscription, payment, or database mutation was performed during this follow-up inspection.

## Reproduction with a newly created authorization

The user deliberately entered an incorrect PIN in a newly created payment flow and reported the same BHIM duplicate-reference error on retry. Read-only provider inspection confirmed the original unpaid subscription had been cancelled and a different subscription/order created. This rules out the explanation that the user had merely reopened the original subscription.

A more detailed payment API inspection exposed `acquirer_data.upi_transaction_id` and `rrn`. Reference values were compared locally without printing or committing them:

- Four failed payments were visible across two authorization orders.
- All four had different UPI transaction IDs and different references within their orders.
- The original order had three failed payments with three different UPI transaction IDs and three different RRNs.
- The new order had one recorded failed payment. The BHIM duplicate-reference retry was not represented as a distinct second payment on that new order at inspection time.
- Razorpay continued to classify recorded attempts as remitter-bank `payment_declined`; it did not return a duplicate-reference reason for those records.

This corrects the earlier suspicion: reusing an authorization order does not by itself reuse a UPI transaction ID. Firebase/order replacement is not established as the root fix. The remaining failure may involve the UPI intent handoff or BHIM/bank-side request state, but merchant API data cannot identify that layer conclusively. The next investigation requires a BHIM screenshot/timestamp and provider trace, or a user-performed comparison with another supported UPI app using the normal checkout flow. No support message was sent on the user's behalf.

A disposable sandbox-only subscription was also created to check cancellation semantics. Razorpay rejected `cancel_at_cycle_end=true` for a `created` subscription because no billing cycle was running; the disposable sandbox subscription was then cancelled immediately for cleanup. This did not affect the live subscription. No automatic live restart/cancellation implementation was added, since immediate cancellation can race with authorization and the available evidence does not establish that such replacement is necessary.

## Google Pay reproduction and mandate status inspection

The user later reproduced the error in Google Pay as "the autopay that you are trying to create already exists". This rules out attributing the issue solely to BHIM.

Read-only customer-token API inspection distinguished two states:

- A successful INR 1 captured payment now has a UPI token with `recurring=true`, `recurring_details.status=confirmed`, and the subscription is active. Its Firebase account correctly has active paid access through 18 November 2026 at 00:00 IST.
- The newest failed INR 1 payment has a separate UPI token with `recurring=false`, `recurring_details.status=rejected`, and failure reason `MANDATE CREATION DECLINED BY REMITTER BANK`. Its subscription remains created and Firebase correctly has no paid period.
- The active subscription and newest failed checkout belong to different Repday account owners. They must not be merged, cancelled, or treated as duplicate billing for one application account merely because the same tester is operating them.

The presence of one legitimate confirmed mandate does not prove it is the specific mandate Google Pay considers duplicated. The merchant API reports the failed attempt as rejected, while the UPI app reports an existing AutoPay. Resolving that discrepancy requires the bank/NPCI/Razorpay mandate reference trace; the responses inspected do not establish the duplicated UMN or the exact origin of the mismatch. A support draft was prepared locally, but no message was sent and no token or mandate was cancelled.

## Deletion versus cancellation, and dashboard trace limit

The failed payment's Razorpay Dashboard detail was inspected as well as its API response. It exposes the same gateway classification (`remitter_bank` / `payment_authentication` / `payment_declined`) and bank RRN, with no additional explanation of the duplicate AutoPay response. Merchant dashboard/API access does not provide the bank/NPCI internal request trace needed to identify the disputed mandate reference.

Razorpay's published subscription operations include cancellation rather than hard deletion of subscription/payment history. Its UPI token documentation explicitly distinguishes deletion from mandate cancellation: deleting a token only removes the Razorpay database record and does not cancel the mandate at NPCI. NPCI mandate cancellation is a separate `PUT /customers/:customer_id/tokens/:token_id/cancel` operation. Therefore deleting provider records is not a reliable way to clear a bank-side existing-mandate error, and loses useful diagnostic evidence.

A possible application recovery flow would retain the audit history, verify the initial authorization is unpaid and rejected with no authorized/pending/captured payment or confirmed mandate, cancel only that abandoned authorization/subscription as appropriate, confirm the cancellation state, and then create a new subscription for an explicit Retry payment action. It must not run for failed recurring debits, paid subscriptions, or uncertain/pending authorization. It remains a recovery proposal, not a proven root-cause fix or a deployed feature. No live provider record was deleted or cancelled during this investigation.

Source: https://raw.githubusercontent.com/razorpay/markdown-docs/master/api/payments/recurring-payments/upi/tokens.md (Delete Tokens and Cancel Token sections).

## Initial recovery implementation: explicit Retry payment (18 October 2026)

Close the failed Razorpay checkout and open the Plus popup. **Retry payment** is shown for an outstanding created subscription or after a failure in this popup. Normal checkout retries remain available. A failure callback never automatically cancels a subscription.

The new authenticated `/api/billing/retry-checkout` endpoint runs a staged recovery:

1. `prepare` reads the versioned billing account and provider subscription. It requires an owned initial `created` subscription with zero paid payments, zero successful authorizations, no billing period, one issued unpaid invoice, and only failed UPI payments on its order.
2. `verify` checks each payment's customer token in batches of two. Every token must report `recurring: false` and a rejected or cancelled authorization. Confirmed, initiated, paused, missing or ambiguous states block recovery.
3. `retire` acquires a conditional account lease, rechecks the subscription and order payments, then immediately cancels only this rejected unpaid subscription. The cancellation response must confirm cancellation without paid/authorized activity. A conditional account write records the result and invalidates the billing cache.
4. Only a successful recovery permits the existing subscribe endpoint to create a fresh subscription and open checkout. If the account acquired paid access, the client reconciles access instead.

Progress proofs are HMAC signed, bound to account, environment, subscription, order, customer, token list and Firestore document version, and expire after 60 seconds. A replay after an account change fails. The reservation expires after 60 seconds if cleanup cannot complete. A concurrent webhook can release the reservation when it observes authorization, activation or a terminal state; conditional writes prevent recovery from overwriting that update. If provider cancellation succeeds but the final account update loses a race or times out, retry/refresh reconciles the terminal provider state before another checkout can be created.

No payment history or token record is deleted. This endpoint does not cancel confirmed bank mandates. Provider state can still change between remote requests; checks reduce this race but cannot provide a transaction spanning Razorpay and Firestore.

### Hosted request budget and database impact

The cold successful request paths, including Firebase authentication and Redis rate limiting, use approximately 7 outbound calls for preparation, up to 4 for each token verification batch, and 10 for retirement. Creating the replacement uses the existing separate subscribe request, at most 10 calls for a cancelled subscription. Splitting these phases avoids the previously encountered Worker subrequest limit. Authentication fallback/retries can consume additional calls during network faults; those failures must be retried rather than reported as successful recovery.

Preparation reads one billing account document; token verification reads only Razorpay. Retirement reads the account and writes a reservation plus the final cancellation state. Error cleanup can add one conditional write. Replacement subscription creation and normal verification/webhooks retain their existing database costs. This flow runs only on explicit retry, not while idle.

### Verification and remaining live check

Mocked route/client tests cover the ordered recovery, cold request budgets, confirmed/pending token rejection, pending/authorized/captured payment rejection, paid access, conditional-write conflict, proof tampering, mode mismatch, expiration and incomplete proof replay. TypeScript is checked. These tests do not charge money or cancel live subscriptions.

A real phone test remains necessary: intentionally decline one initial authorization, close checkout, select Retry payment, then approve the newly opened checkout. Verify the new subscription ID, activation without reload, and no duplicate charge/active mandate. A new subscription does not guarantee that a bank/NPCI-side duplicate mandate record clears immediately; if the error persists, the provider needs to trace the recorded payment/token references.


## Follow-up: automatic checks on Continue checkout

The separate Retry payment button has now been folded into **Continue checkout**. No page reload, manual Refresh access, or separate cleanup action is required. The older explicit-button description above records the first implementation.

The subscribe response now identifies an existing checkout with `resuming: true` using the provider/account reads it already performs. The client runs the same staged authorization checks before reopening that checkout. A brand new checkout opens directly without this extra recovery sequence.

- No invoice or no payment attempts: reuse the existing unpaid checkout, with no cancellation.
- Confirmed rejected/cancelled UPI authorization and failed payments only: retire the rejected subscription, create a new subscription, then open its checkout.
- Paid or changed authorization: automatically reconcile billing; if Plus is active, update access without opening checkout.
- Pending, confirmed-but-unpaid, or ambiguous authorization: do not cancel or create a replacement; automatically reconcile access and display a wait-and-continue message if payment is not complete.

All safeguards, expiring proofs, conditional writes and per-request budgets remain in place. The automatic check requires additional account/provider reads when resuming checkout, and the final subscribe request revalidates the account before opening it. These checks only run on the user's checkout action, never in an idle loop or directly from `payment.failed`. Closing checkout still reconciles payment as before. The app does not delete failed transactions; Razorpay retains payment history, and cancellation applies only to the verified rejected unpaid subscription. The live phone retry remains a required verification of bank-side behavior.

## Production browser reproduction: mixed authorization states

On 18 October 2026, Continue checkout was exercised in the user's logged-in production side-browser account. The rendered result was: “Payment authorization is pending or could not be safely reset. Please wait a little, then continue checkout again.” No checkout opened and no live cancellation/deletion was performed during this investigation.

Read-only provider inspection found three failed UPI payments on the same initial subscription/order. The first and most recent authorization tokens were rejected, but the middle attempt's token remained `recurring: false` with `recurring_details.status: initiated` and no failure reason. The subscription still reported `created`, `paid_count: 0`, `auth_attempts: 0`, and no billing period; its invoice remained issued and unpaid.

The specific blocker is the all-token verification guard: a failed payment does not establish terminal rejection of its mandate. One unresolved older token blocks automatic retirement even when the newest token is rejected. The generic client error conceals this distinction. The implemented recovery handles fully rejected attempts but does not cancel unresolved NPCI mandate authorizations. At the time of this reproduction, the mixed-state case remained unresolved. The subsequent correction below distinguishes abandoning a failed subscription checkout from cancelling a bank mandate; this supersedes the initial recommendation to wait for every inactive token to become terminal.

## Correction: abandon the failed subscription checkout, not its inactive token

The user explicitly authorized cancelling the affected failed transaction/authorization. A guarded live call to the documented UPI token cancellation endpoint returned HTTP 500 (`SERVER_ERROR`); a subsequent read still showed the token as `initiated`. No token cancellation was confirmed, and no token/payment record was deleted. The initial attempted mutation had been blocked by automatic approval review; it was only retried after the user's explicit authorization.

The corrected application recovery distinguishes a **pending payment** from an **inactive initiated token left behind by a failed payment**. The latter does not require treating the failed payment itself as pending. Recovery may now abandon the *subscription checkout* when all of these conditions hold:

- The owned subscription is initial `created`, with `paid_count: 0`, `auth_attempts: 0`, and no billing period.
- Its one invoice is issued and unpaid.
- Every order payment is terminal `failed` UPI, belongs to the subscription customer, and has a token.
- Every inspected token is `recurring: false` and `rejected`, `cancelled`, or `initiated`. Confirmed, active, paused or unknown token states still block recovery.

After signed proof verification, retirement acquires the existing conditional account lease, rechecks the subscription and complete payment/token-ID list, cancels the unpaid subscription immediately, and requires a cancellation response with zero paid/authentication activity. Only then can the separate subscribe request create a new subscription ID. This remains within the ten-call cold request limit and performs no token cancellation or deletion. An unpaid `created` payment, an authorized/captured payment, an active mandate, a paid subscription, or concurrent account change remains ineligible.

Cancelling the subscription abandons that checkout; it is not a claim that NPCI's token record was erased or revoked. Razorpay documents that cancelled subscriptions cannot restart. Any remaining duplicate mandate error in the new checkout still requires bank/provider tracing; a new ID is not a guarantee that the UPI app's record clears. Regression tests reproduce the observed three-payment rejected/initiated/rejected token mixture and protect actual pending/successful payments and active mandates.

### Production result after the correction

Deployed to production (`repday--2d1mn5sx74.expo.app`) and exercised Continue checkout in the same authenticated side-browser account. The old failed initial subscription became `cancelled`, with `paid_count: 0` and `auth_attempts: 0`. A different live subscription ID was created on the existing INR 1 monthly verification plan, with status `created` and zero payments. Razorpay checkout opened successfully instead of showing the recovery error. Testing stopped before submitting any payment. This verifies the failed-checkout replacement; a phone/UPI payment remains user-operated and the bank-side duplicate-mandate response has not been retested by the agent.

The final code does not use the failing token-cancellation endpoint. No token/payment history was deleted. Automated validation: 73 billing/auth/cache/lifecycle/recovery/deletion tests and TypeScript checks passed. The recovery cancellation path retains the ten-outbound-call cold limit.

### User-performed three-attempt UPI retest

After the deployed correction, the user intentionally entered the wrong PIN twice, then used the correct PIN on the third attempt. The third attempt still showed Google Pay's “Autopay already exists” message. Read-only live provider inspection confirmed that each of these three attempts used a different subscription ID. The first two replacement subscriptions were cancelled with zero paid payments; the third was created with zero paid payments. Each had one failed payment, a different token, and a rejected/inactive token status. The provider reported remitter-bank/payment-authentication/payment-declined for all three, including the user-reported correct-PIN attempt.

Therefore the automatic checkout replacement is functioning, but it has not resolved the UPI app's duplicate AutoPay error. Opening fresh checkout was insufficient evidence to call the underlying UPI retry problem fixed. The older initiated token remains a possible lead, not a proven cause. The next useful evidence is a Razorpay/bank/NPCI trace correlating the latest failed payment with the earlier initiated mandate, rather than more blind subscription resets or deleting provider records. No successful payment was recorded for the inspected retest attempts. No support message was sent on the user's behalf.

### Further trace: distinct provider references and repeated cancellation API failure

A later read-only investigation was limited to the affected test account. All six inspected failed payments across its original and replacement subscriptions had distinct gateway-token and UPI transaction-reference fingerprints. No merchant-visible mandate reference was provided (`mrn` null). The extra token error/notes fields exposed no deeper bank/NPCI response code. This rules out simple reuse of the merchant-visible transaction references in these records, but does not identify which provider/bank mandate check is causing the duplicate AutoPay message.

With the user's existing explicit cancellation authorization, one guarded retry of the documented cancellation endpoint for the old inactive initiated token again returned HTTP 500 SERVER_ERROR. GET still reported initiated. No successful cancellation or bank reset is claimed. There is no evidence justifying another app-code change as a root-cause fix. A minimal support report was prepared privately with affected subscription/payment/token IDs, request/error details and specific trace questions; it omits credentials, PINs, payer contact/VPA and unrelated account data. No message has been submitted without explicit messaging authorization.

### Support submission and subsequent successful payment

With explicit user approval, the prepared technical report was submitted through the authenticated merchant dashboard. Razorpay confirmed support ticket **21440759**, with a stated status update within 4–8 business hours. No API credentials, ID tokens, PINs, payer contact/VPA or unrelated account data were included in the report.

A later read-only check found a new subscription on the affected account with one paid payment. The old inactive token still reported `initiated`. The agent's token-cancellation calls had returned HTTP 500 and never confirmed revocation. The agent did cancel earlier failed subscription checkouts as documented above, but did not clear the bank token or submit the successful payment. The user reported that closing the failed Razorpay screen and opening a fresh checkout allowed payment to go through. This establishes a working observed retry procedure, not proof that a fixed timeout expired or that the old token caused the duplicate error.
