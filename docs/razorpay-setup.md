# Razorpay setup and payment checkpoint

Last updated: 2026-10-16 (Asia/Kolkata).

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

The intended price is INR 200 per month for the web app. Razorpay is the selected
provider. The merchant account has not been created yet. No keys or payment plan
have been configured, and the live app does not charge users.

Automatic monthly renewal using Razorpay Subscriptions/UPI AutoPay is proposed.
Confirm the renewal model, paid features, any trial, and cancellation/refund terms
before enabling a paywall. Verify subscription payment methods on the merchant
account before promising them to users.

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

## Integration work still to do

- Create the INR 200 monthly plan in the appropriate Razorpay mode (20000 paise).
- Build authenticated server endpoints for subscription creation and cancellation.
- Verify checkout signatures and webhook signatures on the server; never grant
  access from a client success message alone.
- Store billing state in a server-controlled location. The existing broad
  user-owned Firestore write rule must not allow clients to grant themselves
  paid access.
- Handle duplicate/retried events, renewal failures, cancellations, and expiry.
- Add the subscription UI and test the full lifecycle with Test Mode keys.
- Prepare the pricing and required business/policy pages for live review.
- Enable live billing only after approval and successful live-readiness checks.

Subscription documentation: https://razorpay.com/docs/payments/subscriptions/
