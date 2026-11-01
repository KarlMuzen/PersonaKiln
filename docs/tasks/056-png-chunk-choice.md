# Task 056: PNG chunk choice

Review: required
Goal: When a PNG holds several card chunks, `readCardFromPng` reads `ccv3` first, then `chara`, then any other accepted card name, and its warning names the chunks it found and the rule it used.
Files to touch:
- `src/io/png.ts`
- `test/pngChunkChoice.test.ts` (new)

Do not touch: `src/schemas`, `src/db`, `src/store`, `src/io/index.ts`, `src/io/charx.ts`, `src/io/converter.ts`, `src/core/`, `src/components/`, every crypto or passkey file, `package.json` and the lock file, CI and deploy config, `docs/`, `scripts/smoke.py`, every existing file in `test/`. No new dependency. No frozen identifier. Not in this card: the extra-asset code in `png.ts` (card 055, merged) and a check of the finished file's size (`docs/BUGS.md`).

Changes:

What Claude read at `main` `f0a94cc` (`src/io/png.ts` in full; re-check each, a mismatch is a conflict with the repo, so stop):
- `readCardFromPng` keeps every `tEXt` chunk whose lower-cased keyword is in `CARD_KEYWORDS` (`ccv3`, `chara`, `chara_card_v3`, `chara_card_v2`, `character`, `character_card`, `tavern`, `card`) as `candidateChunks`, in file order, and passes them to `pickBestDuplicateCandidate`. That function is private to `png.ts`, and `readCardFromPng` is its only caller.
- `pickBestDuplicateCandidate` decodes each candidate with `decodeChunkToJSON` and drops those that do not decode. If some of the rest have a `character_book` (in `data` or at the top level) and some do not, only those with one compete. A `reduce` then takes the longest `JSON.stringify` and, on equal length, the later chunk (`>=`). The keyword plays no part, although the comment says "Prefer CCv3". When there is more than one candidate it returns `Found N duplicate '<best.keyword>' tEXt chunks; selected candidate that includes character_book.` or `...; selected the later occurrence.`: it prints the winner's keyword for every candidate and calls a longest-wins pick "the later occurrence".
- `readCardFromPng` sets `sourceFormat` to `'chara_v2'` when the picked keyword, lower-cased, is `chara`, else `'ccv3'`, and pushes the picked warning into `warnings`.
- No test mentions this: a code search of the repo found no test file that contains `pickBestDuplicateCandidate`, "later occurrence" or "includes character_book". `test/png.test.ts` mocks `png-chunks-extract` for its two size tests; vitest mocks are per file, so the new tests live in their own file.
- SillyTavern `release`, `src/character-card-parser.js` (Claude read it in full on 2026-11-02): `read` takes the first `tEXt` chunk whose keyword, lower-cased, is `ccv3`, else the first `chara`, else throws; other names are ignored. `write` removes old `chara` and `ccv3` chunks, writes `chara`, then writes `ccv3` made from the same JSON with `spec` set to `chara_card_v3` and `spec_version` to `3.0`. So its PNGs hold the same data twice and the pair differs only in those two fields; SillyTavern's `default_Seraphina.png` is that case (`docs/research/004-real-fixture-check.md`). `docs/research/001-st-spec-verification.md`, claim 5, adds that RisuAI reads `ccv3` first and that the V3 spec says SHOULD use `ccv3` (read 2026-10-30; not re-read now).

