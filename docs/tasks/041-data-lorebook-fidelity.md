# Task 041: Data and lorebook fidelity (Sweep A)

Review: required
Goal: A real-world card is no longer rejected at 2,000 characters in personality or scenario, and the lorebook simulator and conflict report keep the same entries SillyTavern keeps when the token budget runs out (higher `insertion_order` first).

Files to touch:
- `src/schemas/limits.ts`
- `src/schemas/cardSchema.ts`
- `src/utils/lorebookScan.ts`
- `src/utils/lorebookConflict.ts`
- `test/cardSchema.test.ts`
- `test/lorebookScan.test.ts`
- `test/lorebookConflict.test.ts`

Do not touch:
- `src/utils/normalizeLorebook.ts`. A numeric SillyTavern `position` stays dropped until a real SillyTavern fixture exists (BUGS, owner decision 2026-11-01).
- `src/db/`, `src/io/`, `src/store/`, `docs/`.
- Any other `LIMITS` value (extensions 200,000, lorebook entry content 20,000, names, tags, avatar) and the value of `LONG_TEXT`.
- `mergeLorebookLayers` in `lorebookConflict.ts`, including `copy.insertion_order = (combinedEntries.length + 1) * 10`. After this card the first layer's entries get the lowest numbers and drop first under a tight budget; the owner decides that separately.
- The simulator's loop that stops at the first entry that does not fit, and the `details` text of the conflict entries.
- Any warning wording in the UI (card 024).

Changes:
1. Caps. In `cardSchema.ts`, `CharacterCardV3DataStorageSchema`: `personality` and `scenario` use `LIMITS.LONG_TEXT` (50,000) instead of `LIMITS.SHORT_TEXT`. `creator`, `character_version` and the lorebook `comment` and `description` stay on `SHORT_TEXT`. In `limits.ts`, fix the two comments so they match: `SHORT_TEXT` is creator, character_version, lorebook comment and description; `LONG_TEXT` also lists personality and scenario.
2. Budget order, simulator. In `lorebookScan.ts` (the sort near line 264) keep the weight sort first (higher weight first), then sort by `b.order - a.order`. Leave everything after the sort alone.
3. Budget order, conflicts. In `lorebookConflict.ts` make the same change at the collision sort (near line 170) and the budget sort (near line 256), and update the comment above the first one to say "weight desc, then order desc (higher order wins, as in SillyTavern)".
4. Tests.
   - `cardSchema.test.ts`: personality and scenario of 50,000 characters pass `CharacterCardV3StorageSchema`; 50,001 characters fail; a `creator` of 2,001 characters still fails.
   - `lorebookScan.test.ts`: the test "respects token_budget and insertion_order truncation" now expects entries 30 and 20 (budget 20: 5 + 10 tokens), total 15 tokens, and the entry with order 10 dropped. Rename it and fix its comments to say the higher order survives, the lower drops first, and the loop stops at the first overflow.
   - `lorebookConflict.test.ts`, collision: with the two "Excalibur" layers from the first test (equal weight), the `priority_shadowed` entry is the one with `insertion_order` 10 and its `conflictingWith.layerName` is "World Codex".
   - `lorebookConflict.test.ts`, budget: one layer, two enabled entries with different keys and different text, equal weight, `insertion_order` 10 and 20. Use repeated common one-word text (for example 40 repeats of "sword" and of "castle") and pass a budget override between one entry's tokens and both entries' tokens (the second argument of `analyzeLorebookConflicts`). Check the counts with `totalTokensCount` before fixing the budget. Expect exactly one `budget_starvation` entry, the one with `insertion_order` 10.
5. If any other existing test fails because it relied on the old order, fix the test only if it asserted the old order; if it asserts something else, stop and report (executor stop rule).

Done when: `test-and-lint` is green. `Checks run` in the PR shows `npm ci && npm run lint && npm test && npm run build` with real results. The owner can see (phone check, not a merge gate): a card with a 3,000-character personality or scenario imports and autosaves with no "Save failed"; in the lorebook simulator with a tight token budget, the entries with the higher order numbers show and the low-numbered ones drop first.

Decisions: 26 (the SillyTavern sort direction is research 001 claim 2, marked verified, `docs/research/001-st-spec-verification.md`).
