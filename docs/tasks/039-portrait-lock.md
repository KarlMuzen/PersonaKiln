# Task 039: Lock the installed app to portrait

Review: required
Goal: The installed phone app opens and stays in portrait because the web manifest says so, not only because a script asks for it.
Files to touch: `vite.config.ts` (one value).
Do not touch: `src/components/PortraitGuard.tsx` and `src/utils/orientationLock.ts` (the script lock and the landscape overlay stay as the fallback for browser tabs, which a page cannot lock), any other manifest field, icons, `public/*`, `vercel.json`, tests, docs, `package.json`, the lock file. No new dependency.
Evidence (Claude, 2026-10-31, `main` `a897113`): the `VitePWA` manifest in `vite.config.ts` has `orientation: 'any'`. The code already asks for a lock with a script (`initPortraitLock` in `src/utils/orientationLock.ts`, and `PortraitGuard`, an overlay with a "Use Landscape Anyway" button that shows only on a touch screen in landscape when the width is under 900 px or the height under 600 px); a script's request can be refused, and whether it is refused on the owner's phone was not tested. The manifest value is the setting the installed app obeys; not tested here. No test mentions orientation or `PortraitGuard` (code search). Known effect: the manifest cannot tell phones from tablets, so an installed app on a tablet is locked too. The manifest is read when the app is installed; Android keeps the old value for an existing install until it is reinstalled.
Changes:
1. In `vite.config.ts`, in the `manifest` object, change `orientation: 'any'` to `orientation: 'portrait'`. Change nothing else.
2. Run `npm ci && npm run lint && npm test && npm run build`. After the build, open `dist/manifest.webmanifest` and confirm it contains `"orientation":"portrait"` and that no other field changed; write that result in the PR description under `Checks run`.
3. Stop after green CI and report. Claude reviews the diff; merge only after `Approved` on the current head.
Done when: CI green and `dist/manifest.webmanifest` shows `"orientation":"portrait"`. Owner, on the phone after the merge: uninstall the app, install it again from the browser, open it and rotate the phone; it stays upright. In a normal browser tab the landscape overlay still appears.
Decisions: 6 (phone layout).
