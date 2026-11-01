# Task 054: Update check and clear app cache

Review: skip
Goal: Add a "Check for updates" button and a "Clear app cache" button to the Settings PWA section, so the owner can tell whether a phone runs the latest build and can reset the offline app copy without touching any saved data.
Files to touch:
- `src/utils/pwaMaintenance.ts` (new)
- `src/components/settings/PwaSection.tsx`
- `test/pwaMaintenance.test.ts` (new)
- `test/PwaSection.test.tsx` (new; if a test file for `PwaSection` already exists, extend it instead and say so in the PR description)

Do not touch: `src/hooks/usePWAUpdate.ts` (the hourly check and the Reload message stay as they are; its "CardCrucible" text belongs to the rebrand card), `src/components/SettingsView.tsx`, `vite.config.ts`, `public/`, `vercel.json`, `package.json` and the lock file, `scripts/smoke.py`, `src/store`, `src/db`, `src/io`, `src/schemas`, every crypto or passkey file. No new dependency. This list differs from the one in `docs/ROADMAP.md` on purpose (see Design).

Changes:

What Claude read at `main` `74177d3` (re-check each; a mismatch is a conflict with the repo, so stop):
- `src/hooks/usePWAUpdate.ts`: one `useRegisterSW` call (from `virtual:pwa-register/react`), made once from `App`. Its `onRegisteredSW` uses the registration only to start an hourly `r.update()`, guarded by `if (r)`; it keeps no handle. The "Update Available" message (its Reload action calls `updateServiceWorker(true)`) is shown once per page load (`toastShownRef`).
- `vite.config.ts`: `registerType: 'prompt'`, `injectRegister: 'script'`; Workbox precache under its default name plus two runtime caches, `google-fonts-cache` and `gstatic-fonts-cache`.
- `src/components/settings/PwaSection.tsx`: props `isInstallable`, `isInstalled`, `promptInstall`; its only button is the install button; no service-worker code.
- Per Muse's `facts:` report (greps of `src/` at `74177d3`, owner-relayed): no `caches.` or other Cache Storage call and no `navigator.serviceWorker` use anywhere in `src/`. So the origin's Cache Storage is written only by the generated service worker.