Design (Claude's call):

1. Rank, then the old rule inside a rank (`pickBestDuplicateCandidate`, or a rename if the executor prefers one; keep the signature of `readCardFromPng` and the `ReadPngResult` type). Compare keywords lower-cased: rank 1 is `ccv3`, rank 2 is `chara`, rank 3 is every other name in `CARD_KEYWORDS`. Use the best rank that has at least one chunk that decodes to a JSON object; only the chunks of that rank compete. Inside the rank the rule stays as it is today: if some chunks have a `character_book` and some do not, only those with one compete; the longest `JSON.stringify` wins; on equal length the later chunk in the file wins. A chunk that does not decode never competes, and a better rank whose chunks all failed to decode is skipped. Reason: SillyTavern and RisuAI read `ccv3` first; a longest-wins rule across names can let a `chara` chunk beat the `ccv3` chunk and drop the V3-only fields; and in the SillyTavern pair the two chunks tie on length, so today file order alone decides.
2. The warning. When there is more than one candidate chunk (counted before decoding, as today) the warning is one string, built as `Found {N} card chunks ({list}); used '{kw}'.` followed, in this order, by each sentence below that applies, each preceded by one space:
   - Order sentence, when not every candidate has the same rank as the used chunk: `Order used: ccv3, then chara, then other names.`
   - Unreadable sentence, when at least one candidate did not decode: `Could not read: {unreadable}.`
   - Same-rank sentence, when more than one chunk of the used rank decoded: `Several chunks of the same rank were read; picked {how}.` where `{how}` is `the one with a character_book` when the book rule narrowed them, otherwise `the longest (the later one if equal)`.
   `{N}` is the number of candidate chunks, decoded or not. `{list}` and `{unreadable}` are the chunks' keywords exactly as stored in the file, each in single quotes and joined with `, `, in file order (a repeated keyword is repeated). `{kw}` is the used chunk's keyword as stored, not lower-cased. Examples (the tests assert these exact strings):
   - SillyTavern's pair, `chara` then `ccv3`: `Found 2 card chunks ('chara', 'ccv3'); used 'ccv3'. Order used: ccv3, then chara, then other names.`
   - `ccv3` unreadable, `chara` fine: `Found 2 card chunks ('ccv3', 'chara'); used 'chara'. Order used: ccv3, then chara, then other names. Could not read: 'ccv3'.`
   - Two `ccv3`, one with a book: `Found 2 card chunks ('ccv3', 'ccv3'); used 'ccv3'. Several chunks of the same rank were read; picked the one with a character_book.`
   - Two `ccv3`, no book: `Found 2 card chunks ('ccv3', 'ccv3'); used 'ccv3'. Several chunks of the same rank were read; picked the longest (the later one if equal).`
   One candidate chunk: no warning, as today. This is the only new or changed warning.
3. What stays: the `sourceFormat` rule; `CARD_KEYWORDS` (names SillyTavern ignores stay accepted); the fallback card when nothing decodes; file order matters only as the tie-break. Not changed on purpose: the warning still shows for the normal `ccv3` plus `chara` pair, as it does today (it is now true instead of wrong); silencing it needs a comparison of the two chunks and is a separate decision.
4. Stop and send one message if: any claim above does not match the code; an existing test fails because of the new rule (none is known, so the full suite must pass with no change to an existing test file); the change needs a file outside the list.

Tests (`test/pngChunkChoice.test.ts`; build every fixture in the test with `createDummyPng`, `png-chunks-extract`, `png-chunks-encode`, `png-chunk-text`, `createNewDefaultCard` and `utf8ToBase64`, as `test/pngExtraAssets.test.ts` does; no `vi.mock`; no third-party card file; render nothing; read with `readCardFromPng`). Build each chunk's JSON from `createNewDefaultCard`, give each chunk its own `data.description` so a test can tell which one was read, encode it with `utf8ToBase64(JSON.stringify(json))`, and for a V2-style chunk set `spec` to `chara_card_v2` and `spec_version` to `2.0` (if that does not read back, use `convertV3ToV2` as `writeCardToPng` does). A chunk that does not decode is the text `not a card`. Assert the warning with `toContain` of the exact string, because the normaliser may add its own warnings.
- SillyTavern's pair, `chara` then `ccv3`, same payload except the spec fields: the `ccv3` card is read, `sourceFormat` is `'ccv3'`, the warning is the first example above.
- The reverse order (`ccv3` then `chara`): the `ccv3` card is read, `sourceFormat` is `'ccv3'`, the warning lists `'ccv3', 'chara'`.
- The `chara` payload is longer than the `ccv3` payload: the `ccv3` card is read.
- The `chara` chunk has a `character_book` and the `ccv3` chunk has none: the card read has no book.
- `ccv3` unreadable, `chara` fine: the `chara` card is read, `sourceFormat` is `'chara_v2'`, the warning is the second example.
- Upper-case `CCV3` (shorter) plus `chara` (longer): the `CCV3` card is read and the warning says `used 'CCV3'`.
- A `character` chunk (longer) plus a `chara` chunk: the `chara` card is read, `sourceFormat` is `'chara_v2'`.
- Two `ccv3` chunks, the shorter one with a `character_book`: the one with the book is read, the warning is the third example.
- Two `ccv3` chunks, no books: the longer one is read in either file order; on equal length the later one is read; the warning is the fourth example.
- One chunk only, `ccv3` and separately `chara`: it is read, `sourceFormat` is as before, `warnings` has no card-chunk warning.
- The app's own export (`writeCardToPng` with `backfillV2: true`) read back: `sourceFormat` is `'ccv3'` and the card is the one written. Do not assert the warning text here.
- Mutation check: every test whose expectation is new (the pick, the exact warning, the upper-case, `character` and book cases) must fail on unmodified `src/`; say in the PR description which tests passed on old code (the single-chunk tests and some picks may).

Done when: `npm run lint && npm test && npm run build` pass (lint 0 errors; warnings no higher than the baseline of 45; the test count rises from 416), CI `test-and-lint` is green, and the executor stops and reports (`Review: required`) for Claude's diff review; it merges only after `Approved` on the current head. No screen changes, so there is no owner phone check. Optional after the merge, never a gate: the owner asks Muse to re-import `default_Seraphina.png` (it stays out of the repo, licence question in `PROJECT_STATE.md`) and report the warning, which should be the first example. In the PR description: `Checks run`, which tests passed on old code, and the warning text for SillyTavern's pair exactly as the code produces it.

Decisions: 17 (owner phone checks do not gate the merge), 26 (the finding comes from a real-file check run by Muse that Claude re-read in the code; Claude re-read the code and SillyTavern's parser again for this card).
