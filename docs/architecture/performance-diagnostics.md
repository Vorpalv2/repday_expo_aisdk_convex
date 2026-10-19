# Repday performance diagnostics and verification

Assessment date: **19 October 2026**  
Application revision assessed: **`08e5ccc`**  
Scope: web startup, workout rendering, exercise media, caching and the requested user journey.

## 1. What has actually been checked

This is a baseline from production build artifacts and application source, with the results of the completed automated checks. It is **not** a browser performance trace or a completed end-to-end user test.

| Evidence | Result | What it establishes |
| --- | --- | --- |
| Production JavaScript artifacts in `dist/client/_expo/static/js/web/` | Sizes measured below | File weight and a local gzip estimate |
| Startup, timer, catalog and exercise-card source | Reviewed | Current control flow and potential hotspots |
| TypeScript check | Passed | The checked source satisfies the compiler |
| Automated suite: `npx tsx --test tests/*.test.ts` | 135 tests: 134 passed, 0 failed, 1 skipped | Covered behavior under controlled test conditions |
| Optional real Redis integration test | Skipped | Real Redis notification delivery was not validated in that run |
| Side-browser inspection at `http://localhost:8081/` | Blocked by the browser tool's saved-permission/policy gate | No rendered-page, console, network, memory or frame-rate measurements obtained |

The browser settings screenshot and the inspected local configuration both allowed localhost. The browser tool nevertheless denied access. This is an unresolved tooling restriction, not evidence of an application rendering failure. Existing chat authorization covers the requested test; the gate prevents execution. The main account was not signed out or modified, and no disposable test account was created.

## 2. Measured web bundle baseline

These files came from the production export of the assessed revision. Sizes are bytes, with decimal MB/KB used in the discussion.

| Artifact | Uncompressed bytes | Local gzip bytes |
| --- | ---: | ---: |
| `entry-cf98421e7223233248e0546db62dff58.js` | 3,724,193 | 870,148 |
| `index-05fc0f1ecb637dd84c852a8ed7d98612.js` | 45,266 | 14,780 |
| **Combined** | **3,769,459** | **884,928** |

The main entry is approximately **3.72 MB uncompressed**, or **870 KB locally gzipped**. Downloading, parsing and executing this code are relevant to first-visit performance, particularly on slower networks and devices. File size alone does not establish the time to render a usable screen.

The gzip column was computed locally with Python's `gzip.compress` at its default level 9. It is not a measurement of production transfer bytes. Actual delivery depends on server compression, negotiated encoding, HTTP caching and which resources are requested. The table excludes HTML, styles, images, GIFs, loading sprites, API traffic and the external exercise catalog. It must not be presented as the total page weight.

To reproduce against a fresh export:

```python
from pathlib import Path
import gzip

for path in sorted(Path('dist/client/_expo/static/js/web').glob('*.js')):
    data = path.read_bytes()
    print(path.name, len(data), len(gzip.compress(data, compresslevel=9)))
```

There is no equivalent measured older-build baseline in this assessment. No bundle-size improvement or regression percentage can yet be calculated.

## 3. Performance improvements already implemented

| Area | Current implementation | Expected benefit | Evidence boundary |
| --- | --- | --- | --- |
| Mobile/Safari authentication | Web Auth preserves its persistence hierarchy but defers the Google popup resolver until sign-in/linking/reauthentication requests it | Restoring a session no longer depends on eagerly loading the popup iframe | SDK initialization and application source were inspected; affected-device latency was not measured |
| Entry loading | Fixed three-second animation gates were removed | Avoids deliberate waiting after entry conditions are ready | Code change, not a measured three-second gain on every launch |
| Startup requests | Workout data starts alongside the billing gate once auth and the entry route are ready | Independent requests can overlap | Real network overlap/timing still needs a trace |
| History loading | Initialized accounts can render usable settings/splits while current-week history loads | History latency need not hold the entire app on the loading screen | Controlled regression checks cover a stalled history request |
| Split cache | A complete account-scoped snapshot is reused when its revision matches | Avoids downloading unchanged splits | Automated cache-hit checks; actual Firestore invoice totals are not measured here |
| Initial connection recovery | Two bounded automatic retries precede manual recovery when required data stalls | Can recover without a user pressing Try again | Failure recovery, not a guarantee of lower network latency; retries may add reads |
| Late history delivery | History confirmation is separate from the split-hydration version | A history response does not reset split edits made while waiting | Controlled regression checks |

