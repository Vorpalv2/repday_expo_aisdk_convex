# Repday-inspired app design and implementation skill

Use this guide when building a new app that should carry Repday's visual identity and interaction language into a different product domain (for example, nutrition planning or a “what's in my fridge” tracker). Treat the design system below as the fixed visual brief. Adapt labels, data, illustrations, and workflows to the user's product requirements while keeping the composition, type character, color logic, component geometry, and interaction feel recognizable.

This is a reusable implementation brief, not permission to copy Repday's business logic blindly. First inspect the target repository and its existing conventions. Reuse the supplied design system and architecture patterns; do not replace working project choices just to match this reference app's stack.

## 1. Product and design intent

Repday feels like a confident, energetic training companion: athletic condensed display typography, almost-black ink, bright blue actions, pale blue feature surfaces, soft neutral input capsules, rounded white sheets, and precise green/red state colors. It is bold in headlines and restrained everywhere else. The app is mobile-first and composed from touch-friendly, single-purpose controls.

Preserve the signature combination:

- A narrow, heavy, uppercase display face for page and section titles.
- A clear modern sans-serif for body copy, data, and controls.
- A mostly white/light canvas with gentle blue surfaces and saturated blue actions.
- Large rounded activity panels, restrained outlines, capsule-shaped values, and broad, high-contrast primary buttons.
- A clean hierarchy: title, short context line, one primary action, then focused content.
- Custom subject-specific vector or raster art integrated into the UI rather than generic emoji decoration.

For another domain, keep that same hierarchy. For example, “Nutrition” can use a weekly intake/activity panel, meal-plan cards, food art, and an AI nutrition assistant. A fridge tracker can use the same header, tabs, drawer, and summary patterns with pantry item rows and expiry/status chips. Do not retain workout-specific labels or fake workout metrics.

## 2. Visual tokens

The values below are taken from the current Repday implementation in `app/index.tsx`, `components/SignInScreen.tsx`, and `components/FormCoachCameraScreen.tsx`. Reuse as design tokens so related screens stay coherent. Where platform font availability differs, choose the closest heavy condensed equivalent while preserving the same proportions and hierarchy.

### Color palettes

| Token | Light | Dark | Cyberpunk |
| --- | --- | --- | --- |
| Background | `#FFFFFF` | `#0C1016` | `#F5DC42` |
| Ink / primary text | `#17191D` | `#F3F5F8` | `#0754BD` |
| Muted text | `#9298A1` | `#9DA8B5` | `#315F9E` |
| Primary blue | `#3478F6` | `#78AAFF` | `#005BDB` |
| Success green | `#35C56A` | `#48D28A` | `#1B805A` |
| Divider / border | `#EDF0F4` | `#28313D` | `#D2B927` |
| Soft surface | `#F5F6F9` | `#1B232E` | `#F1D443` |
| Alternate surface | `#F2F4F7` | `#202A36` | `#F7DF57` |
| Primary button | `#17181B` | `#E9EEF5` | `#0754BD` |
| Primary button text | `#FFFFFF` | `#111820` | `#FFE957` |

Additional frequently used accents: pale blue header surface `#E8F2FF`; secondary pale blue `#D8EAFF`; workout/activity sky `#D8F0FC`; light blue action fill `#EAF2FD`; active/set comparison green `#35C56A`; destructive red `#E24B4B` (use for destructive actions only); calm active-rest background `#EEF4FF` or the theme's equivalent muted blue surface.

Always resolve colors through a theme palette/helper. Avoid hardcoding a light-only surface into a dark or cyberpunk screen. Maintain legible contrast. For a new theme variant, define every semantic token rather than sprinkling exceptions through individual components.

### Typography

