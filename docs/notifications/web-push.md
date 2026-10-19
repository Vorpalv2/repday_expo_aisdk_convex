# Rest notifications on the web

For the scheduling architecture, callback lifecycle, Redis state and retry behaviour, see [How QStash works in Repday](qstash.md).

Repday uses Web Push for rest-complete alerts. Users opt in on the workout screen or under Profile. A service worker receives messages while the app is backgrounded. No workout records, exercise names or user names are sent to the browser push service.

The server authenticates the Firebase ID token, stores the browser subscription and current timer in existing Upstash Redis, and publishes a delayed job to Upstash QStash. The callback verifies the QStash signature and body/destination before sending an encrypted Web Push message. EAS Hosting stays the API host; no long-running process or JavaScript timeout on the server is needed.

## Activate in production

1. In your existing Upstash account, enable **QStash**. Copy `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, and `QSTASH_NEXT_SIGNING_KEY` into your local and EAS server environment. QStash credentials are different from Redis credentials. Review QStash's current plan and limits before enabling paid usage. One scheduled rest generates a QStash message even if it is later skipped.
2. Run `npm run push:keys` to generate the VAPID key pair into ignored `.env.local`. This has already been run for this checkout. Keep a secure backup of the pair and use the same keys in production. Rotating the public key requires browsers to resubscribe. The script will not overwrite an existing pair.
3. Set `WEB_PUSH_SUBJECT` to a real support `mailto:` address or HTTPS contact URL, and `WEB_PUSH_ORIGIN` to the exact public HTTPS origin (no trailing slash), e.g. `https://repday.expo.app`. The origin must be reachable by QStash and match the domain users subscribe on. A preview deployment needs its own origin and environment; do not point preview alerts at production.
4. Keep the existing `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and Firebase config. Add the VAPID pair, subject, origin and QStash values to the EAS environment used by the web deployment. Never use an `EXPO_PUBLIC_` prefix for the private key or QStash credentials. The public key is served by `GET /api/push`.
5. In the Expo project dashboard, use **Project settings → Environment variables**, choose `production`, and add private credentials with **Sensitive** visibility. EAS Hosting does not support the **Secret** visibility type. Public keys, origin and contact URL can use **Plain text**. Export and deploy the web/API app using the existing `npm run deploy:web:prod` workflow. EAS environments are applied at deployment; adding local values does not configure production.
6. On an actual Android phone, open the HTTPS site and enable rest notifications. On an iPhone/iPad running a supported OS, first add Repday to the Home Screen and launch it there. Enable alerts, complete a set, lock the phone, and verify the alert. Also test reset, skip, finish, discard, opt-out, expired permissions and offline reconnect. Do not claim locked-phone delivery before this physical-device check.

Use a supported standalone browser for notification testing. During live QA, the Codex in-app browser returned a subscription endpoint outside the supported browser push-service allowlist; the API rejects it and the UI gives supported-browser guidance. This does not establish a failure in Chrome on Android or in an installed iPhone Home Screen app. Subscription key validation accepts equivalent padded/unpadded and standard/URL-safe Base64 encodings, normalizing them before storage.

The UI intentionally reports alerts as unavailable when credentials are missing. It does not request browser notification permission automatically. Denied permission and unsupported browsers show guidance. A successful browser permission alone does not count as an enabled subscription; server registration must also succeed. When starting a rest, wait for “Rest alert scheduled” before locking the phone. If scheduling fails, the UI says to keep Repday open.

## Timer behaviour and limits

- Updating the rest deadline schedules/replaces the alert for this browser. Skipping rest, finishing/discarding a workout, signing out or disabling alerts invalidates it. Pausing workout elapsed time continues the rest countdown, matching existing behaviour.
- Revision fencing ignores out-of-order schedule/cancel requests. Delivery checks the current timer ID and uses a lease to suppress concurrent duplicate jobs. The worker also rejects notifications for a different local deadline, disabled alerts, and duplicate timer IDs.
- Alerts more than 60 seconds late are discarded. Push-service TTL is 60 seconds. Network delays, phone settings, Focus/Do Not Disturb and operating-system restrictions can delay or suppress notifications. This is a best-effort reminder, not an exact/offline alarm.
- Rest deadlines are capped at 30 minutes. Browser registrations expire from Redis after 90 days without reconnecting. A 404/410 push response removes an expired subscription.
- Both subscription and timer endpoints require authentication and share a per-account 60 requests/minute rate limit. Only known browser push hosts are accepted, and push requests never follow redirects.
- The worker does not cache pages, API responses, tokens or workout data. Its small local cache stores only enabled state, the rest deadline and last handled timer ID. A PWA manifest and icons support Home Screen installation; offline page support is not included.
- Reset/skip cancellation needs the request to reach the server, but the local worker state also suppresses stale alerts on that device. Notification delivery already in progress cannot be recalled reliably.
- Current opt-in is specific to a browser and account. This implementation alerts that browser, rather than broadcasting to all of a user's devices.

## Checks

- `npm run test:push` runs endpoint validation, signed-callback verification and service-worker tests without contacting billing or push services. It skips Redis integration by default.
- `RUN_PUSH_REDIS_TESTS=1 npm run test:push` additionally uses the configured Redis with a unique disposable `qa-push-*` namespace. Authentication, QStash publishing and the push service are mocked; actual Redis Lua scripts are exercised and test keys are deleted afterward. It tests scheduling, cancellation, replacement, duplicate suppression, transient failure retries, expiry and opt-out.
- `npm run export:web` checks the production web/API bundle.
- Browser QA uses an isolated local fixture and mocked authentication and scheduling APIs. A synthetic push reached the actual worker and invoked `showNotification`, but the headless browser rejected displaying it with a notification-permission error. UI opt-in, reset/skip, opt-out, unavailable-service messaging and iPhone installation guidance passed. Production activation on 2026-10-16 verified that `/api/push` reports configured, the worker and manifest are served, unsigned callbacks are rejected, and a real delayed QStash job reaches the signed delivery endpoint successfully. That job used a nonexistent subscription and was acknowledged without notifying a user. Actual browser notification display and a physical phone lock remain unverified.

## Source

- `lib/restPush.web.ts`: browser subscription, opt-in and timer synchronization.
- `components/RestPushSettings.tsx`: workout/profile controls.
- `public/sw.js`: notification handling, cancellation checks and click-to-open.
- `app/api/push+api.ts`: readiness and public VAPID key.
- `app/api/push/{subscription,timer,deliver}+api.ts`: authenticated subscription/scheduling and signed delivery.
- `lib/server/webPush.ts`: validation, Redis scripts, authentication and Web Push transport.

Primary references: [Web Push](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [iOS Home Screen push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [QStash delayed messages](https://upstash.com/docs/qstash/features/delay).
