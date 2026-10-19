# Razorpay setup and payment checkpoint

Last updated: 2026-10-16 (Asia/Kolkata).

**Current production update (19 October 2026):** live billing now offers **₹99/month** (9900 paise); existing subscriptions retain their original recurring price. This document records the earlier sandbox setup. See [current live configuration](razorpay-live-cutover.md#current-production-offer--inr-99month).

## Checkpoint before payments

- Git tag: `checkpoint/pre-razorpay-2026-10-16`
- Commit: `4bd454652bce39b9bc755b58e0db67d624b2c5de`
- GitHub branch: `codex/backend-isolation`
- Production URL: https://repday.expo.app/

This checkpoint includes the account-deletion fix and the current UI. No payment
checkout, subscription enforcement, or Razorpay credentials exist at this point.
The tag preserves source code; it does not snapshot Firebase data, hosted
environment variables, or future payment-provider records.

To inspect or resume the saved version without deleting newer work, first commit
or stash any local changes, then run:

```sh
git fetch origin --tags
git switch -c codex/restore-pre-razorpay checkpoint/pre-razorpay-2026-10-16
```

Switching Git versions does not change the live website. Restoring production
requires exporting and deploying the selected version with the required hosted
environment configuration.

## Current payment status

The merchant account has completed KYC. Development uses **Test Mode only**,
with a **₹75/month sandbox plan** (7500 paise). Payments are simulated; the intended
launch price remains ₹75/month. Live billing is not enabled.

The selected subscription benefits are AI Coach, Form Inspection, and more than
six workout splits. Workout tracking and up to six splits remain free.

Local Razorpay test credentials, a sandbox plan, and Firebase server credentials
are configured. Firebase server authentication and Firestore read access have
been verified without changing user records. Local checkout, signed verification, webhook processing, cancellation, expiry,
and feature gates are implemented. The Test Mode web/API release and Firestore
rules were deployed to `repday.expo.app` on 16 October 2026. Razorpay Dashboard
webhook registration and a signed-in hosted checkout test still need confirmation.

A second source checkpoint includes the OAuth fix:
`checkpoint/pre-razorpay-with-auth-fix-2026-10-16` (commit `48da9f1`).

## Firebase server credential

The service-account download belongs to project `repday-expo`. Do not commit or
paste its contents into chat. To configure another local environment:

```sh
npm run billing:firebase -- /absolute/path/to/service-account.json
npm run billing:setup
```

The first command validates the project, copies the credential to the ignored
`.firebase-admin.local.json`, and sets `FIREBASE_ADMIN_SERVICE_ACCOUNT` in the
ignored `.env.local`. Both files use owner-only permissions. Download filenames
matching `*-firebase-adminsdk-*.json` are also excluded from Git. No secret is
printed. The second command validates or creates the ₹75 monthly Test Mode plan
and saves a separate webhook signing secret locally.

These local settings do not configure the deployed website. Server credentials
must be configured separately in the hosted environment; never prefix them with
`EXPO_PUBLIC_`. Keep the webhook signing secret distinct from the API key secret.

## Account signup

1. Visit https://razorpay.com/ and choose **Sign Up**. Verify your own email/mobile
   number using the OTP sent by Razorpay.
2. Select the business type that accurately describes you. Razorpay supports
   an unregistered individual onboarding path if you have not registered a business.
3. Use **Repday** as the brand and https://repday.expo.app/ as the website. Describe
   the product as a web-based workout tracker with an INR 200 monthly subscription.
4. Follow the dashboard's PAN, identity, bank-account, and KYC prompts for your
   chosen business type. Enter these details directly in Razorpay, not in chat.
5. Access the **Test Mode** dashboard to begin development. Live account approval
   and website verification are separate launch requirements.

Razorpay's current account instructions:
https://razorpay.com/docs/payments/set-up

## Generate test credentials

1. Select **Test Mode** in the Razorpay dashboard.
2. Open **Account & Settings → API Keys** under Website and app settings.
3. Choose **Generate Key**, and save the Key ID and Key Secret securely.
4. Tell the assistant that test keys are ready. Do not paste the Key Secret into
   chat or commit it to Git. Configure it through a local ignored environment file
   or a hosted server environment when integration begins.

Test payments are simulated. Test credentials can be generated without a verified
website; accepting real money requires live activation and Live Mode credentials.

Razorpay's API-key instructions:
https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/

## Remaining hosted and live setup

- Configure hosted server credentials and deploy the new API/client.
- Deploy the staged security rules and register the Test Mode webhook.
- Test dashboard-triggered subsequent charges and failed renewal retries.
- Prepare pricing and business/policy pages before requesting a live launch.
- Create a separate ₹75 monthly live plan and explicitly revise the current
  Test Mode-only safeguards when live billing is approved for release.

Subscription documentation: https://razorpay.com/docs/payments/subscriptions/

## Local sandbox test

Run `npm run web -- --port 8081` with `BILLING_ENABLED=true` in the ignored
local environment. Sign in, open **Profile → Repday Plus**, and choose
**Try Plus · ₹75/month**. Free feature buttons show a PLUS badge; a verified paid
subscription removes it. Razorpay Test Mode is enforced in both server and client.
Use only the public test card details from Razorpay's integration documentation.

A successful authorization alone does not unlock Plus. The server fetches paid
subscription invoices and grants access through their `billing_end`. Refresh
subscription status if the invoice arrives just after checkout closes.

## Server data and enforcement

- `billingAccounts/{uid}`: subscription ID, provider status, paid-through time,
  and cancellation state. Owner may read; only the server writes.
- `billingSubscriptions/{id}`: server-owned subscription-to-user mapping.
- `billingEvents/{digest}`: processed webhook IDs for replay protection.
- `splitQuotas/{uid}`: transaction guard serializing split creation.
- `users/{uid}/splits/{id}`: normal editable workout data. Creation goes through
  `POST /api/splits`; existing splits remain readable/editable after expiry.

The server rejects a new split when the resulting free library exceeds six.
It checks real stored documents in a transaction, including bulk imports and
onboarding installs. AI Coach verifies access before calling the model. Form
Inspection checks access before opening the camera; its on-device code remains
client-side and is not a secure boundary against modified clients.

The deployed Firestore rules prevent direct client split creation and all
billing writes. The old app still creates splits directly, so users with a cached
older version must refresh after the rules change.

Cancellation stops renewals, retaining already-paid access until its expiry.
Account deletion cancels the mandate immediately before removing user data.
Billing audit records are server-owned and may remain after account deletion;
no secret credentials or card details are stored in user documents.

## Razorpay webhook setup

1. In the **Test Mode** dashboard, open **Account & Settings → Webhooks**.
2. After deploying the API, use
   `https://repday.expo.app/api/billing/webhook` as the endpoint.
3. Set the secret to the same server-side `RAZORPAY_WEBHOOK_SECRET` value.
   Read it locally; do not paste it into chat.
4. Enable subscription lifecycle events: authenticated, activated, charged,
   pending, halted, paused, resumed, cancelled, completed, and updated where
   available in the dashboard.
5. Send a dashboard test event, then verify a complete subscription lifecycle.

Razorpay cannot reach localhost directly. A development HTTPS tunnel can forward
webhooks to `http://localhost:8081/api/billing/webhook`; manual status refresh
also reconciles canonical invoices while testing locally.

The webhook validates the exact raw-body HMAC with the separate signing secret.
It fetches canonical Razorpay state, ignores events for superseded subscriptions,
and commits state and deduplication together. A mapping not ready yet returns an
error so Razorpay can retry; it does not silently acknowledge a lost payment.

## Deployment order

1. Configure server-only Test Mode keys, plan, webhook secret, Firebase admin
   JSON, and `BILLING_ENABLED=true` in the hosted environment.
2. Export and deploy the new web client and API. Check the active deployment.
3. Deploy `firestore.rules` and verify denied client creates and billing writes.
4. Configure the Test Mode webhook and test renewals/cancellation/expiry.
5. Keep Live Mode disabled. A live launch needs a separate ₹75 plan, policy
   pages and an explicit change to the current test-only safeguard.

## Verification

Local checks on 2026-10-16 include a complete simulated card payment with a
Razorpay test card, server invoice verification, paid feature access, and saving
a seventh split. Signed webhook processing, duplicate delivery, invalid HMAC,
and a concurrent free split-creation race were exercised against the local API.

UI checks covered light, dark and Cyberpunk at 393px, 466px and 1280px widths,
including removal of PLUS badges with an active entitlement fixture. The actual
sandbox payment also verified removal of the Coach badge.

Billing tests cover paid invoice matching, signature binding, free quota,
expiry, cancellation idempotency, superseded events, and cancellation before
account deletion. Use `npm run test:billing`. Client export checks confirm billing
secrets are not present in browser assets. Security Rules syntax validation and
production rules deployment passed. The live site returned HTTP 200, while
unauthenticated billing/split requests and an invalidly signed webhook returned
HTTP 401. Signed-in hosted checkout, Razorpay Dashboard webhook delivery, and
end-to-end rule denial checks remain. Physical iOS Apple Health launch is still
unverified.