The existing billing gate still has a five-second fallback, and Firebase Auth retains a separate fifteen-second recovery screen. A genuinely new device still needs authoritative account data. See [Startup hydration and recovery](startup-hydration.md) for the detailed sequence and limits.

## 4. Potential slowdowns and variable performance

These are source-based candidates for profiling, not confirmed runtime regressions.

| Candidate | Observed code behavior | Possible impact | Measurement needed |
| --- | --- | --- | --- |
| Large initial JavaScript entry | Main entry has the weight recorded above | Higher cold-download and parse/execute work | Actual transfer, script execution and first-usable-screen timings |
| Workout clock updates | `WorkoutApp` updates its `now` state every second while an active workout or rest deadline exists, and every 30 seconds otherwise | Re-renders the large parent component and may repeat unrelated render calculations | React commit/render duration and long-task trace during a workout |
| All exercise cards mounted | `WorkoutCards` maps the full exercise list into a horizontal `ScrollView` | More mounted controls/media as a split grows; possible memory and render cost | Heap/DOM growth and swipe smoothness for small versus large splits |
| External catalog loading | Mounting the workout screen requests the GitHub-hosted exercise catalog; a component-local promise deduplicates calls within that instance | Cold/warm differences depend on HTTP cache and network; remounting creates a new instance | Request count, cache-hit status, download/parse time and behavior after navigation/reload |
| Catalog matching | Media enrichment repeatedly normalizes names and searches the catalog, with containment/fuzzy fallback for unmatched names | More work for many moves or custom names when enrichment runs | CPU profile during catalog arrival and split hydration |
| Exercise media | Image/GIF URLs reference external resources; requested assets vary by exercise | First display, animation decoding and failed requests can affect perceived responsiveness | Media timing, decode cost, memory and fallback behavior |

`WorkoutCards` configures GIF autoplay only for the currently selected exercise and requests `cachePolicy="disk"`. Those are useful controls in the source. They do not prove that inactive cards perform no network/decode work or that a particular browser serves media from disk cache; verify those effects in the target browser.

Search/filter results already use `useMemo` in several places. The existence of a one-second parent timer does not establish that every catalog search repeats on each tick. Profiling should identify actual expensive work before changing component boundaries or caching strategies.

## 5. Runtime measurements still needed

Use the same build, viewport, account fixture and network conditions for comparisons. Record cold and warm runs separately and repeat them, retaining the run count, median and slowest observed result. Do not mix development-server timings with production-build timings.

| Scenario | Measure | Status |
| --- | --- | --- |
| Fresh browser/PWA launch | Time from navigation to sign-in/onboarding or usable Home; loading/recovery screens encountered | Not measured |
| Returning account with valid cache | Time to usable cached content and time until cloud reconciliation completes | Not measured |
| New-device account login | Auth, billing, settings, split and history timing boundaries | Not measured |
| Workout active for several minutes | Render/commit cost, long tasks, timer responsiveness and memory trend | Not measured |
| Exercise-card and drawer gestures | Missed frames, input delay, correct exercise index and drawer endpoint | Not measured |
| Image/GIF switching | First display time, cache reuse, decoder work and unavailable-media fallback | Not measured |
| Weekly activity navigation | Cached versus uncached week latency; empty-week handling; repeated-range requests | Not measured |
| Add/edit split and exercise | Input responsiveness, save acknowledgment and persistence after refresh | Not measured |
| Narrow viewport and keyboard | Control visibility, scrolling, focus handling and layout movement | Not measured |
| Interrupted/slow connection | Cache usability, retry frequency, recovery outcome and extra request counts | Not measured |

