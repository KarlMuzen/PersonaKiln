# Research 003: Argon audit verification (2026-11-01)

Findings and verdicts only, no decisions. Source: Argon's three-round audit read at `main` `e3ec01af3cf1cc235c7425bbe3a9115d50a87f60`. Chain: Argon found, Claude spot-checked some, Muse checked the data loss, privacy and security findings with `verify:` (read-only, report in the owner's chat), then Claude re-read the code behind each entry that went into `docs/BUGS.md` (raw files at the same SHA). Muse's verdicts for the three "wrong" findings were not re-read by Claude. Argon's own line numbers drift from the files throughout and some file names are wrong, so only the file and function names below are used, with Muse's or Claude's lines where given.

Problems in the report itself: it says 22 findings and lists 20; "Review: self" is not a valid review value (`required` or `skip`); its proposed cards 046-049 collided with the cutline.

| # | Claim (short) | Verdict | Checked by |
|---|---|---|---|
| 1 | Bulk ZIP export overwrites cards with the same or non-ASCII names | verified | Muse; Claude re-read `GalleryView.tsx` |
| 2 | Recovery key is generated but never shown | probably wrong: the store keeps `pendingRecoveryCode` and `PassphraseSetupModal` shows when it is set; `setupRecoveryKey` lives in `sessionSlice.ts`, not `profileSlice.ts`; not confirmed that `setupRecoveryKey` sets that state | Claude (search fragments) |
| 3 | PNG extra assets are encoded as UTF-8 text on import and not written on PNG export | verified; Argon's detail that `writeCardToPng` takes an extra-assets parameter is wrong at this SHA (it takes `{ basePng, backfillV2 }`) | Muse; Claude re-read `io/index.ts`, `png.ts` |
| 4 | Storage schemas lack `.passthrough()`, so unknown fields are dropped on every save | verified (import schemas have it, the five storage schemas do not; the Dexie hooks parse on every add and update) | Muse; Claude re-read `cardSchema.ts`, `db/index.ts` |
| 5 | Pasted JSON wrapped in `result`, `definition` or `character_card` imports as an unnamed card | wrapper handling verified; the "Unnamed Character" outcome was not run | Muse |
| 6 | CHARX `assets/` URI mismatch drops the icon | wrong (the importer keeps full paths and wires the icon) | Muse |
| 7 | Overwrite import or restore of the open card leaves a stale `activeCard` | verified (import path re-read by Claude; restore path per Muse); that the next autosave writes the stale copy is inferred | Muse; Claude |
| 8 | `flushPendingSave` updates only `cardData` and `modification_date`, not `name`, `tags`, `creator` | verified (Dexie `updating` hook does not derive them); runs only when `saveState` is `saving` | Claude |
| 9 | `createVariant` reads the source before the flush and does not cap the variant name | verified; the failed add for a long name is inferred | Muse; Claude re-read |
| 10 | Cancelled unlock still sends the request with the stored key | verified; Claude rates it a bug, not a privacy leak (the provider gets the prompt the user chose to send, with a key it rejects) | Muse; Claude |
| 11 | Merge restore mixes passphrase salt and hash into a passkey-only vault | wrong (merge mode skips every device security key) | Muse |
| 12 | Merge restore imports `enc.v1` keys encrypted under another vault | wrong (merge mode decrypt-tests them and clears the undecryptable ones, with a note) | Muse |
| 13 | Passkey-only user unlocked by recovery key cannot enroll a new passkey | verified (`SecuritySection.tsx` gates enrollment on `!isPasskeyOnly`) | Muse; Claude re-read the gate |
| 14-17, 19 | Lorebook scan position and depth, Chub plain-PNG cover, undo and redo timer races, orphaned `editor_history_` after delete, backup file input not reset | not checked | nobody |
| 18 | Merge restore keeps removed assets; ZIP backup stores each asset twice | second half already in `docs/BUGS.md` (smaller code issues, c); first half not checked | nobody |
| 20 | `docs/ARCHITECTURE.md` says db version 6 and 3 tables; code is at version 7 | wrong on the version (the db ends at `version(6)` with 4 tables); `ARCHITECTURE.md` not read | Claude |

Pre-flight of card 045 (Argon said PASS): Claude did not read the card. Adjacent gaps Argon listed: the `flushPendingSave` toast in `src/store/useCardStore.ts` shows the raw error message (present in the code, read by Claude); no try/catch in `addLorebook` and `updateLorebook` and dead catch blocks in `triggerAutosave` (not checked).
