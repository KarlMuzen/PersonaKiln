# Task 045: Name the field when a save or import fails

Review: required
Goal: When a card cannot be saved or imported because a field is over its storage limit, the person sees which field and what the limit is, and no failed card is dropped without a message.
Files to touch: new `src/utils/storageErrors.ts`, `src/store/slices/cardSlice.ts`, `src/components/GalleryView.tsx`, new `test/storageErrors.test.ts`.
Do not touch: `src/schemas` (no limit changes), `src/db`, `src/io`, `src/store/slices/types.ts`, `src/components/gallery/PasteImportModal.tsx` (read it, do not edit it), every other file, `docs/` (except deleting this card in the last commit).
Decisions: none. Background: "Storage limits can reject real-world cards" in `docs/BUGS.md`. Claims below were read in the code at `main` `f824ea2` by Claude on 2026-11-01 and not run.

## What the code does today

- Every write to `db.cards` and `db.lorebooks` runs the strict storage schema in a Dexie hook (`src/db/index.ts`): `CharacterCardV3StorageSchema.parse(...)` throws a Zod error past a limit (`src/schemas/limits.ts`: creator and character_version 2,000 characters; description, personality, scenario, first_mes, system_prompt, post_history_instructions and creator_notes 50,000; a lorebook entry's content 20,000; extensions 200,000 serialized characters via a custom issue message). Import reads cards with the loose schema, so a card can be read and then fail when it is added.
- `package.json` has `zod ^4.4.3`. The error's `message` is Zod's issue list as raw text, not a sentence. How Dexie hands a hook's exception back (as the same object, or wrapped) is not verified.
- `saveActiveCardMetadata` (autosave, undo, redo) catches the error, sets `saveState: 'error'` and shows the toast "Failed to save card" with `err.message`. The second catch in `triggerAutosave` ("Autosave failed") can never run, because the inner function never throws.
- `saveActiveCard` (called after a cover image is set or removed) has no try/catch: a failure rejects the caller with no toast.
- `importCardRecord` has no try/catch. In `GalleryView.handleFileUpload` a single file's failure reaches the outer catch and `setImportError(err.message)` (raw text). With several files, the first failure aborts the loop, later files are not tried, and the success message for earlier files is not shown.
- In the ZIP branch two places swallow a failed card with no message: the first `try { importCardData ... importOne ... } catch { }` (a save failure inside it is treated as "not a single CHARX" and the file falls through to bulk extraction), and the per-entry `catch (err) { console.warn(...) }` in the bulk loop.
- `handleCreateFromPaste` calls `importCardRecord` with no try/catch; whether `PasteImportModal` catches is not read.

## Changes

1. New `src/utils/storageErrors.ts` exporting `describeStorageError(err: unknown): string`. Pure, never throws.
   - Find the Zod error: look at `err`, then `err.inner`, then `err.cause`, and take the first object with an `issues` array. Before writing the mapping, run the real thing (a card with a 2,001-character creator through `CharacterCardV3StorageSchema.safeParse`, and through `db.cards.add` on fake-indexeddb) and print one issue and the thrown object; build the helper on what you see (`code`, `origin`, `maximum`, `path`, `message`), not on this card's guess of Zod 4's shape. If no Zod error can be found inside what Dexie throws, stop and report (see Stop and report).
   - For each issue (at most 3, then "and N more") produce `<Field>: <reason>`. Field comes from the path with a leading `data` removed: `creator` "Creator", `character_version` "Character version", `description` "Description", `personality` "Personality", `scenario` "Scenario", `first_mes` "First message", `mes_example` "Example dialogue", `system_prompt` "System prompt", `post_history_instructions` "Post-history instructions", `creator_notes` "Creator notes", `name` "Name", `tags` "Tags", `alternate_greetings` "Alternate greetings", `extensions` "Extensions"; a path under `character_book.entries.<n>` reads "Lorebook entry <n+1>, <field>" (with `content` "content", `keys` "keys", `name` "name", `comment` "comment", `extensions` "extensions"); any other path is joined with " > ".
   - Reason: a too-long string reads "is too long (limit 2,000 characters)" using the issue's maximum with thousands separators; a too-long list reads "has too many items (limit N)"; a custom issue uses its own message (the extensions message already contains the size and the limit); anything else uses the issue's message.
   - A non-Zod error returns its `message`, or "Database error" when there is none (this includes the browser's storage-full error, which the helper does not rename).
2. `cardSlice.ts`:
   - `saveActiveCardMetadata`: the toast message becomes `describeStorageError(err)`. Title, `saveState: 'error'` and the console line stay.
   - `saveActiveCard`: wrap its whole body in the same try/catch as `saveActiveCardMetadata` (log, `saveState: 'error'`, the same toast with `describeStorageError`). It does not rethrow.
   - `importCardRecord`: wrap the two write paths (the overwrite `update` and the `add`). On failure throw `new Error(describeStorageError(err), { cause: err })`, so every caller's existing error display becomes readable.
   - Leave `createNewCard`, `createVariant` and the `triggerAutosave` code as they are.
3. `GalleryView.tsx`, `handleFileUpload`:
   - With more than one file selected, wrap each file's processing in its own try/catch: on a failure push `"<file name>: not imported: <message>"` to `collectedWarnings` and continue with the next file. With exactly one file, keep today's behaviour (the error goes to `setImportError`).
   - ZIP branch, single-CHARX attempt: only `importCardData` is inside the swallowing try. Call `importOne` after it, outside the try. A failure of `importOne` is then handled like a single file's failure (warning in the multi-file case, error in the one-file case).
   - ZIP branch, bulk loop: keep the per-entry try/catch for unreadable entries, but a failure of `importOne` pushes `"<entry path>: not imported: <message>"` to `collectedWarnings`; an entry that is not a card stays silent as today.
   - `handleCreateFromPaste`: wrap the `importCardRecord` call; on failure `setImportError(message)` and return `false`. First read `PasteImportModal.tsx` and note in the PR description what it does with a `false` result and with a thrown error.
4. `test/storageErrors.test.ts` (same setup style as `test/autosaveFlush.test.ts`: jsdom, `../test/setup`, clear `db.cards` and the store in `beforeEach`). Write the store tests first and report which fail on unmodified code:
   - `describeStorageError` on a real storage-schema failure: creator of 2,001 characters names "Creator" and "2,000"; extensions over 200,000 characters names "Extensions"; a lorebook entry whose content is 20,001 characters names "Lorebook entry 1" and "content"; more than 3 issues ends with "and N more"; a plain `Error('x')` returns "x"; `null` returns "Database error"; the error thrown by a real `db.cards.add` with an oversized creator also names "Creator" (this covers Dexie's wrapping).
   - `saveActiveCardMetadata` with an oversized creator in `activeCard`: `saveState` is `'error'` and the toast message (spy on `useToastStore.getState().showToast`) names "Creator".
   - `saveActiveCard` with an oversized creator resolves (does not throw), sets `'error'` and shows the same toast.
   - `importCardRecord` with an oversized creator rejects with a message that names "Creator".
5. Run the whole suite. If an existing test other than the new file fails, stop and report its name and the failure; do not edit it.

## Done when

- `npm ci && npm run lint && npm test && npm run build` pass locally and the PR description lists the real counts, which new tests failed before the change, and what `PasteImportModal` does. `test-and-lint` is green.
- No file outside the four listed is changed. `src/schemas/limits.ts` is untouched.
- Owner phone check (not a gate, Decision 17): in the editor type or paste 2,100 characters into Creator and wait a second; the toast says which field and the limit. Import a ZIP that holds one valid card and one card with an oversized creator: the valid card imports and the message names the other.
- The PR's last commit deletes this card file.

## Stop and report

No Zod error can be found in what Dexie throws; the fix needs a change to `src/schemas`, `src/db` or `types.ts`; a listed file grows past the card by 2 or more files; CI is red after 2 fix attempts.