Design (Claude's call): reach the registration with `navigator.serviceWorker.getRegistration()` instead of changing the hook. The hook and `SettingsView.tsx` stay untouched and no store is involved, which keeps this card `skip`. If the executor finds the work needs `usePWAUpdate.ts`, `SettingsView.tsx` or anything in `src/store`, `src/db` or `src/io`, it stops and sends one message; the card then becomes `required` or is rewritten.

1. New `src/utils/pwaMaintenance.ts` with two exported async functions. Read `navigator` and `caches` when a function is called, not when the module loads, so tests can stub them. Add a one-line comment saying that at `74177d3` only the generated service worker writes Cache Storage.
   - `checkForAppUpdate(): Promise<UpdateCheckResult>`, with `UpdateCheckResult = 'unsupported' | 'no-worker' | 'found' | 'current' | 'failed'`. It never throws.
     - `'unsupported'`: `navigator.serviceWorker` is missing.
     - `'no-worker'`: `navigator.serviceWorker.getRegistration()` resolves to nothing.
     - `'failed'`: `getRegistration()` or `registration.update()` rejects, or `update()` has not settled after 15 seconds (race it against a timer and clear the timer).
     - Otherwise, after `update()` resolves: `'found'` when `registration.installing` or `registration.waiting` is set, else `'current'`.
     - Claude's assumption, not verified in a browser: `update()` resolves once a changed worker has started installing, so `installing` or `waiting` is set by then. The owner's phone check decides. If the executor has evidence that this is wrong, it stops and says so.
   - `clearAppCache(): Promise<{ workersRemoved: number; cachesDeleted: number }>`.
     - First unregister every registration (`getRegistrations()`, then `unregister()` on each; count the ones that return true). Then delete every Cache Storage entry of the origin (`caches.keys()`, then `caches.delete(name)` for each; count the ones that return true). Skip a part whose API is missing, so a browser with only one of them still works.
     - It does not reload. It does not touch IndexedDB, `localStorage`, `sessionStorage` or cookies, and imports nothing from `src/db` or `src/store`.
     - An error from either step propagates to the caller.

2. `src/components/settings/PwaSection.tsx`. Add one row between the install-button block and the two info tiles: two buttons (`type="button"`, at least 44px tall, `text-xs`, secondary style such as the info tiles' border and `bg-void-950/60`; the maroon gradient stays with "Install Roleplay Forge"; icons optional, for example `RefreshCw` and `Eraser` from `lucide-react`) and, below them, one status line (`<p role="status" aria-live="polite">`, `text-xs text-knight-400`, empty until something happens). The existing props, text and install button stay as they are. Add one optional prop, `reloadPage?: () => void`, defaulting to `() => window.location.reload()`, only so a test can observe the reload; `SettingsView.tsx` passes nothing new.
   - **Check for updates.** While it runs the button is disabled and reads "Checking...". Result text, exactly:
     - `current`: "You are on the latest version."
     - `found`: "A new version was found. Tap Reload in the Update Available message to install it."
     - `failed`: "Could not check for updates. Check your connection and try again."
     - `no-worker`: "No offline app copy is installed in this browser yet. Reload the page once, then try again."
     - `unsupported`: "This browser does not support offline app copies, so there is nothing to update."
   - **Clear app cache**, two steps, inline (no `window.confirm`, no new modal):
     - First tap, when `navigator.onLine === false`: show "You are offline. Clearing the cache now would stop the app from starting. Connect to the internet first." and stop.
     - First tap otherwise: show an inline block with the text "This removes the offline copy of the app stored in this browser, then reloads the page. Your cards, lorebooks, connection profiles and settings are not changed. You need an internet connection to start the app again; it downloads a fresh copy." and two buttons, "Clear and reload" and "Cancel". "Cancel" closes the block.
     - "Clear and reload" disables both buttons, calls `clearAppCache()`, then `reloadPage()`. If `clearAppCache()` rejects, close the block, show "Could not clear the app cache: <error message>." and do not reload.
   - The "Update Available" message in the hook appears once per page load and stays outside this card (`docs/BUGS.md` holds the note). Do not try to re-trigger it.

3. Tests (stub browser globals only; jsdom has neither `navigator.serviceWorker` nor `caches`, so define them with `Object.defineProperty` and remove them in `afterEach`; render the way `test/EditorView.test.tsx` does):
   - `test/pwaMaintenance.test.ts`:
     - `checkForAppUpdate`: `unsupported` (no `serviceWorker`), `no-worker`, `current`, `found` through `installing`, `found` through `waiting`, `failed` when `update()` rejects, `failed` when `getRegistration()` rejects, `failed` when `update()` never settles (fake timers, 15 seconds).
     - `clearAppCache`: with two registrations and three cache names, all are unregistered and deleted and the counts are returned; unregister happens before the cache deletion; with no `caches`, only workers are removed; with no `serviceWorker`, only caches are deleted; a rejecting `caches.delete` rejects the call.
     - Data safety: seed one valid card in the real fake-indexeddb database (reuse how `test/LorebookView.test.tsx` seeds one) and one `localStorage` key, run `clearAppCache()`, and assert both are still there.
   - `test/PwaSection.test.tsx` (mocking the `pwaMaintenance` module is allowed here, because it has its own test file): the install button still shows only when `isInstallable`; each of the five check results shows its exact text; the first tap on "Clear app cache" shows the confirm text and calls neither `clearAppCache` nor `reloadPage`; "Cancel" closes the block; "Clear and reload" calls `clearAppCache` once and then `reloadPage` once, in that order; with `navigator.onLine` false the offline text shows, with no confirm block and no calls; a rejecting `clearAppCache` shows the error text and `reloadPage` is not called.
   - Mutation check for the data-safety test only: temporarily add `localStorage.clear()` to `clearAppCache`, see that test fail, remove it, and write one line on this in the PR description.

Done when: `npm run lint && npm test && npm run build` pass (lint 0 errors; warnings no higher than the baseline of 45; the test count rises by the new tests, from 383), CI `test-and-lint` is green, and the owner can see on the deployed app: Settings, PWA section, has "Check for updates" and "Clear app cache" under the install area; Check for updates ends with a status line ("You are on the latest version." on a current build); Clear app cache shows the confirm text, and "Clear and reload" reloads the app with every card still in the Library. What the owner's phone check will tell Claude, and the card cannot prove: whether a real browser sets `installing` or `waiting` by the time `update()` resolves, whether the service worker registers again after the reload, and whether the Reload message is enough after a "found" result. Each problem becomes a new card or a `docs/BUGS.md` entry.

Decisions: 17 (owner phone checks do not gate the merge), 20 (no host or origin change; the reset works per origin and leaves origin data alone), 35 (the rebrand card owns the "CardCrucible" text in the hook's message; this card does not touch the hook).
