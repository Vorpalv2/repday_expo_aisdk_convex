# Live cross-device sync

## What the feature controls

**Live cross-device sync** controls Firestore realtime subscriptions for saved workout splits and the latest seven completed workout-history records. It does not control every connection or database operation in Repday.

| Account | Available behavior |
| --- | --- |
| Free | Cache-first splits and history; the live-sync control opens Plus membership. |
| Plus | Live sync defaults on unless the preference was previously saved off. The user can switch it off. |
| Complimentary | The same choice and access as Plus, granted manually without monthly renewal. |
| Plus expires | Optional split/history listeners stop and the app returns to cache-first mode. |

Change the switch in Profile preferences, then press **Save**. The switch is part of the preferences draft; Cancel discards it. Saving several changed preferences together updates the one settings document rather than writing each switch interaction separately.

## Off: use this device's saved data

On a signed-in app start or reload, Repday reads locally cached split/history data and performs a bounded server synchronization. During that app session, there are no split/history listeners waiting for remote edits. Other already-open devices can therefore retain an older view until they reload or perform a deliberate refresh/query.

Edits made on the current device and completed workouts update its local state/cache and are written to Firestore. The app can show them immediately without reading them back solely to redraw the screen. Cache-first mode still has cloud saves; it is not a local-only account or a cloud-backup paywall.

Advantages:

- Fast rendering from saved device data.
- Fewer reads caused by listener reconnects after iPhone/browser suspension.
- A good fit for using one device at a time.
- No recurring background polling task for splits/history.

Disadvantages:

- Remote changes do not instantly appear on a second already-open device.
- Manual refresh or reload is needed when a fresh cloud view is wanted.
- Offline writes can remain pending, and server queries require connectivity.

## On: keep open devices updated

The cache/startup synchronization remains. The app also attaches a split listener and a recent-history listener. Cloud changes to matching documents can update other connected devices without a reload. Only the latest seven history records are listened to; this is not a subscription to every past workout.

Advantages:

- Open phone, tablet and desktop views receive remote split edits and recent completed sessions.
- Less need to refresh while switching between devices.
- Local cache still helps startup and temporary offline use.

Disadvantages:

- Initial query results and subsequent changed-document deliveries can incur reads.
- Re-establishing listeners after a long disconnect can re-read matching documents.
- Live updates depend on browser execution, connectivity and current entitlement. iOS can suspend a locked/background webapp; “live” is not a guarantee of background execution.
- The recent-history limit means older records may still need an explicit query.

## What remains connected with either setting

The small settings document remains subscribed for every signed-in account. It includes theme, weekly scheduling preferences, and the live-sync choice itself. Billing access, explicit queries, AI Coach requests, and other separately implemented features are not disabled by this switch.

The setting does not enable cloud synchronization of an unfinished workout. Active workout/set editing uses local state and AsyncStorage; completed history is saved when the workout finishes.

## Cache lifetime and the 30-minute misconception

AsyncStorage is on-device key/value storage. Firestore web persistence additionally uses browser-managed storage. Neither should be presented as a permanent backup: users or browsers can clear/evict storage, and private browsing or storage limits can change availability. Account-scoped caches avoid showing one signed-in user's saved data to another.

The 30-minute Firestore listener rule is about reconnection billing, not a timer that expires every cached document. A connected idle listener does not re-read all documents every 30 minutes simply because time passed. Cache-first mode removes the optional collection listeners, so there is no corresponding split/history listener to reconnect after suspension. The settings listener can still reconnect.

## Database-operation examples

These are planning estimates, not invoice guarantees. Firestore billing depends on cache/connection state, returned documents, empty queries, index-entry charges where applicable and security-rule dependent reads. A collection query returning six split documents is six document reads, not one read because it was one request. Fields do not determine the document write count.

Assume one app instance, six saved split documents and seven returned history documents:

| Action | Sync off | Sync on |
| --- | --- | --- |
| Genuine startup/reload | Cache hydration plus bounded server reads; roughly 1 settings + 6 splits + 7 history = 14 | Same startup path plus listener initialization; conservatively budget up to another 6 + 7 result documents. SDK reuse may reduce actual extra billing. |
| Remain connected and idle | No optional split/history reads | No periodic reads merely for remaining connected; changes can cause deliveries. |
| Long disconnect then resume | Optional collections have no listeners to re-establish; settings may reconnect | Settings and optional query result sets may be read again, depending on persistence/reconnection rules. |
| Save one settings draft | One settings-document write; settings listeners can receive a document update | Same; enabling sync can additionally initialize collection listeners. |
| Edit one saved split | Changed split cloud write; current-device local state/cache update | Same write, plus matching listener updates where billable. |
| Complete one workout | History write and local update; other completion-related writes remain separate | Same writes, plus recent-history listener updates where billable. |
| Open older history or choose a calendar date | Explicit bounded query | Explicit bounded query; live recent-history does not replace it. |

A batch of writes to several different documents still counts the affected document writes. Several UI components reading one shared local state do not each create a Firestore read. Actual SDK subscriptions/queries, not React component count, determine network activity; SDK listener deduplication can also matter.

**Current history detail:** the Progress UI defaults to Current week (Monday–Sunday), but the initial backend history query is still `orderBy(startedAt, desc), limit(7)`. Seven records does not mean exactly seven days, and the current UI filter is not a guarantee that the database fetched only this week's documents.

## Why it is a Plus benefit

Free users keep saved splits, completed-history cloud storage and cache-first access. Plus adds immediate remote updates for the subscribed data and gives the user the option to turn those updates off. Complimentary users receive the same choice. Paying does not remove network limits, prevent iOS suspension, make device storage permanent or eliminate Firestore costs.

## Code references

- `backend/firebase/useWorkoutData.ts`: startup hydration, bounded queries and optional listeners.
- `backend/firebase/client.ts`: Firestore web persistent-cache initialization.
- `app/index.tsx`: draft preferences, Plus gate and settings Save/Cancel.
- `docs/cache-first-splits-history-live-sync.md`: detailed implementation and cost model.