- **Display / section headings:** Repday uses `sans-serif-condensed` on Android and `Impact` elsewhere (`appTitleFontFamily`). Use this heavy, compressed, uppercase character for screen titles, card titles, modal headings, onboarding feature titles, and the timer digits. Keep it reserved for those high-signal places.
- **Body and controls:** system sans-serif, generally medium/semibold/bold. Body copy is readable and neutral; do not use the display face for long paragraphs or form values.
- **Utility labels:** sans-serif bold, uppercase, moderate tracking, muted color. Use sparingly for labels such as `SET`, `KG`, `REPS`, category, or `TOTAL LIFTED`.
- Reference sizes: page title ~35 px/40 line-height; screen/display title ~32 px/36; modal/section title ~21–24; card title ~19–21; body ~15–17 with 21–24 line-height; metadata ~12–14; utility labels ~11–13. Scale down carefully on compact screens and use `numberOfLines`/fit behavior instead of clipping.
- Tighten display headings slightly (around `-0.4` to `-1` letter spacing); keep body tracking normal. Use uppercase display transforms for page-level headings, not every text label.

### Spacing, shape, elevation

- Use an 8 px rhythm. Typical screen horizontal inset: 18–22 px; compact inset: 12–16 px. Feature cards use 18–22 px padding. Drawer rows and control groups use 8–14 px gaps. Separate major sections by 20–28 px.
- Common corner radii: 10–12 px for compact chips; 14–18 px for buttons and inputs; 18–22 px for cards; 24–28 px for major activity panels and modal sheets; pills use half-height / fully rounded corners.
- Borders are quiet (`#EDF0F4` light) and one pixel. Use subtle elevation only for floating controls, sheets, and primary floating elements. Avoid stacking heavy borders and shadows on the same surface.
- Touch targets should be at least 44 px where practical. Keep spacing around delete, close, and camera controls generous.

## 3. Art, icons, and illustration placement

- Prefer project-owned vector or raster art with a consistent line weight and restrained palette. Repday's product illustration language is fitness anatomy/exercise illustrations, including red-highlighted working muscles, plus a small hand-drawn training mascot. Reuse the same type of subject-specific art in another domain (ingredient/meal illustrations for nutrition, groceries/fridge contents for food tracking) without changing the UI hierarchy.
- Existing reference assets include `assets/header-illustrations.png` and `assets/repday-loading-sprite.png`; exercise imagery is catalog-driven via `data/exercises.ts` and catalog media. Preserve aspect ratio; contain illustrations in a purposeful visual area; do not stretch or crop anatomy/food illustrations.
- Keep decorative/header art smaller than the title and aligned to its far edge. In activity or workout cards, use a larger centered art stage with room around the subject; place the title and subtitle near the top, interaction controls around the image only when needed, and compact factual metadata near the lower edge.
- Icons should be a coherent set (current app uses an internal icon component). Match stroke/fill, visual weight, size, and alignment. Use explicit icons for add, close, delete, camera, navigation, play/pause, reset, and skip; do not substitute emoji or text glyphs when a proper icon is available.
- For camera/form inspection, keep camera preview full-bleed within a dark stage, with a dark translucent top bar, large condensed exercise title, compact translucent metric tiles, and floating controls that remain easy to reach without covering the movement. Ask for camera permission only after the user intentionally opens this feature. Make the permission screen useful without permission. Live pose detection runs on the device; do not record or upload camera video. Explain data flows accurately and do not imply every exercise has rep or range-of-motion analysis: available movement guidance varies by exercise.

## 4. App shell and navigation

- Build a mobile-first app shell with a clear page title at the top, one primary scrollable content region, and a persistent bottom tab bar. Respect safe areas and small browser/device heights; primary content must not sit behind fixed bars or require a tiny-screen user to scroll just to reach a critical decision.
- Repday's main navigation is Home, Progress, Profile, and Search in a floating tab bar, plus a separate prominent circular AI Coach button beside the bar. The Coach button is a top-level navigation action: give it a recognizable coach icon, an accessible name and selected state, and route it to the dedicated AI Coach screen. The app supports swiping left/right over the tab bar to move between adjacent tabs; the separate Coach button is activated by its own tap. Keep swipe gestures confined to the tab bar so page scrolling and horizontal carousels retain their own gestures.
- The bottom tab bar is a floating rounded capsule with icon above label. Active tab uses blue emphasis, inactive tabs use ink/muted contrast. Keep the adjacent AI Coach button visually distinct and large enough to tap, while preserving clear selected feedback when the Coach screen is open. Reserve bottom safe-area padding and content inset so the bar never covers the final row.
- Animate tab changes with a short directional slide/fade or subtle horizontal shift. Keep duration around 180–260 ms, honor reduced-motion settings, and avoid moving surrounding page layout. Avoid remounting the entire application state on tab change.
- Use stable, meaningful tab names and accessible labels. The domain-specific tab set may change, but keep the bar geometry and active/inactive visual treatment consistent.

