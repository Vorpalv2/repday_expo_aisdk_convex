# Cache-first splits and history, with optional Plus live sync

**Status:** Implemented  
**Date:** 17 October 2026  
**Scope:** `users/{uid}/splits` and the latest workout-history records

## Why we investigated this

Repday's Firestore Usage dashboard showed unexpectedly high read activity while the app was mostly idle. The concern was not the size of an individual document. Firestore bills reads per document returned, so a query for six split documents and seven history documents is roughly thirteen reads for one client.

The app originally kept realtime listeners for all three account data sources:

- one settings document;
- all saved workout splits; and
- the latest seven history documents.

A listener does not repeatedly read unchanged documents while its connection stays healthy. The expensive case occurs when a browser or iPhone web app is suspended, loses its Firestore connection, and reconnects after a substantial gap. With persistent Firestore cache enabled, a listener disconnected for more than about 30 minutes can be treated as a new query on reconnect.

For a typical account with six splits and seven recent history records, one reconnect could therefore fetch roughly:

| Data | Approximate reads |
| --- | ---: |
| Settings | 1 |
| Splits | 6 |
| Recent history | 7 |
| **Total** | **14** |

Most users use one device at a time. They do not need their saved splits or workout history to change instantly while the app sits open. Repeating those collection reads after a mobile browser reconnect was unnecessary for the normal workflow.

## What we changed

### Cache-first splits and history

Splits and recent history no longer have always-on Firestore listeners for normal accounts.

When a signed-in app session starts, Repday now does this:

1. Reads the previous Firestore query result from the persistent local Firestore cache, if available.
2. Renders the existing AsyncStorage-backed split/history state immediately.
3. Makes one explicit server request for all splits and the latest seven history records.
4. Stores the result locally for the current device.
5. Does not keep a live subscription after the initial sync.

The cache read is local and does not contact Firestore. The bounded server sync costs the number of documents returned, but only on a genuine app start or reload rather than after every listener reconnection.

The app still makes deliberate one-time history queries when the user asks for more data:

- loading older workouts uses a cursor and a chosen page size;
- selecting a calendar date queries only that date's time range.

### Local-first edits and completed workouts

When the current user edits a split or finishes a workout:

1. Repday updates React state immediately.
2. The updated split/history list is persisted in AsyncStorage on that device.
3. Repday writes the changed Firestore document.
4. It does not read the same document back merely to redraw the current device.

This means a user can leave the app open for days and still see a just-completed workout from local state. The cloud write remains the backup for a future app launch or another device.

## Repday Plus: optional live cross-device sync

Live synchronization is now a Repday Plus preference named **Live cross-device sync**.

| Account state | Behavior |
| --- | --- |
| Free | Cache-first mode only. The preference is shown with the Plus treatment and opens the subscription flow. |
| Plus, default | Live sync is on. Splits and the latest seven history records use realtime listeners. |
| Plus, toggle off | Returns to cache-first behavior. The split and history listeners unsubscribe immediately. |
| Plus expires | The app stops those optional listeners and returns to cache-first behavior. |

The choice is stored as `liveSyncEnabled` in `users/{uid}/settings/main` and uses the existing preference Save/Cancel flow. Multiple preference edits, including this one, become one settings-document write when the user presses Save.

Live sync keeps the local cache too. The cache is still useful for immediate rendering, temporary offline use, and a fast return to the app. The difference is that enabled live listeners also deliver remote changes made by another device.

## Cost and product trade-offs

### Cache-first mode

Benefits:

- avoids automatic split/history listener reconnection queries after browser suspension;
- avoids live update reads while nothing changes;
- uses local data immediately;
- better fit for a user working from one device.

Trade-off:

- a second already-open device can display older split/history data until it reloads, starts a new session, or performs a deliberate refresh/query.

### Live-sync mode

Benefits:

- changes made on one device appear on another open device without reload;
- useful for people actively switching between phone, tablet, and desktop.

Trade-off:

- the initial listener query reads the matching split/history documents;
- later changed documents are delivered as listener reads;
- a sufficiently long disconnect can cause the listener query to be re-established, which may read the matching documents again.

This makes live sync a good Plus benefit because it has a visible cross-device value and a real infrastructure cost.

## What remains realtime for every account

The small settings document remains a listener for all signed-in users:

`users/{uid}/settings/main`

It contains preferences such as theme, weekly plan, country/time zone, and the live-sync preference itself. A settings save normally costs one document write and one settings listener delivery per connected app instance. It does not fetch every split or history record.

## Relevant code

| File | Responsibility |
| --- | --- |
| `backend/firebase/useWorkoutData.ts` | Cache-first split/history startup sync; optional Plus listeners; settings listener |
| `backend/contracts.ts` | `liveSyncEnabled` settings contract |
| `app/index.tsx` | Plus preference UI, Save/Cancel draft, local split/history persistence |
| `backend/firebase/client.ts` | Persistent Firestore browser cache initialization |
| `docs/firestore-optimizations-and-caching.md` | Broader Firestore optimization and caching reference |

## How to verify manually

1. Sign in as a free user and confirm the live-sync control shows the Plus treatment.
2. Sign in as a Plus user and confirm the control begins enabled unless it was previously saved off.
3. Turn it off, press Save, and confirm the app continues to show cached splits/history.
4. Turn it on, press Save, edit a split on a second device, and confirm the first device updates without reload.
5. Turn it off again, edit the second device, and confirm the first device stays unchanged until reload or a deliberate refresh/query.
6. In Firestore Usage and Subscription Metrics, compare the listener count and read activity with live sync on versus off.

## Cost comparison: cache-first versus live sync

This section models the operations performed by the current implementation. It is an engineering estimate for capacity planning, not an invoice guarantee: Firestore can apply cache, offline-persistence, query, and listener-pricing rules that depend on connection state and the documents that match a query.

