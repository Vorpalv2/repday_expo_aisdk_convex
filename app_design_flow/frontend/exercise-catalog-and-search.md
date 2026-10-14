# Exercise catalog and search

This document describes how Repday loads its exercise catalog, enriches exercise media, and displays results on the Search screen. It reflects the checked-in implementation.

## Catalog source and shape

The searchable catalog is fetched from the public `hasaneyldrm/exercises-dataset` GitHub repository:

```text
https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json
```

`fetchExerciseCatalog()` in `app/index.tsx` makes one HTTP request for the full JSON file. A non-success HTTP response throws an error. `parseDatasetExercises()` ignores records without a string `name` and maps the source fields into the app's `Exercise` shape:

- `id` and `name`
- `category` (falls back to `body_part`)
- `target`, `equipment`, and `media_id`
- optional `image`, `gif_url`, `instructions`, and `instruction_steps`

The Search header has a display constant of **1,324 movements** (`EXERCISE_CATALOG_COUNT`). That number is a UI fallback/label, not a pagination limit or a count returned by an API. When the catalog has loaded, the header uses the actual count of the current filtered result set; when a query or filters are active, it also shows the full loaded-catalog count as context.

## When loading happens

`exerciseLibrary` begins with the local `EXERCISES` list from `data/exercises.ts`. A mount effect starts loading the full remote catalog in the background. When loading succeeds, the app replaces the in-memory library, marks it loaded, and enriches any already-loaded workout sessions with catalog metadata. A shared `catalogRequest` promise prevents concurrent callers from starting duplicate fetches. If the request fails, the promise is cleared so a later attempt can retry.

Opening the exercise picker, media picker, or active-exercise picker also triggers `loadCatalog()` if the full catalog has not loaded yet. Workout import requests the same catalog through `getImportCatalog()`. These paths reuse the shared promise.

The catalog is kept in app memory. This implementation does not persist the downloaded JSON to AsyncStorage or Firestore. Exercise images and GIFs are separate assets: `datasetAsset()` resolves relative asset paths against the same GitHub dataset repository, while absolute HTTP URLs are used as given. `expo-image` loads those assets when an exercise view needs them, with disk caching requested by the component.

## Search and filters

The Search screen uses a React Native `FlatList` over `searchMatches`. The `searchMatches` memo filters the loaded in-memory catalog by a case-insensitive substring across the exercise name, category, target muscle, and equipment. Active category, target, and equipment selections are exact-match filters applied together (AND behavior).

Filter choices are derived from unique non-empty values in the loaded `exerciseLibrary`, sorted alphabetically, and shown in the exercise-filter modal. Search results display the exercise name and its category, target, and equipment. Selecting a result opens its detail view with available image/GIF, instructions, and instruction-language options.

## What “endless scroll” means here

The list can be scrolled through all matching catalog results and uses `FlatList` virtualization/batching (`initialNumToRender={12}`, `maxToRenderPerBatch={8}`, `windowSize={7}`, and `updateCellsBatchingPeriod={40}`). This controls how many row components are mounted/rendered around the visible area.

**It is not server-side pagination or network fetching on scroll.** There is no `onEndReached` handler and no page/cursor request in the Search screen. The full JSON catalog is fetched once, then the list progressively renders rows from the in-memory array as the user scrolls. Search text and filter changes run locally against that array.

This is simple and avoids needing a catalog backend, but initial catalog download size and parsing grow with the dataset. A true paginated implementation would require a source that supports paging (or a locally hosted/API-backed catalog with a cursor/search endpoint); slicing the existing JSON after downloading it would reduce mounted rows but would not reduce network transfer.

## Failure behavior and limitations

- If catalog loading fails, the catch paths keep the local `EXERCISES` fallback and do not show a dedicated catalog error/retry message on Search.
- The fallback list may be smaller than the Search header's displayed 1,324 figure until the remote catalog loads.
- Exercise metadata and asset availability depend on the upstream GitHub repository and its raw-content URLs.
- Search is client-side substring matching; there is no typo-tolerant search, ranking, server query, or result-page API.
- The remote dataset is not version-pinned in the URL (`main` is used), so upstream changes can change the results without an app release.

## Relevant implementation

- `app/index.tsx`: `EXERCISE_CATALOG_COUNT`, `datasetAsset`, `parseDatasetExercises`, `fetchExerciseCatalog`, `loadCatalog`, catalog loading effects, `searchMatches`, `filterOptions`, and the Search `FlatList`.
- `data/exercises.ts`: local exercise fallback/catalog entries.
- `app_design_flow/frontend/active-session.md`: workout context that uses the exercise library.