## 5. Screen families and content structure

### Authentication and onboarding

Use a welcoming sign-in/sign-up entry screen with a strong display title, concise copy, neutral rounded fields, clear primary action, and secondary provider action when supported. Show inline validation and preserve entered values on recoverable errors.

Use a guided, full-screen, one-decision-per-step onboarding flow with a visible sense of progress, strong condensed heading, short supporting sentence, large selectable preference rows/cards, selected-state blue treatment, and consistent previous/continue controls. Keep the flow to user-relevant preferences, then persist a versioned draft locally while onboarding and sync the completed result to the signed-in account. Current Repday preference sequence is:

1. Theme: light, dark, or cyberpunk.
2. Weekly activity layout preference.
3. Training goal.
4. Default rest duration.
5. Weight unit.
6. Reminders preference.
7. Country and time zone.

For another app, translate this into a short product-specific sequence (for example dietary goals, meal schedule, units, notification preference, location/time zone). Do not copy irrelevant choices. Let the user skip nonessential choices and edit them later in Profile/settings. On completion, show a brief transition/loading screen with a clear welcome, then land on a useful populated or actionable home state.

### Home / primary dashboard

- Start with a large uppercase condensed page title and small brand/mascot art.
- Feature a broad, softly tinted activity/summary panel with a condensed section title, one or two prominent summary lines, a discrete expand/collapse control, and clear primary/secondary actions.
- Follow with a section heading and a concise view-mode/filter or “See all” control.
- Present domain cards in a horizontally browsable row when the content benefits from comparison. Cards have a title and muted subtitle, generous art space, a short actionable summary, and restrained metadata. Do not let card text clip on a small viewport; allow the card to scale/wrap deliberately.
- Include a calm empty state with a specific next action rather than fake records or filler.

### Progress / history

Use clear time-range controls, a legible chart/calendar, total/stat summaries, and a chronological record list. Place labels directly by their data, use the theme's muted color for secondary detail, and keep filters discoverable. Do not invent metrics; derive them from stored records and document calculation assumptions.

### Profile and preferences

Use a clear account identity area followed by grouped preference rows. Each row has one label, current value, and obvious affordance. Use the same full-width theme-aware preference sheet for selection. Keep account-specific actions (sign out, delete account) in a clearly separated group; destructive actions require explicit confirmation and any required reauthentication. Never put secrets in client-readable profile fields.

### Search and AI

- Search uses a large rounded search field, filter chips (e.g. category, target, equipment), a visible selected-filter state, clear-all action, result count, and compact result rows with a small art thumbnail, title, metadata, preview, and add action.
- Filter chips are neutral while inactive; selected filters receive pale blue fill and primary blue text. A search input should not appear focused/bordered unless it actually has focus. Use a deliberate focus ring only during keyboard focus.
- AI Coach uses the same title/body/button system. Make the conversational flow feel direct and calm; distinguish user and assistant turns clearly, provide loading/error/retry states, and show contextual suggestions only when relevant. Be explicit about whether AI output is advisory and whether data is sent to a server/model.
- The AI Coach navigation button opens a dedicated conversational screen where users can ask about training. Keep the prompt, send action, conversation, loading state, error message, and retry action usable on narrow screens and with the keyboard open. The Coach can use a concise recent workout/split context when available; communicate when it is replying about a selected completed workout. Responses are guidance, not a substitute for professional medical advice. Send only the required workout context to the configured AI service and describe that server data flow honestly.

