# Firebase backend adapter

This folder is reserved for the Firebase implementation of the shared backend contract.

The app is not connected to Firebase yet. Before selecting Firebase in a build, this adapter needs Firebase Auth, Firestore subscriptions and mutations, and Cloud Storage photo uploads. Keep those Firebase SDK calls in this folder; screens should depend on the backend contract rather than Firebase APIs.

The Convex implementation remains in `backend/convex/`. Convex server functions stay in the repository's root `convex/` directory because that is the configured Convex project layout.
