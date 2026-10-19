# Repday database I/O and optimization reference

Audit date: **19 October 2026**. This describes the current Firebase implementation, including revision-based split caching and complete current-week history loading. Counts below come from application code, not a production billing trace. Earlier Convex-era case studies and fixed-seven-history descriptions are historical references.

## 1. What counts as a database operation

Firestore document reads, writes, and deletes are separate from HTTP requests, Redis commands, AI tokens, Firebase Authentication calls, asset downloads, and local storage. A request can do several database operations; another network request can do none.

- A query returning six workout documents normally means six document reads, not one. An empty server query still has a minimum read charge.
- A batch or transaction is atomic, but still charges for each document written or deleted. Updating ten fields in one document is one document write.
- Listeners have initial reads and can incur reads when documents change or the listener reconnects. Metadata-only callbacks do not by themselves imply another billed document read.
- Reading AsyncStorage/localStorage or Firestore's local cache is not a server document read. Writing local storage is not a Firestore write.
- Transaction retries, failed preconditions, permission checks that read other documents, SDK reconnects, and explicit retry actions can increase counts. Current ordinary private-data rules use ownership/data validation without extra document lookups.

See the authoritative [Firestore pricing and operation rules](https://firebase.google.com/docs/firestore/pricing). This document gives operation counts rather than currency estimates because rates, free allowances, and other service costs must be applied separately.

## 2. Where the app keeps data

| Store | Data | Firestore operation cost |
| --- | --- | --- |
| React state | Current UI, filters, edits, workout timers, derived stats | None |
| AsyncStorage / browser local storage | Sessions, revision envelopes, history, schedule, preferences, active workout recovery, onboarding/plan drafts, recent Coach chats | None |
| Firestore IndexedDB cache on web | Previously read Firestore documents | Local cache access has no server operation cost |
| `users/{uid}/settings/main` | Preferences, weekly plan, date overrides, auto-rest cursor, focus draft, selected split, split revision | Document operations below |
| `users/{uid}/splits/{encodedId}` | Saved split, position, set targets | Document operations below |
| `users/{uid}/history/{id}` | One complete record per finished workout | Document operations below |
| `users/{uid}/coachConversations/{id}` | One complete transcript/context document per Coach conversation | Document operations below |
| `splitQuotas/{uid}` | Server quota transaction lock/revision | Server reads and writes |
| `billingAccounts`, `billingSubscriptions`, `billingEvents` | Entitlement, subscription owner mapping, webhook deduplication | Server reads and writes |
| `planTemplates/catalog-v1` | Published training-plan templates | Optional catalog document read |
| Upstash Redis | Billing cache, rate limits, web push subscriptions and timer state | Redis costs, not Firestore operations |
| QStash / browser push services | Delayed rest-alert jobs and delivery | Queue/push work, not Firestore operations |
| GitHub-hosted exercise catalog / image endpoints | Exercise JSON, images and GIFs | Network/CDN costs, not Firestore operations |
| Firebase Authentication | Sign-in, tokens, provider linking, account deletion | Auth service operations, not Firestore document operations |

Local data persists across ordinary browser restarts without an app-defined expiry. Browser clearing, eviction, private browsing, different browsers/origins, quota failure, and account deletion can remove it. This is persistent caching, not guaranteed permanent storage. Firestore's local cache and our complete split envelope serve different purposes.

## 3. The optimization decisions

| Previous behavior / problem | Current optimization | Benefit and tradeoff |
| --- | --- | --- |
| Unconditionally download every split on startup, plus a separate Plus split listener | Complete per-account snapshot + revision in existing settings document | Zero split collection reads on a warm unchanged launch; revision writes on split edits |
| Loading only seven records could omit current-week workouts | One bounded Monday–Sunday query covering all current-week workouts | Home activity and Recent sessions share complete current-week data; busy weeks read more than seven documents |
| Several screens could request the same historical week | Deduplicate completed/in-flight range requests in the backend hook | Repeated same-range weekly browsing is free during that hook lifetime |
| Profile changes could write as each option changed | Local settings draft, explicit Save, signature/in-flight deduplication | Several preference choices can become one settings write |
| Every active rep/set/timer change could cause writes | Active workout lives locally until finish | No per-rep, per-set or per-second Firestore write |
| Repeated identical split saves | Server compares split data/position/targets | No split/quota/revision writes for a genuine no-op; validation reads still happen |
| Repeated paid-access checks | Server Redis entitlement cache; client status retained during session | Usually no Firestore billing read on a cache hit |
| Saving each streamed Coach chunk | Save the conversation once after a complete reply | One conversation write per completed reply rather than many chunk writes |
| Broad automatic history reads | Fetch old history when requested, or when overdue rest catch-up requires it | Lower routine startup reads, with explicit history-loading costs |

The [split cache design](split-revision-cache.md) explains the boolean-versus-revision reasoning, raw snapshot format, atomic updates, races, and migration in detail.

## 4. Returning app launch or refresh

Definitions:

- `S`: number of saved split documents.
- `W`: completed workout documents in the current account-local Monday–Sunday week.
- `B`: 0 on a server billing-cache hit; 1 on a miss when Firestore billing storage is configured.
- `Q(n) = max(n, 1)`: the normal returned-document/minimum-query estimate.

For a warm valid split cache, the ordinary startup baseline is:

```text
Reads = 1 settings + Q(W) current-week history + B billing
Writes = 0, unless a preference/cursor/focus change needs saving
Split document reads = 0
```

| Example | Before explicit split refresh | Current warm-cache baseline |
| --- | ---: | ---: |
| Six splits, empty week, billing cached | 8 reads | 2 reads |
| Six splits, empty week, billing cache miss | 9 reads | 3 reads |
| Six splits, five workouts this week, billing cached | 12 reads | 6 reads |
| Six splits, ten workouts this week, billing cached | 17 reads | 11 reads |

The before column excludes the overlapping old Plus collection listener; do not claim it always doubled billing. The new columns are conditional baselines, not exact guarantees for every launch.

On a cold browser, cleared cache, corrupt envelope, or revision mismatch, add `Q(S) + 1` reads: split collection plus a settings verification read after the collection fetch. For six splits and no current-week workouts this makes the startup baseline 9–10 reads. Subsequent unchanged launches return to 2–3.

Existing accounts without a revision additionally incur one initialization transaction read and one settings write, with possible listener delivery. A brand-new settings document created just for this migration is explicitly marked `initialized: false` so the existing legacy-import flow remains available. Successful onboarding normally creates revision metadata during plan installation, avoiding that migration.

Other startup exceptions include automatic-rest catch-up, expired daily focus clearing, a timezone/week rollover, changes in Plus/live-sync status while startup is resolving, failed request retries, and any required preference synchronization. A transition between one-shot history fetch and live history listener can retarget the query and incur additional reads. Do not assume all session-start operations are captured by a fixed number such as nine.

Startup now begins the data hook alongside billing after the entry route is ready; initialized accounts can render before history completes. Stalled initial hydration allows two automatic subscription retries, which can add reads only when those retries occur. See [Startup hydration and recovery](startup-hydration.md) for timing, cache boundaries and verification.

## 5. Sign-up and onboarding

### Authentication and onboarding choices

Creating an email/password account, signing in with Google, restoring authentication, or linking Google does not itself create a Firestore user-profile document in the current provider. These use Firebase Auth. Onboarding goal, equipment, weekdays, themes, rest preferences, and step navigation are local drafts: **0 Firestore reads and writes per choice**.

Opening the training-plan builder attempts to load `planTemplates/catalog-v1`: normally one document read when fetched from the server. It uses `getDoc`, so offline fallback can use cache, and a bundled catalog keeps the builder available if the request fails. Plan generation and every preview change are local computations; there is no database read for each generated split preview.

### Installing a plan with K new splits

The authenticated `/api/splits` transaction reads quota and billing documents plus the existing split library for quota validation. With a fresh six-split install, this is normally:

```text
1 quota lookup + 1 billing-account lookup + 1 empty-library query minimum
= 3 Firestore reads in the server transaction

6 new split documents + 1 settings document + 1 quota document
= 8 Firestore writes
```

The split revision increments once within that settings write. Optional final onboarding preference sync can add one settings write. It is not a write per onboarding screen. A repeated installation that is truly unchanged can avoid split writes; provided settings can still cause a settings/quota write.

After installation, the main app performs its first data load. On the clean six-split example this adds settings 1 + splits 6 + revision verification 1 + empty current-week history 1 + billing `B` = **9 + B reads**. A final preference write can also be delivered to the settings listener.

Therefore a clean full flow is better budgeted in phases: plan catalog about 1 read; plan installation about 3 reads/8 writes; initial main-app data about 9–10 reads; final preference synchronization if needed. That is roughly **13–14 reads and 8–9 writes before optional listener deliveries/retries** for this specific six-split happy path. It is not the same as a returning warm launch. Existing local data imports, a skipped builder, fewer splits, or extra preference changes change the total.

## 6. Profile preferences and schedule actions

| Action | Explicit Firestore reads | Writes | Other possible work |
| --- | ---: | ---: | --- |
| Open Profile / benefits modal | 0 | 0 | Uses loaded settings, auth and billing state |
| Change several draft preferences | 0 | 0 | Local draft only |
| Cancel preference draft | 0 | 0 | Discards local draft |
| Save changed preferences | 0 | 1 settings | Settings listener may deliver the changed document |
| Save identical preferences | 0 | 0 | Signature comparison skips the call |
| Same settings save already in flight | 0 | 0 additional | Reuses deduplication guard |
| Change recurring weekly assignment from Home | 0 | Normally 1 settings autosave | Selected split can be saved with the same state change |
| Weekly assignment in preference draft | 0 | 0 until Save | Included in the eventual settings save |
| Mark today rest / undo today rest | 0 | 1 settings | Clears today's schedule override atomically; confirmation itself costs nothing |
| Swap today and tomorrow | 0 | 1 settings | Replaces the date-override map; no split writes |
| Expand/collapse activity temporarily | 0 | 0 | UI state; saving default collapse preference uses Save |
| Theme change staged in Profile | 0 | 0 until Save | Theme/Plus rendering itself does not read Firestore |
| Change active workout List/Cards or Image/GIF | 0 | 0 | Local display state |
| Contact me / open mail client | 0 | 0 | Opens mailto; no database call |

The existing settings listener is separate from the explicit read column: each changed document delivered to a connected listener may cost a read for that client. Other open devices can also receive it. Multiple independent autosave transitions are not guaranteed to collapse into one write; the code deduplicates identical values, not every distinct sequence of values.

The daily auto-rest cursor can advance and save settings even if the user never opens Profile. This is intentional state maintenance, not an unconditional write on every refresh. If its cursor is older than the current Monday, the app first loads the missing historical interval so completed workouts are not incorrectly marked as rest; that range costs `Q(returned workouts)` reads once per range per hook lifetime.

## 7. Adding, editing, importing and deleting splits

The API always enforces quota against server data. A browser cache cannot safely authorize creating a seventh split. Authentication lookup and Redis rate limiting happen as well, but are not Firestore document operations.

### Server validation reads

| API operation | Typical transaction reads |
| --- | --- |
| Edit one existing split | Quota 1 + billing 1 + requested split 1 = **3** |
| Add one new split to S existing splits | Quota 1 + billing 1 + missing requested split 1 + full existing library `Q(S)` = **3 + Q(S)** |
| Multi-split save / library replacement | Quota 1 + billing 1 + existing library `Q(S)` = **2 + Q(S)** |

A new split added to an empty library therefore has a typical four-read validation path; adding one to six existing splits has a nine-read path before any quota rejection. Rejection can still incur reads, although it writes nothing. These server reads are independent of whether the requesting browser already has cached copies.

### Saved writes and composite UI actions

| Operation | Document writes/deletes |
| --- | --- |
| Save/add one changed split via API | 1 split + 1 settings revision + 1 quota = **3 writes** |
| K changed splits in bulk request, no provided settings | K splits + 1 settings revision + 1 quota = **K + 2 writes** |
| Plan install with settings | K splits + 1 combined settings/revision + 1 quota = **K + 2 writes** |
| Unchanged split request, no settings | **0 writes**, validation reads remain |
| Append saved exercise after workout | 1 split + 1 settings revision = **2 writes** per appended exercise |
| Save weight/rep target batch for one split | 1 split + 1 settings revision = **2 writes**, regardless of target count |
| Backend delete primitive | **1 split delete + 1 settings revision write** |
| Backend reorder primitive for R IDs | **R split writes + 1 settings revision write** |

The UI's **Delete split** action is composite: it deletes the split, then reorders all remaining IDs, then can autosave the cleaned weekly plan/selected split/focus. With `R > 0` remaining splits, budget one delete plus `R + 2` writes for the two revision batches, plus normally one settings autosave when schedule/selection/focus changes. It is not just one delete operation. Reordering after deletion is an existing path; consolidating it is a possible future optimization.

Adding a split changes the selected split and can add a settings autosave beyond the API's three writes. Adding/removing/reordering an exercise or saving its edited targets in the saved split editor uses the split-save API. Text entry inside the exercise editor is a local draft until saved. The today's-workout editor stores a focus draft in settings rather than rewriting the original split. Individual committed editor actions can each call the API; they are not all combined into one final split-editor save.

Import preview, exercise matching, image prefetch and local note parsing have no Firestore writes. Committing the import uses the library sync API: it validates against the existing library and only writes changed/new splits, plus quota and revision settings. Its replacement mode includes the full supplied retained library, avoiding deletion of the retained splits; genuinely omitted IDs are deleted.

Recognized local revisions patch the complete browser cache without a split query. Unknown operations, concurrent revision jumps, missing caches, and interrupted acknowledgments use the full-refresh path. Plus devices with live sync enabled may each read the updated settings document and refresh their own split collection. The optimization removes repetitive unchanged startup reads, not the work needed to distribute actual changes.

## 8. Active workout, sets, timers and finishing

Starting, pausing, resuming, minimizing/maximizing, swiping exercises, changing weight/reps, completing sets, adding/removing active sets, and counting seconds run in React state with local recovery persistence. They do **not** write an active-workout Firestore document or a document per set in the current client.

Rest alerts can use Redis/QStash or local native notifications; see section 13. A local countdown tick is not a cloud call. Form Coach counting and UI completion callbacks use the same active workout state.

Finishing one workout normally writes **one history document containing the session snapshot and totals**. If weights/reps changed against the saved split, add **two writes** for one split-target batch and its revision. Each new exercise opted into the saved split adds **two writes** for the append and revision.

```text
Finish writes = 1 history + 2 × targetBatchPresent + 2 × savedExerciseAdditions
             + any changed settings/focus cleanup save
```

Example: one workout, targets changed, one opted-in new exercise = five direct document writes, plus an applicable settings cleanup save. A Plus history listener can read the new history document; the settings listener can read each revision/settings update. Free/no-live clients already have their locally added history row, so showing Progress requires no new history fetch for that row.

Discarding an active workout removes local recovery state and cancels timer work; it does not delete saved Firestore history or the original split. Historical workout deletion is **one history document delete**, plus potential live query delivery. Screenshot export, sharing the summary and manual Apple Health handoff have zero Firestore operations. Apple Health is a manual handoff in this app, not an automatic database sync.

## 9. Weekly activity and Recent sessions

The startup range is account-timezone Monday 00:00 through the following Monday, with an exclusive end. It includes all workouts in that week, even more than seven. A week spanning daylight saving need not contain exactly 168 hours.

Home activity, Progress activity, and the default Current week Recent sessions display the same loaded history. Showing these components does not launch a separate query for each. Empty current-week data does not mean the account has no older history.

| User action | Read behavior | Writes |
| --- | --- | ---: |
| Show current-week activity or Current week history | Reuse startup data | 0 |
| Swipe right-to-left into the next/current week | One bounded query only when that week is not already loaded, approximately `Q(N)` document reads | 0 |
| Swipe left-to-right into an older uncached week | A separate bounded Monday–Sunday range query, charged for that week's documents | 0 |
| Revisit the exact loaded weekly range in the same hook lifetime | 0 additional reads | 0 |
| Return right-to-left to the current week | Reuse current-week data | 0 |
| Move past current week | Blocked | 0 |
| Reload and request an older week again | Range-request map is not persisted; may query again | 0 |
| Change current week/timezone | Retarget the startup query/listener | 0 directly |
| Pick a history date | One day-bounded server query, `Q(N)` reads | 0 |
| Load older workouts | Cursor query, up to requested count, charged per returned document | 0 |

The date-picker guard avoids requesting the same last-selected day repeatedly, but it is not a persistent all-dates coverage cache. Returning to a date after selecting another can query again. Older-week requests are deduplicated by exact `(uid, start, end)`, not by whether some overlapping records happen to exist in local history. An empty old week is cached too for the current hook lifetime.

The Last 7/14/30 days UI currently uses count-based incremental loading to reach a target record count, then filters by date. It does not prove that every record in a busy date range has been fetched. Likewise, progress totals/graphs derive from loaded/cached history, not a server-side lifetime aggregate. On a new browser, current-week data alone cannot establish lifetime totals. These are current boundaries, not optimizations we have already implemented.

## 10. Search, filters, media and instructions

The exercise catalog is fetched as JSON from GitHub and supplemented by bundled exercises. A shared promise avoids redundant catalog requests within an app instance; a failed request can retry. Browser HTTP caching can help across launches, but the app does not claim an indefinitely persistent full-catalog revision cache.

Search typing, body-part/target/equipment filters, exercise preview, language selection, and Image/GIF switching run against loaded data. They have **0 Firestore reads and writes**. Images, GIFs, prefetches and catalog JSON are still network/asset traffic, so zero Firestore operations does not mean zero bandwidth. Adding the chosen exercise to a saved split incurs the split-save costs above.

## 11. AI Coach and saved conversations

Opening the Coach tab builds training context from already loaded splits, goals, timezone and history. It loads the account's local recent-conversation cache. It does not automatically fetch all cloud conversations. Expanding exact context, typing a question, opening a cached conversation, and starting an empty new chat are local operations.

Sending a Coach question:

1. Client checks its current entitlement state.
2. Server verifies Firebase identity and checks Plus access using the shared billing cache. This is **0 Firestore billing reads on cache hit, otherwise 1** when billing enforcement/storage applies.
3. Redis rate limiting runs. The AI request uses the supplied bounded context and previous messages; it does not query workout history again on the server.
4. AI response streams to the client. Individual chunks update UI state only.
5. After a complete reply, `saveCoachConversation` runs a transaction: **1 conversation read + 1 conversation write**. The whole transcript is one document. A stale conversation revision is rejected rather than overwritten.

The usual completed-turn cost is therefore **1–2 Firestore reads and 1 write**: one transcript transaction read, plus an optional entitlement cache miss. AI Gateway/model tokens and Redis commands are separate costs. Failed/interrupted generation does not save a complete transcript; any authentication/entitlement/rate-limit work already performed can still have cost. Retry saving runs the transaction again; retry generating runs another AI request.

Coach History explicitly fetches **up to 8 documents per page** ordered by `updatedAt`. Opening or refreshing that drawer requests the first cloud page, even when local chats are already visible. Loading older pages reads their returned documents. A conversation's many messages do not multiply the read count: one conversation is one document. The local cache retains up to 12 recent encoded conversations. The current component does not present a cloud transcript deletion action; account deletion clears them.

## 12. AI workout-note import and Form Inspection

Local note analysis uses the catalog and parser: 0 Firestore operations and no model request. AI note analysis verifies Firebase identity, uses Redis rate limiting, and calls AI Gateway; its current endpoint does not perform a Firestore billing lookup. Parsing a response and previewing it do not save a plan. Pressing the import save action incurs the split import transaction costs from section 7. Repeated analyses incur repeated model/Redis work even before saving anything.

Form Inspection/Coach camera uses local camera preview and, on web, MediaPipe pose processing. Opening it uses the already loaded client Plus status rather than issuing an AI Coach request per camera frame. It does not upload a video or write frame/pose data to Firestore. Model/script downloads and MediaPipe's disclosed metrics are separate network activity. Any completed set is handled by the normal local workout flow, with persistence at finish.

## 13. Rest notifications and native workout surfaces

| Action | Firestore R/W | Other service work |
| --- | --- | --- |
| Fetch `/api/push` configuration | 0 / 0 | HTTP response from environment configuration |
| Enable/reconnect web rest alerts | 0 / 0 | Firebase Auth verification, Redis rate limit, subscription HSET + EXPIRE, browser push registration |
| Start/change/cancel a web rest deadline | 0 / 0 | Auth/Redis limiter, Redis timer script; future deadline enqueues a QStash job |
| Countdown tick | 0 / 0 | Local UI calculation |
| Deliver rest alert | 0 / 0 | QStash signature check, Redis claim/recheck/finish, browser push HTTP request |
| Skip stale/duplicate/cancelled job | 0 / 0 | Redis checks; no new workout write |
| Disable web alerts | 0 / 0 | Redis device deletion, browser unsubscribe, local preference update |
| Native rest notification / Live Activity / Android timer | 0 / 0 | Device OS APIs |

Redis Lua scripts execute several logical commands atomically; one script request should not be mistaken for one Firestore read or for a guaranteed one-command Redis bill. Notification reconnection can happen on startup and timer cancellation can happen on cleanup. Zero Firestore cost here does not mean zero Redis/QStash traffic.

## 14. Billing, Plus access and account details

The client requests billing status at sign-in/mount and normally refreshes after four hours, including on foregrounding when due. It deduplicates in-flight checks within that runtime. A full browser refresh starts a fresh client runtime.

The server caches paid account status in Redis for up to four hours, bounded by paid expiry. Complimentary/manual access, free/missing, and expired states use a five-minute TTL. Missing account results are cached too. Cache failure falls back to Firestore; mutation paths invalidate the cache. Browser rendering of Plus badges and locked themes does not read billing directly on each render.

| Operation | Typical Firestore reads | Writes |
| --- | ---: | ---: |
| Ordinary `/api/billing` status | 0 cached / 1 miss | 0 |
| Explicit `/api/billing/access` check | 0 cached / 1 miss | 0 |
| Open already loaded membership/benefits | 0 | 0 |
| Open account details dialog | 1 billing account | 0; provider calls if a subscription exists |
| Start a new subscription checkout | 1 billing account | 1 reservation + 1 final account + 1 subscription-owner mapping = 3 |
| Resume existing unpaid current-plan checkout | 1 billing account | 0 on the reuse path |
| Signed payment verification | Mapping 1 + account 1 = 2 | 1 account if entitlement/state changes; 0 if unchanged |
| Explicit Refresh access, manual/no subscription | 1 account | 0 |
| Explicit Refresh access, subscription present | Account 1 + mapping 1 = 2 | 0 or 1 account |
| Cancel renewal | 1 account | Normally 1 account; preserves verified paid-until date |
| Prepare account deletion | 1 account | 1 deletion-lease account write when configured |

Razorpay subscription, invoice, payment and token requests are provider API calls, not Firestore reads. Failed checkout can add a cleanup write; version conflicts can require retries. Payment verification callbacks can retry while provider state settles. The hosted runtime's outbound HTTP call limit is also different from Firestore operation counts: OAuth token acquisition, authentication, REST begin/commit, provider calls and Redis can all consume outbound requests.

Signed subscription webhooks normally read the owner mapping in the route, the mapping again inside reconciliation, the billing account, and the event-deduplication document: approximately **4 reads** on that path. A new applicable event commits an account document and event marker: **2 writes**; duplicate or superseded events take different paths. The code compares versions to prevent reordered updates overwriting a newer entitlement.

Checkout recovery is staged: prepare reads an account, token verification stages call the provider without Firestore reads, and retiring a verified failed checkout reads the account and writes a lease plus final state (normally two writes). A new checkout afterward adds its own operations. There is no single fixed cost for all recovery branches.

## 15. Account deletion and profile identity

Profile identity/avatar display currently uses Firebase Auth/Google provider data; merely displaying the avatar does not read a custom profile-photo Firestore document. The current app has no regular custom photo-upload writer. Deletion still checks the legacy `profilePhotos/current` document so it can clean up an existing uploaded Storage object.

Deletion reauthenticates first, then prepares/cancels billing, then reads and deletes user data, then deletes the Firebase Auth identity. The user-data phase reads:

- One profile-photo document lookup.
- Active-workout documents to discover nested set collections.
- Each discovered nested set collection.
- Each of six user subcollections: settings, splits, history, activeWorkouts, profilePhotos and coachConversations. The active-workout collection is consequently queried twice in this path.

Budget returned-document reads with a minimum for each empty query, plus one delete per discovered user/set document and one parent user-document delete. Photo bytes/object deletion are Firebase Storage work, not Firestore document operations. The count grows with saved history/transcripts and cannot be summarized as one read/one delete. Billing audit/mapping/event records are separate from the enumerated user subcollections; deletion preparation is not a bulk deletion of every backend billing record. Local `repday.*` keys are cleared after successful account deletion.

Signing out, linking Google, contact email, profile identifiers shown from Auth, and copying an identifier use no direct Firestore document writes; auth transitions and notification cleanup can cause their usual follow-on app behavior.

## 16. Worked usage examples and savings

**Stable six-split user, 30 warm launches:** six explicit split reads avoided per launch = **180 avoided reads**. One thousand equivalent accounts avoid **180,000**. This assumes surviving caches and unchanged revisions; it excludes history, billing, listener events, migrations and catch-up work.

**Same user edits a split once:** the edit still needs three validation reads, three writes, and settings listener delivery. Relative to the old split edit path, the revision adds one settings write. The same browser can usually patch its certified cache with zero split refresh reads. Other Plus/live devices may refresh their six splits and perform a verification read. This is an explicit read/write/freshness tradeoff, not a claim that every operation got cheaper.

**Ordinary workout with unchanged saved targets:** zero Firestore set/rep/timer writes while exercising; one history write at finish; a live history listener can read the new record; focus/settings cleanup is additional when applicable. Progress immediately reuses local history. Web alerts add Redis/queue work when enabled.

**Browse three old weeks containing five, four and zero workouts:** approximately 5 + 4 + 1 = **10 history reads** on first requests, zero additional history reads for revisiting those exact ranges in the same hook lifetime. Reloading clears the range coverage map, even if individual workout records remain locally stored.

**Five successful Coach replies in one conversation:** normally five transcript reads + five transcript writes, plus zero or more entitlement cache misses and separate model/Redis costs. A later first-page History refresh can reread that conversation as one of its up-to-eight documents.

## 17. Boundaries and future opportunities

The following are not implemented savings and must not be presented as current behavior:

- Per-split revision manifests/deltas: a remote account-revision mismatch currently refreshes the complete split library.
- Durable historical-range coverage across browser launches, including overlap-aware date coverage.
- Guaranteed complete 7/14/30-day history retrieval or authoritative lifetime aggregates.
- Combining delete/reorder/schedule cleanup into one logical split operation.
- Combining all finish-time target/appended-exercise changes into one split batch.
- Eliminating quota validation reads when creating splits or making every saved-editor action a draft.
- Calling browser persistent-storage permission APIs or guaranteeing local retention forever.
- Detecting arbitrary console edits or older client writes that do not advance `splitsRevision`; all writers must adopt the protocol.

## 18. Source map and verification

| Source | What it establishes |
| --- | --- |
| `backend/firebase/useWorkoutData.ts`, `splitCache.ts` | Startup, revision cache, settings deduplication, split writes, history queries |
| `backend/firebase/historyQueries.ts`, `lib/activityWeek.ts` | Account-local week boundaries and older-history pagination |
| `lib/server/splits.ts` | Server quota/billing reads, changed-split detection, atomic revision writes |
| `components/SignInScreen.tsx`, `TrainingPlanBuilder.tsx`, `backend/firebase/trainingPlans.ts` | Local onboarding drafts, catalog read and plan installation |
| `app/index.tsx` | Actual composite UI actions, finishing, settings drafts, auto-rest, catalog/media and history filters |
| `components/CoachScreen.tsx`, `backend/firebase/coachHistory.ts`, `app/api/coach+api.ts` | Local context/cache, page size, one save per complete reply and entitlement check |
| `app/api/analyze-workout+api.ts`, `app/api/_lib/aiRateLimit.ts` | AI import and Redis rate limiting |
| `hooks/useBilling.ts`, `lib/server/billing*.ts`, `app/api/billing/*` | Client cadence, Redis TTLs, checkout/reconciliation/webhook operations |
| `lib/restPush.web.ts`, `lib/server/webPush.ts`, `app/api/push/*` | Notification state outside Firestore |
| `backend/BackendProvider.tsx`, `backend/firebase/deleteAccount.ts` | Auth behavior and collection cleanup |

Automated tests cover split-cache hits, races, local acknowledgment and cross-account isolation; quota/revision transaction writes; billing cache/lifecycle/budget branches; Coach streaming/history; history date bounds; schedule persistence; onboarding plan generation; deletion and push guards. A warm local browser reload was also observed loading a saved revision with no explicit split server-fetch message. These checks validate code behavior; they are not measurements of a production Firestore invoice.

For actual before/after billing, compare Firestore usage over equivalent periods with similar account counts and behavior. Separate new-device/onboarding traffic from warm launches, track reconnects and old-history navigation, and include the server quota/billing reads. Use the code-path estimates here to explain the measured totals rather than treating every HTTP request as one database operation.