### Active workflow / detail surface

Translate workout set rows into the domain's repeated data-entry units (meal entries, food inventory rows, etc.). Use aligned utility headers, soft capsule inputs, clear row numbering/status, and one visually obvious completion affordance. Keep changes local first when the user expects a multi-step workflow, then commit them on the explicit finish/save action. Define discard behavior and restore behavior before implementing persistence.

### Active-session Pose Coach

- Offer the Form Coach entry beside each exercise name only inside an active workout session, so the current exercise and its set/rep targets provide context for the analysis.
- Request camera permission after the user taps the exercise's Form Coach action. On the web, use a browser camera stream and on-device MediaPipe Pose Landmarker inference. Keep live camera frames local and do not record or upload them.
- Before starting analysis, show 5, 10, and 15 second setup countdown choices. Tapping a choice hides the choices and begins the countdown; after it finishes, show the live pose overlay and current exercise, reps, elapsed time, set, and relevant joint angle.
- Provide accessible pause/resume, stop-analysis, and end-coach icon buttons. Pause stops inference and resume resets the movement phase so the next repetition starts cleanly. Respect an active set rest timer: pause rep analysis during rest and resume after rest expires unless the user has paused or all planned sets are complete.
- Count a rep only after the movement reaches its recognized start and end zones. Give clear visual feedback for a full-range counted rep and for an incomplete attempt; use pace guidance only when enough timing data exists. On target, mark the set complete and advance the active session. At the end, show a summary of full-range reps, incomplete attempts, and any pace observations.
- Movement rules are exercise-specific. Do not claim reliable equipment, load, muscle activation, or universal form assessment from a 2D skeleton. If an exercise has pose visibility but no implemented movement rule, say rep guidance is unavailable rather than counting arbitrary motion.

## 6. Reusable component patterns

### Cards and headers

- Major feature cards use a pale blue theme-aware background, ~24–28 px radius, and 18–22 px internal padding. Keep the title/summary/action hierarchy consistent.
- Repeated content cards use white/theme surface, light border, ~18–22 px radius, and modest padding. Use a card only when grouping helps; not every text block needs a card.
- Detail headers can use a light blue capsule/panel to distinguish a named content unit. Include title, concise metadata, and category chip with adequate vertical gap.

### Buttons

- Primary action: wide black/ink capsule in light theme, with white label; invert appropriately in dark theme using palette `button` and `buttonText`. Use strong semibold text and a clear action verb.
- Accent action: saturated blue fill with white label for adding/creating/selecting primary in-context actions.
- Secondary action: pale neutral/blue surface with ink or blue text.
- Destructive action: red filled round or pill control with a white trash/close icon. Confirmation dialogs use the same decision-modal geometry; destructive confirmation uses red only for the destructive action.
- Disabled controls retain their layout and semantics, use reduced emphasis, and explain why on attempted activation when the reason is actionable (e.g., a toast indicating a rest timer is active).
- Saved state buttons keep the broad black/white primary geometry, with label changing consistently (Save → Saved) and a visible confirmed state.

### Drawers / bottom sheets

- Use a bottom sheet with a large white/theme surface, ~28–36 px top corners, subtle top grabber, centered condensed sheet title, thin divider, scrollable body, and fixed footer action area.
- Header controls sit on the same row as the title when space permits. Use a large circular blue expand/up affordance and a separate red circular close affordance. Keep close hit target independent from nested previews/modal content.
- Provide explicit expand/collapse controls. Keep drawer body independently scrollable, preserve a fixed footer, and avoid nested child interactions bubbling into the parent close handler. A nested preview's X closes only the preview; it must not close the underlying drawer.
- When the drawer supports long item lists, include large up/down scroll controls in a consistent location, with disabled states at the boundaries. Ensure they do not obscure list content or its final item.
- Search drawers include search, horizontal filter chips, selected filters, clear filters, result count, result list, preview action, and add action. Keep “Preview” separate from “Add”. Avoid redundant footer explanations if the drawer title and flow already explain what happens.

