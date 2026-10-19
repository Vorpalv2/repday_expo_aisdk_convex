# Repday — Expo Workout Tracker & AI Coaching

Repday is a workout tracker for web, Android and iOS, built with Expo 57, React Native and TypeScript. It supports custom workout splits, guided training plans, active-session logging, rest timers, workout history, progress charts and streaming AI coaching.

This branch uses Firebase for authentication and cloud data, AsyncStorage for device-local state, Vercel AI Gateway for coaching, Upstash for server infrastructure, and Razorpay for Plus subscriptions. Free users use cached splits and history between explicit refreshes; Plus and Complimentary users can also enable live cross-device sync.

## Packages and badges

The packages below are direct dependencies from [`package.json`](package.json). Badge versions show the configured dependency ranges, rather than a guarantee of the exact resolved version in every installation. [`package-lock.json`](package-lock.json) records resolved versions.

### App and navigation

[![expo ~57.0.17](https://img.shields.io/badge/expo-~57.0.17-202938?logo=expo&logoColor=white)](https://www.npmjs.com/package/expo)
[![react 19.2.3](https://img.shields.io/badge/react-19.2.3-202938?logo=react&logoColor=white)](https://www.npmjs.com/package/react)
[![react-native 0.86.3](https://img.shields.io/badge/react--native-0.86.3-202938?logo=react&logoColor=white)](https://www.npmjs.com/package/react-native)
[![react-dom 19.2.3](https://img.shields.io/badge/react--dom-19.2.3-202938?logo=react&logoColor=white)](https://www.npmjs.com/package/react-dom)
[![react-native-web ^0.21.0](https://img.shields.io/badge/react--native--web-%5E0.21.0-202938?logo=react&logoColor=white)](https://www.npmjs.com/package/react-native-web)
[![expo-router ~57.0.24](https://img.shields.io/badge/expo--router-~57.0.24-202938)](https://www.npmjs.com/package/expo-router)
[![react-native-gesture-handler ~2.32.0](https://img.shields.io/badge/react--native--gesture--handler-~2.32.0-202938)](https://www.npmjs.com/package/react-native-gesture-handler)
[![react-native-screens ~4.26.0](https://img.shields.io/badge/react--native--screens-~4.26.0-202938)](https://www.npmjs.com/package/react-native-screens)
[![react-native-safe-area-context ~5.7.0](https://img.shields.io/badge/react--native--safe--area--context-~5.7.0-202938)](https://www.npmjs.com/package/react-native-safe-area-context)
[![expo-status-bar ~57.0.1](https://img.shields.io/badge/expo--status--bar-~57.0.1-202938)](https://www.npmjs.com/package/expo-status-bar)

| Package | Role in Repday |
| --- | --- |
| `expo` | Expo runtime and builds. |
| `react` | Component and state model. |
| `react-native` | Native Android and iOS interface. |
| `react-dom` | React rendering for the browser. |
| `react-native-web` | React Native components on the web. |
| `expo-router` | File-based screens and server API routes. |
| `react-native-gesture-handler` | Native gesture support. |
| `react-native-screens` | Native screen integration. |
| `react-native-safe-area-context` | Safe-area layout around system UI. |
| `expo-status-bar` | Platform status-bar styling. |

### Data, authentication and AI

[![firebase ^12.19.0](https://img.shields.io/badge/firebase-%5E12.19.0-202938?logo=firebase&logoColor=white)](https://www.npmjs.com/package/firebase)
[![@react-native-async-storage/async-storage 2.2.0](https://img.shields.io/badge/%40react--native--async--storage%2Fasync--storage-2.2.0-202938)](https://www.npmjs.com/package/@react-native-async-storage/async-storage)
[![@react-native-google-signin/google-signin ^16.1.5](https://img.shields.io/badge/%40react--native--google--signin%2Fgoogle--signin-%5E16.1.5-202938)](https://www.npmjs.com/package/@react-native-google-signin/google-signin)
[![ai ^7.0.137](https://img.shields.io/badge/ai-%5E7.0.137-202938?logo=vercel&logoColor=white)](https://www.npmjs.com/package/ai)
[![zod ^4.6.5](https://img.shields.io/badge/zod-%5E4.6.5-202938?logo=zod&logoColor=white)](https://www.npmjs.com/package/zod)

| Package | Role in Repday |
| --- | --- |
| `firebase` | Firebase Authentication, Cloud Firestore and Cloud Storage. |
| `@react-native-async-storage/async-storage` | Device-local workout recovery, cached splits/history, preferences and Coach history. |
| `@react-native-google-signin/google-signin` | Native Google authentication; browser sign-in uses Firebase. |
| `ai` | Vercel AI SDK for streaming Coach responses and workout-note generation through AI Gateway. |
| `zod` | Runtime validation of structured workout and plan data. |

### Notifications and server infrastructure

[![@upstash/redis ^1.39.0](https://img.shields.io/badge/%40upstash%2Fredis-%5E1.39.0-202938?logo=upstash&logoColor=white)](https://www.npmjs.com/package/@upstash/redis)
[![@upstash/ratelimit ^2.2.0](https://img.shields.io/badge/%40upstash%2Fratelimit-%5E2.2.0-202938?logo=upstash&logoColor=white)](https://www.npmjs.com/package/@upstash/ratelimit)
[![@upstash/qstash ^2.12.0](https://img.shields.io/badge/%40upstash%2Fqstash-%5E2.12.0-202938?logo=upstash&logoColor=white)](https://www.npmjs.com/package/@upstash/qstash)
[![@block65/webcrypto-web-push ^2.0.0](https://img.shields.io/badge/%40block65%2Fwebcrypto--web--push-%5E2.0.0-202938)](https://www.npmjs.com/package/@block65/webcrypto-web-push)
[![expo-notifications ^57.0.22](https://img.shields.io/badge/expo--notifications-%5E57.0.22-202938)](https://www.npmjs.com/package/expo-notifications)

| Package | Role in Repday |
| --- | --- |
| `@upstash/redis` | Server-side Redis storage, including billing caches and notification state. |
| `@upstash/ratelimit` | Request limits for AI and notification endpoints. |
| `@upstash/qstash` | Delayed rest-notification jobs and verified callbacks. |
| `@block65/webcrypto-web-push` | Web Push payload encryption using Web Crypto. |
| `expo-notifications` | Native notification permissions and rest reminders. |

### Media, sharing and live activities

[![expo-camera ~57.0.6](https://img.shields.io/badge/expo--camera-~57.0.6-202938)](https://www.npmjs.com/package/expo-camera)
[![expo-image ~57.0.5](https://img.shields.io/badge/expo--image-~57.0.5-202938)](https://www.npmjs.com/package/expo-image)
[![expo-sharing ^57.0.22](https://img.shields.io/badge/expo--sharing-%5E57.0.22-202938)](https://www.npmjs.com/package/expo-sharing)
[![react-native-view-shot 5.1.0](https://img.shields.io/badge/react--native--view--shot-5.1.0-202938)](https://www.npmjs.com/package/react-native-view-shot)
[![react-native-svg 15.15.4](https://img.shields.io/badge/react--native--svg-15.15.4-202938)](https://www.npmjs.com/package/react-native-svg)
[![expo-widgets ^57.0.23](https://img.shields.io/badge/expo--widgets-%5E57.0.23-202938)](https://www.npmjs.com/package/expo-widgets)
[![@expo/ui ^57.0.22](https://img.shields.io/badge/%40expo%2Fui-%5E57.0.22-202938)](https://www.npmjs.com/package/@expo/ui)

| Package | Role in Repday |
| --- | --- |
| `expo-camera` | Camera preview and permissions for Form Coach. |
| `expo-image` | Workout media and sign-in artwork. |
| `expo-sharing` | Native sharing and incoming shared workout content. |
| `react-native-view-shot` | Capture workout views for sharing. |
| `react-native-svg` | Vector icons and illustrations. |
| `expo-widgets` | iOS workout Live Activities in supported native builds. |
| `@expo/ui` | SwiftUI primitives used by the workout Live Activity. |

### Build and development

[![expo-constants ~57.0.21](https://img.shields.io/badge/expo--constants-~57.0.21-202938)](https://www.npmjs.com/package/expo-constants)
[![expo-dev-client ~57.0.19](https://img.shields.io/badge/expo--dev--client-~57.0.19-202938)](https://www.npmjs.com/package/expo-dev-client)
[![expo-updates ~57.0.25](https://img.shields.io/badge/expo--updates-~57.0.25-202938)](https://www.npmjs.com/package/expo-updates)
[![typescript ~5.9.2](https://img.shields.io/badge/typescript-~5.9.2-3178C6?logo=typescript&logoColor=white)](https://www.npmjs.com/package/typescript)
[![@types/react ~19.2.0](https://img.shields.io/badge/%40types%2Freact-~19.2.0-202938)](https://www.npmjs.com/package/@types/react)
[![tsx ^4.23.15](https://img.shields.io/badge/tsx-%5E4.23.15-202938)](https://www.npmjs.com/package/tsx)

| Package | Role in Repday |
| --- | --- |
| `expo-constants` | Runtime configuration and development host discovery. |
| `expo-dev-client` | Custom native development builds. |
| `expo-updates` | Expo update support. |
| `typescript` | Static type checking across app, backend contracts and tests. |
| `@types/react` | React TypeScript declarations. |
| `tsx` | Run TypeScript tests and scripts with Node.js. |

## Workout features and caching

- **Training plans and splits:** guided onboarding, custom splits, weekly schedules, and date-specific workout swaps without rewriting recurring preferences.
- **Active sessions:** set editing and recovery stay on the device; completed workouts are written to cloud history.
- **Preferences:** draft changes locally, then apply them with Save or discard them with Cancel.
- **History and progress:** the initial history query fetches up to seven workout documents, with additional history loaded on demand. The default Current week view covers Monday–Sunday; seven documents does not necessarily mean seven days.
- **Cached or live data:** splits and recent history load from local storage and sync at startup. Manual refresh requests fresh cloud data. Optional Plus live sync listens for subsequent changes across devices.
- **Rest reminders:** native notifications and opt-in web push, with delayed delivery handled by QStash.
- **Sharing and native extras:** workout screenshots, incoming shared workout content, a custom Android timer module, and iOS Live Activities in compatible native builds.

Persistent Firestore caching has no fixed 30-minute expiry. Firestore's reconnect billing rules and device storage retention are separate concerns. See the [caching implementation](docs/cache-first-splits-history-live-sync.md), [optimization guide](docs/firestore-optimizations-and-caching.md), and [database I/O case study](docs/database-io-case-study.md).

Split startup now uses a complete per-account local snapshot and the revision in the existing settings document. Unchanged cached splits require zero split-document reads. See [revision caching, migration, and read/write costs](docs/split-revision-cache.md).

For onboarding, preferences, split mutations, workouts, history, AI Coach, notifications, billing and deletion, see the [app-wide database I/O reference](docs/app-database-io-reference.md).

## AI Coach

Expo API routes keep model calls and server credentials on the server. The Coach endpoint uses the Vercel AI SDK's `streamText`, `toTextStream` and `createTextStreamResponse`; the client reads chunks through `expo/fetch` and renders headings, bold text and indented lists as the reply arrives.

- Server-side authentication, premium entitlement checks and rate limits protect generation.
- The context card shows the exact bounded training snapshot supplied with a question, including today's split or a selected completed workout.
- Completed conversations are saved privately in Firestore and cached per account on the device. The History drawer loads discussions on demand without a background listener.
- Workout-note parsing uses Zod to validate generated structured data before it enters the app.

The configured Coach model is GPT-5 mini through Vercel AI Gateway. Model usage is billed separately from Firestore operations. See the [AI Coach breakdown](app_design_flow/analysis/premium-features-breakdown/ai-coach.md).

## Plus subscriptions

Razorpay Checkout, server REST calls and signed webhooks manage subscriptions. Razorpay is an external integration; this repository does not install the Razorpay Node SDK. Plus is subscription-based, while Complimentary access is granted manually and unlocks the same features.

See the [subscription flow](docs/subscription-flow.md), [live-payment setup](docs/razorpay-live-cutover.md), and [premium feature breakdown](app_design_flow/analysis/premium-features-breakdown/README.md), including [live sync behavior and costs](app_design_flow/analysis/premium-features-breakdown/live-cross-device-sync.md).

## Backend architecture

[`backend/contracts.ts`](backend/contracts.ts) defines the workout data shapes and operations. Screens consume the stable [`backend/useWorkoutData.ts`](backend/useWorkoutData.ts) hook, while Firebase workout operations live under `backend/firebase/`. Authentication is exposed through `backend/BackendProvider.tsx`. Coach conversation persistence has a separate Firebase adapter.

This branch has no runtime backend selector. The Convex implementation remains on its own branch, with separate accounts and data. See the [backend guide](backend/README.md) and [design documentation](app_design_flow/README.md).

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and configure the Firebase web app values.
3. Enable Email/Password and Google sign-in as needed in Firebase Authentication, and configure the authorized domains.
4. Configure Cloud Firestore and Cloud Storage, then deploy `firestore.rules` and `storage.rules` to the intended Firebase project.
5. Configure server-side AI Gateway, Upstash, Razorpay and Web Push values for the features you intend to use. Follow the linked setup guides; never put server credentials in `EXPO_PUBLIC_*` variables.
6. Start with `npm run web`, `npm run ios` or `npm run android`. Features with custom native modules require a compatible development build.

Browser and native authentication use platform-specific persistence. AsyncStorage is device-local storage, not a shared cloud database.

## Validation and deployment

```bash
npm run typecheck
node --import tsx --test tests/*.test.ts
npm run export:web
```

Expo EAS deployment scripts load their respective hosted environments:

```bash
npm run deploy:web:preview
npm run deploy:web:prod
```

Firebase rules deploy separately from the web app. Expo EAS CLI and Firebase CLI are invoked as deployment tools; they are not direct runtime dependencies in `package.json`.

## Further documentation

- [Web rest notifications](docs/web-push.md) and [QStash jobs](docs/qstash.md)
- [Upstash Redis and QStash architecture](docs/upstash-redis-qstash.md)
- [Guided training plan builder](docs/training-plan-builder.md)
- [Premium features, caching and costs](app_design_flow/analysis/premium-features-breakdown/README.md)
- [AI development token and cost analysis](app_design_flow/analysis/ai-development-token-cost-report.md)
