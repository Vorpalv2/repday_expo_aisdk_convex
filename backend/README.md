# Backend adapters

The app-facing screens should call shared backend functions and hooks. Provider-specific SDK code belongs in its adapter folder:

- `convex/` contains the current Convex provider, auth bridge, and workout data hooks.
- `firebase/` is the reserved location for a future Firebase implementation.

This branch currently runs on Convex. There is no runtime backend selector. The shared contracts in `contracts.ts` keep provider details out of screens so a future backend can implement the same app-facing operations. The Firebase folder is preparation only; no Firebase SDK calls are active. A future backend would have its own auth accounts, data, and storage.

Convex server functions remain in the root `convex/` folder, as required by the current Convex project setup.