### Confirmation popups / modals

- Use a centered theme-aware modal: dimmed scrim, white/theme surface, large rounded corners (~26–32 px), clear condensed heading, short body copy, and aligned decision buttons.
- Keep one clear affirmative action. When there is also a cancel/close action, use a red circular X control or red close segment sized to roughly one quarter of the action row when requested by the source design; primary action occupies the remaining width. Do not mix many competing action styles.
- Highlight a dynamic entity name (split, food list, recipe) in a pale blue rounded capsule using bold body typography. Supporting description remains muted and comfortably spaced.
- Use the same modal design language across start, finish, delete, discard, and other decision popups. Use the domain-appropriate labels; never display a generic confirm when the consequence can be named.
- Preserve focus/accessibility, Escape/back behavior, safe-area fit, and internal scrolling on short screens.

### Timers, floating overlays, and transient state

- Timer readouts use a pale neutral capsule, a small green active dot (muted/gray when paused), and the condensed display face for digits. Give the capsule fixed width or enough reserved width for the longest expected value so changing digits cannot shift nearby controls.
- When a secondary active timer (e.g., rest) appears, position it as a floating overlay above the page content, not as inserted flow content that moves the exercise list. The overlay should not clip the content below or collide with the main session controls. Reserve a consistent placement and layer order; give nearby controls the same alignment as session controls.
- For rest timer controls, keep the readout centered, reset on the left with a red reset icon, skip on the right with a dark skip icon. Keep the parent transparent where the design calls for separated visual groups; use a subtle blue rest surface only where it improves state visibility.
- Use short animated entry/exit, stable dimensions, and explicit pause/resume/skip/reset states. Avoid changing container width based on changing timer digits.
- Toasts are short, specific, and nonblocking. Place them away from bottom navigation and floating controls.

## 7. Motion and interaction rules

- Use motion to explain hierarchy and state: sheet rise, modal fade/scale, tab-direction shift, card reveal, selected state, timer pulse. Keep transitions short and purposeful. Do not add motion to every element.
- Drawer open/close: slide vertically from the bottom with a modest scrim fade. Nested preview may fade/scale within the drawer but must remain a separate state. Closing one layer must not dismiss its parent.
- Popup: fade scrim and gently scale/fade the panel into place; preserve the underlying screen state.
- Tab swipe: horizontal left/right swipe on the actual tab bar navigates to adjacent top-level tabs; do not capture swipes from the entire screen. Explicit tab buttons remain usable, and a swipe must not trigger a button's click afterward.
- Respect reduced-motion preference. Ensure all gestures have equivalent visible buttons and keyboard/accessibility actions.
- Provide visible focus, pressed, selected, disabled, loading, success, and error states. Avoid optimistic success for a cloud operation that has not succeeded.

## 8. Responsive and accessible behavior

- Start with a 375–430 px mobile layout, then support compact mobile browsers and wider desktop screens. Use safe-area insets, dynamic dimensions, flexible columns, wrapping where appropriate, and bounded card/content widths.
- On short screens, reduce decorative art and vertical gaps first. Keep heading, essential information, and decision controls visible. For completion/success pages, fit the summary and primary actions within the device viewport where feasible; do not require dragging just to reveal “Done”.
- Prevent horizontal overflow, clipped titles, and input overlap. Test at both narrow width and short height. Avoid `position: absolute` for core content; reserve it for intentional overlays and anchored controls.
- Meet accessible target sizes, readable contrast, appropriate accessible labels/roles, logical focus order, and text scaling. A control whose action is icon-only needs a clear accessibility label.

## 9. Firebase architecture and data design

Use Firebase only where the target requirements need accounts, sync, realtime collaboration, or cloud backup. Read the current Firebase documentation/installed Firebase skill before adding or changing Firebase APIs; APIs and console behavior can change. Before provisioning or choosing among existing Firestore instances, identify available database editions and ask which instance is the target. Never silently create a database or choose its region.

### Boundaries and layers

