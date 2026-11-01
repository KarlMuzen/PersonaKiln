# Research 004: real-fixture check (SillyTavern Seraphina card and Eldoria lorebook)

Findings only, no decisions. Date: 2026-11-01. The two files are not in the repo (licence question in `PROJECT_STATE.md`, "Real fixtures").

## Sources and labels

- **Muse** (executor, read-only; reports relayed by the owner): downloaded `default_Seraphina.png` (551,901 bytes) and `Eldoria.json` (a SillyTavern world-info file, 4 entries) from the official SillyTavern repo, imported both in the live app (production served build `4131073`; Vercel cancelled the docs-only commit `0d2b44c`) and ran a scratch harness at `0d2b44c` (import, IndexedDB read-back, export). No settings, merges or deletes were made. Claude did not see the files or re-run any of this.
- **Code**: Claude read the code behind each finding at `0d2b44c` (`src/io/png.ts`, `src/utils/normalizeLorebook.ts`, `src/utils/lorebookConflict.ts`, `src/components/LorebookView.tsx`). Each verdict is in `docs/BUGS.md`.

## Seraphina PNG

- Muse: the PNG's tEXt chunks are `chara` then `ccv3`. The payloads differ only in spec and spec_version (V2 2.0, V3 3.0); both carry the 4-entry book. The app imported it with the CCv3 badge, toast "Successfully imported 1 character card!" and "Import Defaults Applied (16)" (extensions chat, create_date, creatorcomment; book description, scan_depth, token_budget, recursive_scanning, extensions; 4 entries missing a name; assets, nickname, creator_notes_multilingual, source, creation and modification dates).
- Muse: filled fields were name, description (689 tokens), first greeting (180 tokens), creator notes, creator, character version and the embedded book (4 entries). Empty as separate fields: personality, scenario, example dialogue, system prompt, post-history, tags, alternate greetings; that content sits inside the description.
- Muse: the app's duplicate warning read "Found 2 duplicate 'ccv3' tEXt chunks; selected the later occurrence". Code: that text is wrong on both counts (it prints the winner's keyword for every candidate, and the rule is the longest payload, with the later chunk winning only a tie).
- Muse: the card-embedded book (raw `ccv3` entries) already uses CCv3 names (id, keys, secondary_keys, insertion_order 100, position `before_char`, use_regex true) plus snake_case `extensions` (position 0, depth 4, probability 100). Stored, JSON export and a PNG export read back were identical except that `name` (= comment) was added. No field lost.

## Eldoria.json as a composer layer

- Muse: imported as a second layer named Eldoria (name taken from the file name, the file has none), 4 entries, no toast or dialog. Code: `handleAddImportedLayer` only calls `setLayers`; the layer is component state and nothing is written to IndexedDB until Merge Stack to Card.
- Muse (run: import, read-back, export; for a layer "stored" is the normalized layer object, since no database row exists): position source 0, stored dropped, exported absent. uid 0-3 to `extensions.uid`; secondary keys `[]` kept; comment to `name` and `comment`; probability 100 to `extensions.probability`; depth 4 to `extensions.depth`; selective true kept; constant false kept; disable false to enabled true; order 100 to `insertion_order` 100; `key` renamed to `keys`. Every other SillyTavern field (displayIndex, addMemo, group, groupOverride, groupWeight, sticky, cooldown, delay, useProbability, role, vectorized, excludeRecursion, preventRecursion, delayUntilRecursion, scanDepth, caseSensitive, matchWholeWords, useGroupScoring, automationId) went to `extensions` verbatim and was exported verbatim. Only the numeric `position` was lost. Code: `position` is in the handled key set of `normalizeLorebook`, which keeps it only as `before_char` or `after_char`.
- Muse: the layer's JSON export (`exportStandaloneLorebook`) writes `{spec: lorebook_v3, data}` verbatim. No PNG export path exists for a layer; not verified.

## Composer counts for the stack (Seraphina book plus Eldoria layer, the same 4 entries twice)

- Muse (run on the two stored books) and Code: 8 entries, 1922 tokens. 15 collisions are distinct keys (4 + 5 + 3 + 3, each in 2 entries). 12 shadowed are (entry, reason) records on the 4 Eldoria entries: 4 `priority_shadowed`, 4 `duplicate_content`, 4 `budget_starvation` (budget 1000 from the primary book). Selective lockout 0 (selective true, secondary keys empty). `activeEntriesCount` subtracts 12 records from 8 entries and clamps at 0, so the simulator reads "0 / 8 active entries fire"; counted by distinct entries it is 4.

## Not checked

- How many real PNGs carry `chara-ext-asset_:` chunks; no CHARX sample was found.
- Which numeric `position` values SillyTavern maps to which placement, and what it does with a missing one on re-import.
- Whether leaving the Lorebook screen drops staged composer layers (inferred from `useState`, not run).