### Assumptions used below

The examples use a representative account with:

- one `settings/main` document;
- six saved split documents;
- seven history documents returned by the default recent-history query;
- one signed-in device unless noted otherwise; and
- no unrelated billing refresh, account migration, browser tabs, or developer sessions in the same Firebase metrics minute.

Under those assumptions, the split query returns six documents and the initial history query returns seven. Firestore bills document reads, not fields. Reading a full split document or one field from it is still one document read.

### Data access paths in the implementation

| Data | Cache-first account | Plus account with live sync on |
| --- | --- | --- |
| Settings | `onSnapshot(settings/main)` | Same settings listener |
| Splits at signed-in startup | `getDocsFromCache`, then `getDocsFromServer` | Same startup cache/server hydration, then a live split listener |
| Recent history at signed-in startup | `getDocsFromCache`, then `getDocsFromServer`, limited to 7 | Same startup cache/server hydration, then a live history listener limited to 7 |
| Split/history change while app remains open | Local React/AsyncStorage update plus cloud write; no split/history listener delivery | Local React/AsyncStorage update plus cloud write; listeners deliver matching cloud changes |
| Return after a long disconnect | No split/history listener is present to re-establish | Both live collection listeners can be re-established |

`getDocsFromCache` reads browser/device storage and does not make a Firestore network request. The document-read figures below refer to server queries and listener deliveries.

### Startup and reconnect costs

| Situation | Cache-first mode | Live sync on |
| --- | ---: | ---: |
| Fresh signed-in launch/reload | ~1 settings + 6 splits + 7 history = **~14 reads** | Cache-first startup plus the two live listener initial result sets. Budget **up to ~27 reads**: 1 settings + 6 + 7 startup sync + 6 + 7 listener results |
| App stays connected and no watched document changes | **0** split/history reads | **0** split/history reads |
| Browser/iPhone reconnects after a long offline gap | Usually only the settings listener can re-establish: **~1 read** | Settings plus split/history live query results may re-establish: **~14 reads** |
| Return from a short suspension with no data changes | Usually **0** split/history reads | Usually **0** reads if Firestore resumes its listener state from persistence; do not treat this as a guaranteed billing rule |

The current Plus implementation intentionally favors the product behavior of immediate cross-device updates. It performs normal cache-first hydration and then attaches live listeners. That means Plus live sync has a higher startup budget than cache-first mode.

### User actions and cloud operations

| User action | Cache-first mode | Live sync on |
| --- | ---: | ---: |
| Save a theme or other settings draft | 1 settings write + usually 1 settings listener delivery = **~1 write, ~1 read** | Same |
| Enable live sync and save | 1 settings write + settings delivery; then listener initial result sets up to **6 split + 7 history reads** | This is the action that starts the optional live listeners |
| Disable live sync and save | 1 settings write + settings delivery; split/history listeners unsubscribe | Same settings cost, then no future live deliveries |
| Edit one saved split | Usually **1 split write, 0 readback** | 1 split write + **~1 split listener read per active live-synced device** |
| Add/finish a workout | Usually **1 history write, 0 readback** | 1 history write + **~1 history listener read per active live-synced device**, when the record is in the latest-seven query |
| Delete one saved workout | 1 history delete/write operation, 0 readback | 1 delete/write operation + listener result update for active live devices if it matched the query |
| Load seven older workouts | **Up to 7 reads** through an explicit cursor query | Same explicit query cost |
| Select a calendar date | Reads only records returned for that day | Same explicit query cost |

A completed workout updates the current device's React state and AsyncStorage before the cloud write is sent. Therefore neither mode needs to query that same history document just to show the workout that the user finished.

### Multiple-device multiplier

Writes are made once to Firestore. Listener reads are charged per connected client that receives the matching changed document.

For example, if a split is edited while two phones and one laptop all have Plus live sync enabled:

- **1 split-document write** is made;
- each of the three matching split listeners can receive that split update;
- plan for approximately **3 split listener reads** across those devices.

With cache-first mode, those already-open devices remain on their local copies. They generate no listener reads for that change, but they do not display it until a launch sync or deliberate query.

### Costs that this feature does not change

This feature does not change the cost of:

- authentication;
- the settings listener itself;
- Razorpay billing-status requests and any server-side billing-account updates;
- exercise-catalog network fetches;
- active workout state, which remains local while unfinished; or
- manual history pagination/date queries.

Those operations can appear in the same one-minute Usage chart bucket as a theme save or a live-sync toggle. Use Query Insights and the collection breakdown before attributing every read in a bucket to this feature.

### Choosing the right default

| User need | Recommended mode | Reason |
| --- | --- | --- |
| One phone during a workout | Cache-first | Lowest background/reconnect read exposure; local changes are immediate. |
| Uses phone and laptop concurrently | Live sync | The extra listener cost buys immediate split/history updates between open devices. |
| Wants a low-data or low-cost mode while travelling | Cache-first | Only deliberate launch and history queries contact the server. |
| Team/test account with several open devices | Cache-first unless actively comparing devices | Listener deliveries multiply by active devices and browser tabs. |

## Monitoring this feature after deployment

When checking Firebase after a release, compare the same account and similar activity with the preference off and on.

1. In **Firestore Usage**, inspect the one-minute intervals around enabling the preference, a split edit, and a completed workout.
2. In **Subscription Metrics**, cache-first mode should show only the settings listener for one app instance. Live mode adds one split and one history listener per active app instance.
3. In **Query Insights**, the optional live queries appear as the split collection ordered by `position` and the history collection ordered by `startedAt desc` with a limit of 7.
4. Test with one device first. Multiple old browser tabs, localhost instances, or another device can multiply listener deliveries and obscure the result.
