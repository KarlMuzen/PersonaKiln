# Task 046: Stale open card

Review: required
Goal: When something rewrites the card that is open in the editor from outside the editor (an overwrite import, a merge restore), the store takes the new copy, so the next edit or autosave cannot write the old copy back over it. Unsaved typing is saved first and stays reachable with Undo.
Files to touch: `src/store/slices/cardSlice.ts`, `src/store/slices/types.ts`, `src/components/settings/BackupRestoreSection.tsx`, new `test/staleOpenCard.test.ts`.
Do not touch: `src/io/backup.ts`, `src/db`, `src/schemas`, `src/store/useCardStore.ts` (its tab-hide flush is a separate entry in `docs/BUGS.md`), `src/routing`, `src/components/GalleryView.tsx`, every other file, `docs/` (except deleting this card in the last commit).
Decisions: none. Background: `docs/BUGS.md`, entry "Overwriting the open card on import or restore leaves the old copy in memory".

Owner question, not yet answered: unsaved typing is saved first, then replaced by the import, with Undo as the way back. Claude assumes yes; the design below is built that way. If the owner says no, this card is rewritten before it runs.

## What the code does today (read at `main` `bd86f93`)

- `importCardRecord` (`cardSlice.ts`), overwrite branch: reads the record, calls `db.cards.update(existing.id, {...})` inside a try that rethrows `describeStorageError`, calls `loadCardsFromDb()` and returns. It never touches `activeCard`, `activeCardRecord`, `activeCardEmbeddedAssets`, `undoStack`, `redoStack` or `editor_history_<uuid>`, and it never flushes a pending autosave.
- `handleFullBackupRestore` (`BackupRestoreSection.tsx`) calls `restoreFullBackup(input, 'merge')`, then the `loadCardsFromDb` and `loadProfilesFromDb` props, then shows the result dialog. Nothing reloads the open card. Claude's code search found no other caller of `restoreFullBackup` in `src/` (only its definition in `src/io/backup.ts`).
- The open card stays in the store after the person leaves the editor. `useHashRouting` calls `selectCardForEditing` only when the route's card uuid differs from `activeCardUuid`, so reopening the same card shows the old in-memory copy.
- `saveActiveCardMetadata` writes the whole in-memory `activeCard` as `cardData` with a new `modification_date`. So the next edit, or an autosave timer that is already pending, overwrites the imported copy. Inferred, not run.
- `restoreSnapshot` already does the same job for snapshots (write, push the current card on the undo stack, clear redo, persist `editor_history_<uuid>`, set the store). Use it as the pattern. `UndoState` holds `cardData` only, not embedded assets.
- `flushAutosave` (a closure inside `createCardSlice`) saves a pending or running autosave and never throws (card 044).

## Changes

1. `types.ts`: add to `CardSlice`, next to `importCardRecord`: `runDbCardWrite: <T>(write: () => Promise<T>) => Promise<T>;`.
2. `cardSlice.ts`: new action `runDbCardWrite(write)`, in this order:
   - `await flushAutosave()`. If that save failed (`saveState` is `'error'`), carry on: the typing is still in memory and goes on the undo stack in step 5.
   - `uuid = get().activeCardUuid`. No open card: `return write()`.
   - Read the stored record for `uuid` and keep a fingerprint: the JSON of `cardData`, `modification_date`, and the sorted `[key, byteLength]` pairs of `embeddedAssets`. No record: `return write()`.
   - Run `write`. Whatever it returns or throws, run step 5, then return the result or rethrow the same error. Step 5 never throws: a failure inside it is logged with `console.error` and never replaces the write's own result or error.
   - Reconcile. Do nothing when `get().activeCardUuid !== uuid` (the person switched cards meanwhile), when the record is gone, or when the fingerprint is unchanged. Otherwise: set `lastUndoPushTime = 0`; let `old = get().activeCard`; if the JSON of `old` differs from the JSON of the new record's `cardData`, push a deep copy of `old` on the undo stack (`MAX_UNDO_STACK_SIZE`, same slice as elsewhere), otherwise leave the undo stack as it is; clear the redo stack; write `editor_history_<uuid>` to `db.settings` with that undo stack and an empty redo stack (a failure here is logged only); then `set({ activeCard: record.cardData, activeCardRecord: record, activeCardEmbeddedAssets: record.embeddedAssets || {}, isAssetsDirty: false, undoStack, redoStack: [], saveState: 'idle' })`. Do not call `saveActiveCard` or `saveActiveCardMetadata` here: nothing is written back.