- Firebase Authentication owns identity. Use Firebase UID as the account data boundary. Support the providers the product actually needs; do not store passwords yourself.
- Keep Firebase SDK calls in a provider/adapter layer (Repday example: `backend/firebase/` and `backend/BackendProvider.tsx`). Screens depend on app-facing contracts, not Firebase SDK primitives.
- Define typed domain contracts separately from Firebase document payloads. Validate data when importing external text/AI output and when parsing persisted payloads.
- Initialize Firebase once from environment configuration. Never commit private server credentials, service-account JSON, provider secrets, or API keys with privileged access. Client Firebase config is not a substitute for security rules.
- Every Firestore/Storage rule must enforce ownership (`request.auth.uid == userId`) and validate relevant field shapes, sizes, and content types. Start from deny-by-default. Review rules before deployment.

### User-owned Firestore layout

Follow a predictable root `users/{uid}` and product-focused subcollections. Repday currently uses:

```text
users/{uid}/settings/main
users/{uid}/splits/{encodedSplitId}
users/{uid}/history/{encodedHistoryId}
users/{uid}/activeWorkouts/current                         # legacy cleanup only
users/{uid}/activeWorkouts/current/sets/{moveIndex}_{setIndex} # legacy cleanup only
users/{uid}/profilePhotos/current                         # legacy cleanup only
```

Translate the structure for a new domain, for example:

```text
users/{uid}/settings/main
users/{uid}/mealPlans/{planId}
users/{uid}/foodEntries/{entryId}
users/{uid}/pantryItems/{itemId}
users/{uid}/history/{recordId}
```

Keep documents bounded and query-oriented. Avoid one ever-growing array/document for unbounded history or item rows. Store stable client IDs, ordering fields, and timestamps when those support real app queries. Use subcollections for large/repeated child data. Encode or otherwise validate document IDs derived from user-provided names.

### Local-first and synchronization

- Load local cache/state first for responsive UI, then reconcile with the authenticated user's cloud state.
- Track the owner UID associated with local cached data. When the account changes, clear or partition account-specific local state before showing the new account's data; never leak one user's cached records into another account.
- Persist preferences locally during onboarding, then sync after authentication and cloud hydration. Keep a pending-sync marker until cloud save succeeds.
- Decide per workflow whether changes are saved immediately or committed on an explicit finish/save. For multi-step sessions, keep edits local and commit a coherent record on confirmation; cancellation/discard should clear only the intended local draft and should not create history.
- Make writes narrow and proportional to the action: update one setting, item, or history record instead of rewriting every record. Use batches for related bounded writes and chunk batches below Firestore's operation limit. Use pagination for history.
- Handle offline/network failure explicitly. Do not silently treat fire-and-forget writes as durable. Keep pending local changes recoverable or report that saving failed.
- Make retryable mutations idempotent using stable IDs. Avoid duplicate records on repeated taps/retries.

### Example domain documents

For a nutrition app, a food entry might be `{clientId, mealId, foodId, quantity, unit, nutrients, consumedAt}`; a recipe/meal plan might carry `position`, date, and item references. For a fridge tracker, a pantry item might be `{clientId, name, category, quantity, unit, expiresAt, storageLocation, updatedAt}`. Normalize repeated catalog/reference data where useful; keep each user's private quantities, notes, and dates in that user's namespace.

### Authentication, deletion, and privacy

- Distinguish sign-out from account deletion. Account deletion is destructive, requires clear confirmation, and may require provider reauthentication. Delete nested user data and owned Storage objects before deleting the Auth account, and report partial failures honestly.
- Collect only data required for the experience. Request camera, notification, location, and other permissions at the moment the user invokes a feature and explain why. Keep permission-denied states usable where possible.
- If AI features are included, send only the minimum context needed, authenticate requests, validate inputs/outputs, apply abuse/rate controls where appropriate, and disclose the data flow in the UI/product docs.

## 10. Suggested implementation workflow

