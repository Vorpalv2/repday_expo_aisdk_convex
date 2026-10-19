# AI Coach

## Access and streaming

Generating new coaching replies requires Plus or Complimentary access. The server verifies Firebase authentication and premium entitlement, validates the selected model, and rate-limits requests. Free users see the Plus upgrade path.

The Coach API uses the installed Vercel AI SDK's `streamText`, `toTextStream` and `createTextStreamResponse`. The Expo fetch client consumes UTF-8 chunks as they arrive and updates the visible reply progressively. Reasoning time, provider latency, and network/runtime buffering can still delay the first visible text. Formatting supports headings, bold key points, numbered/bulleted lists, and indentation without executing HTML.

## Conversation history

Before this implementation, Coach messages existed only in React state. Those old replies cannot be recovered from a database because they were never written there.

New completed discussions are saved privately under:

`users/{uid}/coachConversations/{conversationId}`

Each conversation is one bounded document containing a compact JSON transcript, title, preview, timestamps, revision and the exact workout-context snapshot. The client caches recent conversations in account-scoped AsyncStorage. The History drawer displays saved discussions, allows selecting and continuing a chat, and offers New chat, Refresh and Load older discussions.

Cloud history is queried only when the drawer opens, Refresh is selected or another page is requested. Pages contain at most eight conversation documents. There is no conversation listener or background polling job, regardless of the workout live-sync switch. Selecting a conversation already loaded into the drawer needs no extra document fetch.

After a completed reply, one transaction reads the conversation revision and writes the new revision. The read detects competing changes so another device's newer conversation is not silently overwritten. Streaming tokens never cause individual database writes. History failures do not discard the reply: the app keeps it on the device and shows Retry saving. Interrupted/empty replies are not saved as complete cloud responses. An interrupted question can be retried without adding a second copy of the question.

A conversation holds up to 20 user/assistant exchanges. Older conversations remain available as separate documents. The most recent 12 individual messages are sent as conversational model context on a follow-up; saved transcript length and model context length are intentionally different bounds. New chat starts a separate conversation. Sign-out/account switching isolates local data, and account deletion includes the Coach conversation collection.

## Your training in context

The context card is generated from the same text sent with the question. It shows:

- The training goal, display-unit preference, local date and time zone.
- Today's effective split and planned exercises/targets, or the rest/no-plan state.
- Up to five recent completed workouts already available on the device.
- For a session review, that selected completed workout's date, duration, completed sets, volume and recorded exercise sets instead.

The panel explicitly labels recent loaded records as a subset rather than claiming access to the full lifetime history. Expand View exact context to inspect the full bounded snapshot (up to 4,000 characters). Saved conversations retain their original context; New chat uses current training data. Workout loads/volume are identified as kilograms even if the display preference is pounds.

## Costs and limitations

| Operation | Document operations |
| --- | --- |
| Stream a reply's chunks | No Firestore operation per chunk. AI Gateway usage and entitlement/rate-limit checks are separate. |
| Save one completed conversation revision | Normally one conversation read + one conversation write; transaction conflict retries can add reads. |
| Open/refresh history | Up to eight returned conversation document reads per requested page, subject to normal Firestore query billing. |
| View an already-loaded conversation | Local state only. |
| Read cached history while offline | Local storage only; cloud refresh/save cannot complete until connectivity returns. |

AI Gateway model usage is separate from Firestore document-operation billing. Premium entitlement checking can read its own billing cache/database. Model replies remain general training guidance, and the displayed context cannot include workouts that were not loaded/supplied. The feature is not medical assessment or a claim that the model remembers everything outside the bounded transcript/context supplied to it.
