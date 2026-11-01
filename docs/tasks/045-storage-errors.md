# Task 045: Name the failed field on import, and stop silent save failures

Review: required
Goal: When a card cannot be imported because a field is over its storage limit, the person sees which field and what the limit is; a card that fails inside a multi-file or ZIP import is listed, not dropped; and a failed save of card data or cover art is never silent.
Files to touch: new `src/utils/storageErrors.ts`, `src/store/slices/cardSlice.ts`, `src/components/GalleryView.tsx`, new `test/storageErrors.test.ts`.
Do not touch: `src/schemas` (no limit changes), `src/db`, `src/io`, `src/store/slices/types.ts`, `src/components/gallery/PasteImportModal.tsx` (read it, do not edit it), every other file, `docs/` (except deleting this card in the last commit).
Decisions: none. Background: `docs/BUGS.md`, entries "Storage limits can reject real-world cards" and "Storage limits are enforced on add but not on update".

Revised 2026-11-01 after Muse's first attempt stopped (correctly, under "Stop and report"; no branch, no PR). The first version of this card said every write runs the strict storage schema. That is true for `add` only. Muse's probe on fake-indexeddb showed the Dexie `updating` hook in `src/db/index.ts` never runs the schema for a card update, because Dexie hands the hook dotted keys (`cardData.data.creator`) and the hook only checks `'cardData' in mods`; an update with a 2,001-character creator is stored with no error. Claude re-read the hook (not Dexie's internals, and did not re-run the probe). This card therefore does NOT change what is accepted: enforcing the limits on update is parked in `docs/BUGS.md` until real cards decide the caps. Card 045 makes the failures that do happen readable.

## What the code does today

- Add path (seen by Muse's probe): `db.cards.add` runs the strict schema in the `creating` hook. A creator of 2,001 characters gives one issue `{ origin: 'string', code: 'too_big', maximum: 2000, path: ['data','creator'] }`, and Dexie rethrows the bare ZodError, unwrapped. Limits are in `src/schemas/limits.ts` (creator and character_version 2,000; description, personality, scenario, first_mes, system_prompt, post_history_instructions and creator_notes 50,000; a lorebook entry's content 20,000; extensions 200,000 serialized characters via a custom issue message).
- Update path (seen by Muse's probe): `db.cards.update` with an oversized `cardData` succeeds and stores it. So today an oversize edit in the editor, a cover save, and an overwrite import all save silently; only a new-card import (`add`) throws. This card leaves that as it is.
- `package.json` has `zod ^4.4.3`. Zod's error `message` is its issue list as raw text, not a sentence.
- `saveActiveCardMetadata` (autosave, undo, redo) catches an error, sets `saveState: 'error'` and shows the toast "Failed to save card" with `err.message`. Since an oversize edit does not throw, this toast today covers other failures (for example full storage). The second catch in `triggerAutosave` ("Autosave failed") can never run, because the inner function never throws.
- `saveActiveCard` (called after a cover image is set or removed) has no try/catch: a failure rejects the caller with no toast.
- `importCardRecord` has no try/catch. In `GalleryView.handleFileUpload` a single file's failure reaches the outer catch and `setImportError(err.message)` (raw text). With several files, the first failure aborts the loop, later files are not tried, and the success message for earlier files is not shown.
- In the ZIP branch two places swallow a failed card with no message: the first `try { importCardData ... importOne ... } catch { }` (a save failure inside it is treated as "not a single CHARX" and the file falls through to bulk extraction), and the per-entry `catch (err) { console.warn(...) }` in the bulk loop.
- `handleCreateFromPaste` calls `importCardRecord` with no try/catch; whether `PasteImportModal` catches is not read.

## Changes

1. New `src/utils/storageErrors.ts` exporting `describeStorageError(err: unknown): string`. Pure, never throws.
   - Find the Zod error: look at `err`, `err.inner` and `err.cause`, and take the first one with an `issues` array. Muse verified the real shape above; if a real `db.cards.add` failure ever shows a different shape, build on what you print, not on this card.
   - For each issue (at most 3, then "and N more") produce `<Field>: <reason>`. Field comes from the path with a leading `data` removed: `creator` "Creator", `character_version` "Character version", `description` "Description", `personality` "Personality", `scenario` "Scenario", `first_mes` "First message", `mes_example` "Example dialogue", `system_prompt` "System prompt", `post_history_instructions` "Post-history instructions", `creator_notes` "Creator notes", `name` "Name", `tags` "Tags", `alternate_greetings` "Alternate greetings", `extensions` "Extensions"; a path under `character_book.entries.<n>` reads "Lorebook entry <n+1>, <field>" (with `content` "content", `keys` "keys", `name` "name", `comment` "comment", `extensions` "extensions"); any other path is joined with " > ".
   - Reason: a too-long string (`code: 'too_big'`, `origin: 'string'`) reads "is too long (limit 2,000 characters)" using the issue's `maximum` with thousands separators; a too-long list (`origin: 'array'`) reads "has too many items (limit N)"; a custom issue keeps its own message (the extensions message already contains the size and the limit); anything else uses the issue's message.
   - A non-Zod error returns its `message`, or "Database error" when there is none (this includes the browser's storage-full error, which the helper does not rename).
2. `cardSlice.ts`:
   - `saveActiveCardMetadata`: the toast message becomes `describeStorageError(err)`. Title, `saveState: 'error'` and the console line stay.
   - `saveActiveCard`: wrap its whole body in the same try/catch as `saveActiveCardMetadata` (log, `saveState: 'error'`, the same toast with `describeStorageError`). It does not rethrow.
   - `importCardRecord`: wrap the two write paths (the overwrite `update` and the `add`). On failure throw `new Error(describeStorageError(err), { cause: err })`, so every caller's existing error display becomes readable.
   - Do not validate against the storage schema yourself before a write, and do not add any check that makes an update fail where it succeeds today. Leave `createNewCard`, `createVariant` and the `triggerAutosave` code as they are.
3. `GalleryView.tsx`, `handleFileUpload`:
   - With more than one file selected, wrap each file's processing in its own try/catch: on a failure push `"<file name>: not imported: <message>"` to `collectedWarnings` and continue with the next file. With exactly one file, keep today's behaviour (the error goes to `setImportError`).
   - ZIP branch, single-CHARX attempt: only `importCardData` is inside the swallowing try. Call `importOne` after it, outside the try. A failure of `importOne` is then handled like a single file's failure (warning in the multi-file case, error in the one-file case).
   - ZIP branch, bulk loop: keep the per-entry try/catch for unreadable entries, but a failure of `importOne` pushes `"<entry path>: not imported: <message>"` to `collectedWarnings`; an entry that is not a card stays silent as today.
   - `handleCreateFromPaste`: wrap the `importCardRecord` call; on failure `setImportError(message)` and return `false`. First read `PasteImportModal.tsx` and note in the PR description what it does with a `false` result and with a thrown error.
4. `test/storageErrors.test.ts` (same setup style as `test/autosaveFlush.test.ts`: jsdom, `../test/setup`, clear `db.cards` and the store in `beforeEach`). Write the store tests first and report which fail on unmodified code:
   - `describeStorageError` on a real storage-schema failure: creator of 2,001 characters names "Creator" and "2,000"; extensions over 200,000 characters names "Extensions"; a lorebook entry whose content is 20,001 characters names "Lorebook entry 1" and "content"; more than 3 issues ends with "and N more"; a plain `Error('x')` returns "x"; `null` returns "Database error"; the error thrown by a real `db.cards.add` with an oversized creator also names "Creator".
   - `importCardRecord` for a new card with an oversized creator rejects with a message that names "Creator".
   - `saveActiveCardMetadata` and `saveActiveCard`: make the database write fail on purpose (spy on the write each function really makes, `vi.spyOn(db.cards, 'update')` per Muse's probe, and reject once with a real ZodError taken from `CharacterCardV3StorageSchema.safeParse` of a card with a 2,001-character creator). Expect `saveState` `'error'`, a toast (spy on `useToastStore.getState().showToast`) whose message names "Creator", and for `saveActiveCard` that the call resolves instead of throwing. Do not write a test that saves an oversized value through a real update and expects either a throw or a success: that behaviour is the open decision in `docs/BUGS.md`.
5. Run the whole suite. If an existing test other than the new file fails, stop and report its name and the failure; do not edit it.

## Done when

- `npm ci && npm run lint && npm test && npm run build` pass locally and the PR description lists the real counts, which new tests failed before the change, and what `PasteImportModal` does. `test-and-lint` is green.
- No file outside the four listed is changed. `src/schemas/limits.ts` and `src/db/index.ts` are untouched.
- Owner phone check (not a gate, Decision 17): only if the owner has a card whose Creator field is over 2,000 characters. Import it on its own: the error names Creator and the limit. Import a ZIP with one valid card and that card: the valid card imports and the message names the other. Typing over the limit in the editor is not expected to show a toast (see `docs/BUGS.md`).
- The PR's last commit deletes this card file.

## Stop and report

A real `db.cards.add` failure carries no Zod error anywhere in what Dexie throws; the work seems to need a change to `src/schemas`, `src/db` or `types.ts`; a listed file grows past the card by 2 or more files; CI is red after 2 fix attempts.