1. Read the repository's `AGENTS.md`/project instructions and inspect its framework, routing, state, and design tokens.
2. Convert the user's target domain requirements into the Repday visual language. Write down the token mapping, screen list, main user flows, and any places where domain semantics require a different component.
3. Build the component/token foundation before implementing all screens. Keep components cohesive and reusable: AppHeader, BottomTabBar, ActivityPanel, DomainCard, FilterChip, ListRow, BottomSheet, DecisionModal, CapsuleInput, TimerPill, Toast, and domain-specific art components as needed.
4. Implement authentication/onboarding, app shell, primary tab surfaces, detail flows, and settings. Wire real controls and state; do not ship decorative buttons with no behavior.
5. Add Firebase Auth and data adapter only after the data ownership, document shape, query, write, deletion, offline, and rules plan is clear. Keep secrets server-side and user data behind UID-scoped rules.
6. Verify the main flows at small mobile size, short viewport height, and a wider viewport; inspect light and dark themes plus any selected alternative theme. Check drawer/modal nesting, timer stability, gestures, focus, and fixed navigation in a real browser/device preview.
7. Compare the rendered screens to this spec and the source app; fix spacing, colors, typography, clipping, stale local state, and broken controls before handoff.

## 11. Quality checklist

- [ ] Condensed display face is used consistently for titles; body and data remain easy to read.
- [ ] Semantic palette is complete and every screen responds to the active theme.
- [ ] Cards, controls, chips, drawer, and modal reuse the same geometry and spacing logic.
- [ ] Illustrations are domain-specific, properly framed, and consistent in visual style.
- [ ] Onboarding choices are short, relevant, resumable locally, and editable later.
- [ ] Tab buttons and tab-bar-only swipe both work; gestures do not hijack page content.
- [ ] Drawers scroll independently, footer stays reachable, nested close only closes the top layer, and small screens do not clip.
- [ ] Timer/floating surfaces have fixed dimensions and do not shift page layout as their values change.
- [ ] Empty, loading, disabled, error, success, and offline states are designed.
- [ ] Responsive layout works on narrow and short mobile browsers without overlap or horizontal overflow.
- [ ] Firebase paths and Storage paths are UID-scoped; rules deny cross-user reads/writes.
- [ ] Local cache is associated with its owner and account switching cannot expose previous user data.
- [ ] Cloud writes are proportional, awaited/handled, retry-safe, and do not claim success before confirmation.
- [ ] Account deletion, permissions, and AI data flows are clear and appropriately gated.
- [ ] No secrets, real personal data, or fabricated domain metrics are embedded in demo content.

## 12. Reference implementation map

Use these files in the Repday repository to inspect exact behavior and refine measurements:

- `app/index.tsx` — theme palettes, app shell, tab bar, cards, workout/session surfaces, timers, drawers, modals, and interaction state.
- `components/SignInScreen.tsx` — sign-in and seven-step onboarding UI.
- `components/FormCoachCameraScreen.tsx` — native camera/form-inspection layout and permission states.
- `components/FormCoachCameraScreen.web.tsx` — browser camera preview, on-device MediaPipe pose inference, repetition feedback, and Form Coach controls.
- `assets/header-illustrations.png`, `assets/repday-loading-sprite.png` — brand art.
- `data/exercises.ts` — exercise catalog and art metadata.
- `backend/contracts.ts` — app-facing auth/data types and domain contracts.
- `backend/BackendProvider.tsx`, `backend/firebase/client.ts` — auth and SDK boundary.
- `backend/firebase/useWorkoutData.ts` — Firestore subscriptions, writes, and history pagination. Profile images come from Google sign-in through Firebase Authentication.
- `firestore.rules`, `storage.rules` — current UID-scoped authorization rules.
- `app_design_flow/frontend/onboarding.md`, `app_design_flow/backend/firestore-data-model.md`, `app_design_flow/backend/local-and-cloud-sync.md`, and `app_design_flow/backend/auth-and-account-ownership.md` — current architecture and sync behavior.

When copying this guide into another project, keep the design rules and workflow, but replace these repository paths with the target project's actual sources. Treat source code and current product behavior as the authority for exact values if this guide and the app ever diverge.