No FPS, heap-growth, Core Web Vitals, startup speedup or before/after latency number is established by this document. Automated tests and bundle measurements cannot substitute for those observations.

## 6. Requested browser journey and additional checks

All rows below are **pending browser execution**. Passing related automated tests does not mark a row complete.

| Step | User action and expected verification |
| --- | --- |
| Main-account protection | Sign out of the main Google-linked account; make no changes to its saved app data |
| Signup and onboarding | Create a disposable account, complete preferences, build a routine and reach Home without manual recovery |
| Persistence | Refresh and verify the routine, schedule and preferences remain correct |
| Split creation/editing | Add a split, add an exercise to an existing split, use exercise filters, save and verify after reload |
| Workout logging | Start a workout; edit weights/reps; complete sets; add/remove a set; pause/resume and minimize/reopen |
| Workout completion/history | End the workout; verify saved sets, volume, duration and session details in Progress |
| Weekly activity | Navigate backward/forward, verify date ranges and current-week boundary, inspect an empty week and revisit a cached week |
| Schedule swap | Swap today/tomorrow, refresh, then swap back and verify restoration |
| Rest day | Cancel the confirmation once, then mark rest, refresh, undo and verify the original assignment |
| Active-workout navigation | Start another workout and visit Profile/weekly-plan editing; check workout state survives navigation |
| Themes and free gating | Change a free theme, verify persistence, and inspect Plus badges/popup for premium themes and Cards mode |
| Checkout cancellations | In sandbox mode, start/cancel checkout, return through Continue checkout and cancel again |
| Checkout completion | Complete a simulated sandbox payment, verify the subscription and premium entitlement |
| Premium features | Open AI Coach, test a response/history, inspect form-inspector entry and add another split |
| Additional edge cases | Empty search results, large splits, media failure, input validation, narrow layouts and interrupted connectivity |
| Cleanup | Delete only the disposable account; verify its data cleanup and subscription cancellation, and restore any temporary sandbox server configuration |

At preparation time the local server was in **live payment mode**. A read-only API check confirmed existing test credentials could access the monthly INR sandbox plan (7,500 paise). The live configuration was not changed and no checkout was initiated. Payment success tests must run in a separately prepared sandbox configuration; the successful plan lookup is not proof that the checkout flow passes.

## 7. Interpreting performance and database cost together

Fewer database reads can reduce network work, but they do not guarantee smoother rendering. Likewise, removing a loading gate can improve time to interaction while history continues in the background; it does not mean that history returned faster. A bounded retry can improve recovery while increasing the reads performed on that failed startup.

Track elapsed time, UI responsiveness, cache behavior and request/document operations separately. Reuse the [app-wide database I/O reference](app-database-io-reference.md) and [split revision cache documentation](split-revision-cache.md) when analyzing read/write changes. Actual hosting transfer, Firestore billing and device profiling require their own observations.

## 8. Sources and follow-up

- `app/index.tsx`: entry gates, workout clock, catalog fetch/enrichment, memoized filters, local hydration and active workout state.
- `components/WorkoutCards.tsx`: mounted card list, scroll/index synchronization, media autoplay and cache policy.
- `backend/firebase/client.ts` and `googleSignIn.ts`: Auth initialization and deferred popup resolver.
- `backend/firebase/useWorkoutData.ts` and `splitCache.ts`: cached snapshots, history confirmation and startup retry policy.
- `tests/auth-startup.test.ts`, `startup-hydration.test.ts`, `split-cache.test.ts` and `week-history-query.test.ts`: controlled startup/cache/query verification.
- Local production artifacts in `dist/client/_expo/static/js/web/`: measured file sizes; these generated files are not committed.

When browser access works, replace pending statuses with actual results, capture the relevant screenshots/traces and record the tested build/device. Only then label a suspected hotspot as a confirmed regression or claim a measured performance gain.
