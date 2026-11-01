# Task 057: Lorebook position kept

Review: skip
Goal: A numeric SillyTavern `position` on a lorebook entry is kept in that entry's `extensions.position` when a lorebook or a card is imported, so the saved book and the exported lorebook JSON still carry it.
Files to touch: `src/utils/normalizeLorebook.ts`; new `test/lorebookPosition.test.ts`. Nothing else, apart from deleting this card in the last commit.
Do not touch: `src/io/`, `src/schemas/`, `src/store/`, `src/db/`, `src/components/`, `src/core/`, every existing test file, `package.json` and the lock file, `docs/` (except deleting this card). The key list `HANDLED_ENTRY_KEYS` keeps `position` in it.
Changes:

Why (Claude read these on 2026-11-02 at `main` `6a19636`; re-check each claim before you start and stop on a mismatch):

- `normalizeLorebook` in `src/utils/normalizeLorebook.ts` lists `position` in `HANDLED_ENTRY_KEYS`, so the value is not copied into the entry's `extensions`, and it sets `entry.position` only when the value is the string `before_char` or `after_char`. A numeric `position` is therefore dropped. `entryExtensions` starts as a copy of the entry's own `extensions` object, so a numeric `extensions.position` that is already there survives (this is why SillyTavern's own embedded entries pass through intact).
- SillyTavern's standalone world-info files carry a numeric `position` on each entry (Eldoria's four entries carry 0; `docs/research/004-real-fixture-check.md`). On import the layer, the saved book and `exportStandaloneLorebook` (`src/io/index.ts`, writes `{ spec: 'lorebook_v3', data }`) all lose it.
- `normalizeLorebook` has three call sites found by code search: the standalone branch of `importCardData` in `src/io/index.ts`, and `src/io/converter.ts` (`normalizeLorebook(cardData) || normalizeLorebook(raw)`, so it runs for every card import, embedded books included). `src/core/pasteImport.ts` mentions the name but no call was found. This is why the card has a test for the card path.
- SillyTavern's numbers (`public/scripts/world-info.js`, seen through GitHub code search on 2026-11-02, fragments only, commit `06bde93`; the branch GitHub indexed is not shown, so it may be `staging` and not `release`): `before` 0, `after` 1, `ANTop` 2, `ANBottom` 3, `atDepth` 4, `EMTop` 5, `EMBottom` 6, `outlet` 7. For an embedded book SillyTavern reads `entry.extensions?.position` first and only then the V2 string (`before_char` gives 0, anything else 1). When it writes a book it sets the string to `before_char` for 0 and `after_char` for every other number, and the exact number goes to `extensions.position`. Not found: what a standalone entry with no `position` becomes in SillyTavern.

Design (Claude's call; the owner's cutline text already named `extensions.position`): the card keeps the number and does not interpret it. A finite numeric `position` on an entry is written to that entry's `extensions.position`, 0 included. If the entry's own `extensions.position` is already set (not `undefined`, not `null`), it wins, as it does in SillyTavern. `entry.position` (the V2 string) is not derived from the number, because the string cannot express 2 to 7 and ST's own `after_char` for them is a lossy label. A numeric string such as `"4"`, a missing position and any other value behave exactly as before.

Steps:

1. Tests first. Write `test/lorebookPosition.test.ts` (list below) and run it on unmodified `src/`. Tests 1, 6 and 7 must fail; tests 2 to 5 guard against doing too much and may pass. Say which failed in the PR description.
2. In `normalizeLorebook`, after `entryExtensions` is built and before the entry is returned, add (shape, not exact text):

```ts
if (
  typeof e.position === 'number' && Number.isFinite(e.position) &&
  (entryExtensions.position === undefined || entryExtensions.position === null)
) {
  entryExtensions.position = e.position;
}
```

   Use an explicit check, not a truthiness test: a truthiness test drops 0, which is the most common value. Leave the line that sets `entry.position` for the two strings as it is. No other change to the file.
3. Run `npm run lint && npm test && npm run build`.

Tests in `test/lorebookPosition.test.ts` (fixtures built in the file; no `vi.mock`; no third-party card or lorebook file). Read `test/lorebookImport.test.ts` first for how existing tests import and call these functions, and follow it:

1. Numeric position kept (normalize): a standalone SillyTavern-style object `{ entries: { '0': ..., '1': ..., '2': ... } }`, each entry with `uid`, `key`, `keysecondary: []`, `comment`, `content`, `constant: false`, `selective: true`, `order: 100`, `disable: false`, `depth: 4` and `position` 0, 4 and 2 in that order, through `normalizeLorebook`. Each entry's `extensions.position` equals its source number (the first is 0, checked with `toBe(0)`), and each `entry.position` is `undefined`.
2. Own `extensions.position` wins: one entry with `position: 4` and `extensions: { position: 1 }` gives `extensions.position` 1.
3. Usual embedded form unchanged: one entry with `position: 'before_char'` and `extensions: { position: 0, depth: 4 }` keeps `entry.position` `'before_char'`, `extensions.position` 0 and `extensions.depth` 4.
4. No position stays none: one entry with no `position` and no `extensions` has `entry.position` and `extensions.position` both `undefined`.
5. A V2 string alone adds nothing: one entry with `position: 'after_char'` and no `extensions` keeps `entry.position` `'after_char'` and has no `extensions.position`.
6. Import and export keep it: the object of test 1 goes through the standalone import path of `src/io/index.ts` (the way `test/lorebookImport.test.ts` calls it), the resulting lorebook goes to `exportStandaloneLorebook`, and after `JSON.parse` each entry's `extensions.position` equals its source number. If the existing tests show no way to run the import without a browser file object, normalize the object and pass the result to `exportStandaloneLorebook`, and say so in the PR description.
7. Card import keeps it: a V3 card object (`spec: 'chara_card_v3'`, `spec_version: '3.0'`, `data` with the usual fields and a `character_book` whose one entry has `keys`, `content`, `insertion_order`, `enabled`, `use_regex`, `extensions: {}` and `position: 4`) goes through the card path of `src/io/converter.ts` (`normalizeRawToV3Card`; this card does not give its signature, read it first, or use the entry point the existing import tests use for a card object). That entry's `extensions.position` is 4.

Not in this card: deriving the V2 string from the number; numeric strings and other value types; a missing position; `@@depth N` handling; the composer's counts and labels; any change to `src/schemas` or `src/io`.

Stop and send one message if: a claim above differs from the code; the change needs a file under "Do not touch" (then this card becomes `Review: required`); the entry or `extensions` type rejects a numeric `position`.

Done when: `test-and-lint` is green and `npm run lint && npm test && npm run build` pass; tests 1, 6 and 7 failed on unmodified `src/` and pass now (said in the PR description); no existing test file changed; no dependency added. Nothing on screen changes. Optional owner check, not a gate: import a SillyTavern world-info file as a lorebook, export it from the Lorebook screen and open the JSON in a text viewer: each entry has `position` under `extensions`.
Decisions: none relied on (`docs/DECISIONS.md` was not read for this card).