3. `importCardRecord`, overwrite branch only: capture `existing.id` in a const and replace the bare `db.cards.update(...)` with `await get().runDbCardWrite(() => db.cards.update(id, {...same fields...}))`. The existing try/catch and the `describeStorageError` rethrow stay. The add path is unchanged (a new card is never the open one).
4. `BackupRestoreSection.tsx`, `handleFullBackupRestore`: first run `grep -rn restoreFullBackup src` and stop if any caller other than this handler turns up. Read the file into `input` first (text, or bytes for a `.zip`), then `const res = await useCardStore.getState().runDbCardWrite(() => restoreFullBackup(input, 'merge'))`. Everything after that line stays as it is. Do not change any visible text: "Database restored!", "Restore Successful", "Restore Failed", "Restore Database (JSON / ZIP)" and the other button labels (`scripts/smoke.py` finds them by text).
5. `test/staleOpenCard.test.ts` (same setup style as `test/autosaveFlush.test.ts`: jsdom, `../test/setup`, clear `db.cards` and `db.settings` and reset the store, including `undoStack`, `redoStack` and `saveTimeoutId`, in `beforeEach`). Write the tests first and report which fail on unmodified code. Tests that need `runDbCardWrite` fail because it does not exist yet; the import and restore tests must fail on their assertions.
   - Import then edit: open a card (`createNewCard`), `importCardRecord(importedCard, { 'embeded://icon/main.png': new Uint8Array([1, 2, 3]) }, uuid)`. The store's `activeCard` and `activeCardRecord` show the imported name, `activeCardEmbeddedAssets` has the key, `isAssetsDirty` is false. Edit the description with `updateActiveCardData`, wait for the autosave (about 1,100 ms, as in `autosaveFlush.test.ts`): the stored card keeps the imported name, has the imported description plus the edit, and still has the asset.
   - Typing inside the autosave window: rename the open card, then straight away overwrite-import it. After the autosave window, the database holds the imported card (the typing was saved first, then replaced, and was not written back). The last undo entry holds the typed name, the redo stack is empty, the `editor_history_<uuid>` setting matches the store's stacks, `saveTimeoutId` is null and `saveState` is `'idle'`. `undo()` brings the typed name back.
   - Another card: card A is open, overwrite-import card B. A's `activeCard` is the same object as before, the undo stack length is unchanged, B's stored name changed.
   - `runDbCardWrite` with a write that changes nothing returns the write's value, pushes no undo entry and keeps `activeCard`. With no open card it also just returns the value.
   - A write that updates the open card and then throws: `runDbCardWrite` rejects with that same error and the store already shows the updated card.
   - Restore, through the component: render `BackupRestoreSection` (`profiles` empty, `loadCardsFromDb` and `loadProfilesFromDb` from the store), replace `useDialogStore`'s `showAlert` with a `vi.fn`, add card `c1` to `db.cards` and open it, then choose a JSON file through the hidden file input (`fireEvent.change`). Build the backup like `makeBackup` in `test/backupRestoreMerge.test.ts` (copy the few helpers you need) with a newer `c1`. Expect `showAlert` called with a message that starts with "Database restored!" and the title "Restore Successful", the store's `activeCard` showing the incoming name, and, after one edit and the autosave, the stored card still holding the incoming name. A second case: an older backup copy is kept, so `activeCard` stays the same object and no undo entry is added. If jsdom's `File` has no `text()`, stub it on the test's file; do not change `src` for that. The restore must go through the component, not through a direct `runDbCardWrite` call, so the wiring is tested.
6. Run the whole suite. If an existing test other than the new file fails, stop and report its name and the failure; do not edit it.

## Known limits, not fixed here

- Undo restores card data only, not images, as for every undo today. After an overwrite import with new art, Undo brings back the old text and keeps the new art.
- The tab-hide flush (`useCardStore.ts`) is untouched; it writes only while `saveState` is `'saving'`, and the new action sets `'idle'` after a reload.
- `restoreFullBackup` in overwrite mode is never called by the UI and is not changed.

## Done when

- `npm ci && npm run lint && npm test && npm run build` pass locally and the PR description lists the real counts, which new tests failed before the change, and the `grep` result. `test-and-lint` is green. Stop for review (`Review: required`).
- Only the four listed files change, plus the card deleted in the last commit. No visible text in `BackupRestoreSection.tsx` changes.
- Owner phone check (not a gate, Decision 17): open a card, go to the Library, import the same card from a file with a different name inside and choose overwrite, then open the card again: it shows the imported content. Type a letter, wait two seconds, go to the Library and open it again: the imported content plus your letter. In the editor, Undo brings back the version from before the import. Then Settings, Restore Database with a backup that holds a newer copy of the open card: the same result.

## Stop and report

Another caller of `restoreFullBackup` exists in `src/`; the work seems to need a change in `src/db`, `src/io`, `src/routing` or `useCardStore.ts`; the restore test cannot be made to work in jsdom after 2 attempts (do not move code out of the component to make it testable); a listed file grows past the card by 2 or more files; CI is red after 2 fix attempts.
