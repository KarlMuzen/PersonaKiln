# Task 044: Autosave flush on every card switch (D-13)

Review: required
Goal: Switching the active card never drops, corrupts or silently hides a pending or running autosave of the previous card.
Files to touch: `src/store/slices/cardSlice.ts`, `src/routing/useHashRouting.ts`, new `test/autosaveFlush.test.ts`.
Do not touch: everything else. In particular `src/db`, `src/io`, `src/schemas`, `src/store/slices/types.ts`, all components, `test/hashRouting.test.tsx` (it must pass unchanged), `docs/` (except deleting this card in the last commit).
Decisions: none. Background: D-13 in `docs/BUGS.md`. Claims below were read in the code at `main` `e05ff92` by Claude on 2026-11-01 and not reproduced in a browser.

## What the code does today

- `triggerAutosave` (`cardSlice.ts`) sets `saveTimeoutId` and an 800 ms timer. When the timer fires it never clears `saveTimeoutId`, so the id stays set forever after the first autosave. Nothing else clears it except `deleteCard`, `bulkDeleteCards` and the router's flush.
- `selectCardForEditing` neither flushes nor clears the timer. `GalleryView.handleCardClick`, `GuideView` (sample import), `createNewCard` and `createVariant` call it with no flush. Only the hash router flushes (`flushPendingAutosave` in `useHashRouting.ts`).
- Because of the stale id, the router's flush cannot tell "pending" from "already saved": after any autosave it re-saves the previous card on every route-driven switch and bumps its `modification_date`.
- `saveActiveCardMetadata` reads `activeCardUuid` and `activeCard` at its start, awaits the database, then calls `set({ activeCard: updatedCard })`. A card switch inside that window replaces the new card's state with the old card's data under the new uuid, and the next autosave writes it into the new card's record.
- The router's flush sets `saveState: 'idle'` after the save even when `saveActiveCardMetadata` just set `'error'` (it catches its own errors and does not throw), which hides a failed save.

## Changes

1. `cardSlice.ts`, module scope: add `let autosaveInFlight: Promise<void> | null = null;`.
2. `triggerAutosave`: when the timer fires, first `set({ saveTimeoutId: null })`. Run the existing body (save, then `saved` and the 2 s reset to `idle`, or the `error` state and toast) as one promise, store it in `autosaveInFlight`, await it, and set `autosaveInFlight` back to `null` in a `finally` only if it still holds that promise. Behaviour and toast text stay as they are.
3. Inside `createCardSlice`, add a local `flushAutosave` function:
   - If `autosaveInFlight` is set, await it first.
   - Then, if `get().saveTimeoutId` is set, `clearTimeout` it, `set({ saveTimeoutId: null })`, await `get().saveActiveCardMetadata()` (wrapped in try/catch: on a throw log it and `set({ saveState: 'error' })`), and afterwards `set({ saveState: 'idle' })` only if `get().saveState !== 'error'`.
   - It never throws and never blocks the caller on a failed save (the "Failed to save card" toast has already fired; the card switch still happens).
4. `selectCardForEditing`: make `await flushAutosave();` its first statement, before the database read, so the flush runs while the previous card is still active. It runs even when `uuid` equals the active card.
5. `useHashRouting.ts`: delete `flushPendingAutosave` and its call in `apply`. Remove any import that becomes unused (`db` and `useToastStore` are still used elsewhere in the file; check before removing).
6. `test/autosaveFlush.test.ts` (jsdom, same setup style as `test/hashRouting.test.tsx`; reset `saveTimeoutId` and clear any timer in `beforeEach`). Write the tests first and report which ones fail on unmodified code:
   - **Edit then switch**: create cards A and B, select A, change A's name with `updateActiveCardData`, call `selectCardForEditing(B)` straight away (inside the 800 ms window), then read A's record from `db.cards`: it has the new name. `saveTimeoutId` is `null`. This fails on unmodified code.
   - **No pending save, no re-save**: render `useHashRouting`, edit A, wait until the autosave has fired (about 1 s), spy on `saveActiveCardMetadata` (replace it with `vi.fn` through `setState`), switch to B with a `popstate` hash change as in the existing D-13 test; the spy is not called. This fails on unmodified code (stale id).
   - **Switch during a running save**: replace `saveActiveCardMetadata` with a function that waits about 200 ms and then resolves; call `triggerAutosave`, wait until the timer has fired (about 850 ms, the save is then running), call `selectCardForEditing(B)`; assert the replaced save finished before `selectCardForEditing` resolved and that `activeCardUuid` and `activeCard` then belong to B. This fails on unmodified code.
   - **Failed save keeps the error and the switch happens**: replace `saveActiveCardMetadata` with a function that sets `saveState: 'error'` and resolves; set a pending `saveTimeoutId`; `selectCardForEditing(B)`; `saveState` is still `'error'` and `activeCardUuid` is B.
7. Run the whole suite. If an existing test other than the new file fails because of the new flush, stop and report its name and the failure; do not edit it.

## Done when

- `npm ci && npm run lint && npm test && npm run build` pass; the PR description lists the real counts and which new tests failed before the change. `test-and-lint` is green.
- The existing test `route-driven card switch flushes autosave (D-13)` in `test/hashRouting.test.tsx` passes unchanged.
- Owner phone check (not a gate, Decision 17): open a card, change its name in Details, within one second tap back to Library and open a different card, then reopen the first: the new name is there, and the second card's modified time did not change.
- The PR's last commit deletes this card file.

## Stop and report

The card names something the code does not have; the fix needs a change to `types.ts` or a file not listed here; a listed file grows past the card by 2 or more files; CI is red after 2 fix attempts.
