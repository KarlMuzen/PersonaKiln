# Roadmap

This roadmap is dependency-ordered. Items remain planned until code, tests and compatibility evidence show they are complete.

## v1.0.0 cutline (owner said yes 2026-11-01)

Seventeen cards (the twelve first named, plus one from splitting Crucible honesty in two and one from splitting Editor polish in two, both on 2026-11-01, plus the Crucible test hardening card added the same day on Claude's recommendation, plus the PNG chunk choice and Lorebook position kept cards, moved in by the owner on 2026-11-01 with `commit: yes cutline` after the real-fixture check), then a tag. The tag comes after the owner's phone pass on the cutline cards, one smoke run (`scripts/smoke.py`) and a final `sync`. Owner gate (2026-11-01): after the last v1.0.0 card (the rebrand) the owner does real, in-depth phone testing; more review, research and bug fixing start only after that. This cutline comes before the priority plan below; everything not named here is Post-v1.0 (list at the end of this section). A card is written only when it is next to run, one at a time. The findings behind 043-049 come from an earlier Claude chat (read at `main` `e6fefc2`); Claude re-checks each one in the code when it writes that card, so treat them as unverified until the card says otherwise. Cards 042, 044 and 045 were re-read in the code on 2026-11-01 (`docs/BUGS.md`). The Update check and Full rebrand cards (labels 050 and 051) were added by the owner on 2026-11-01; the rebrand is the last card of v1.0.0.

On 2026-11-01 the owner moved three Argon-verified fixes into the cutline (checked by Muse and re-read by Claude, `docs/research/003-argon-audit-verification.md`): the stale open card (a new card right after 045), the ZIP export names (folded into the 049 batch) and the PNG extra assets (a new card before the rebrand). The same day two fixes from the real-fixture check (`docs/research/004-real-fixture-check.md`; checked by Muse on real files and re-read by Claude in the code, `docs/BUGS.md`) joined them: the PNG chunk choice and the lorebook position. Card numbers are assigned when a card is written ("Last card number used" plus 1), so the labels below, from 046 on, are names, not file numbers: the stale-open-card card took file 046 (merged as PR #45), and every later label moves up by one for each new card written before it. Card 047 (`docs/tasks/047-crucible-probes.md`) is part 1 of 2 of the "046 Crucible honesty" label; part 2 is file 048. File numbers (Claude's count, 2026-11-01): Test fidelity 049 (merged as PR #48), Editor polish 050 (Details total, merged as PR #49) and 051 (the other three changes, merged as PR #50), Honest copy 052 (merged as PR #51, `4131073`, with tweak PR #52, `2008060`), Crucible test hardening 053 (merged as PR #53, `74177d3`), Update check and clear app cache 054 (written), PNG extra assets 055, PNG chunk choice 056, Lorebook position kept 057, Full rebrand 058. The order below is the run order.

- **042 Restore safety** (`Review: required`, `src/io`; merged as PR #41, `5e707f1`):
   - Cards and lorebooks keep the newer side by date. The lorebook restore has the same rollback as cards.
   - A winning backup copy also brings `testSuites`, `scenarios`, `variantOf`, `variantLabel` and `avatarUrl`.
   - A local API key is never erased (a keyless backup merged onto an existing profile writes `apiKey: undefined`; the card starts with a test).
   - Merge mode no longer overwrites local settings (assistant chats, undo history).
   - The result dialog counts what was kept, skipped for no uuid, or failed.
- **043 Profile cleanup and key privacy** (`required`; merged as PR #42, `b8c04f2`):
   - Remove `topP`, `frequencyPenalty` and `customHeaders` (owner decision), and also `systemOverride` and `contextLimit`, which only the form, the type and the backup code touch (code search at `e6fefc2`; not a full read of `src/`).
   - Scrub values already stored, and build exports from an allowlist: removing the fields from the form alone leaves old headers in the database and in backups.
   - Old backups must still restore.
- **044 Autosave flush, D-13** (`required`, `src/store`; merged as PR #43, `f824ea2`): its own card, because it is data loss and should not ride with UI polish. The flush now lives in `selectCardForEditing`, the timer clears its own id, a running save is awaited, and a failed save keeps its `error` state.
- **045 Name the field when a save or import fails** (`required`; merged as PR #44, `bd86f93`; scope set on 2026-11-01 after Claude re-read the code):
   - One helper turns Zod's storage-limit error into "Field: reason (limit N)"; the save toast and `importCardRecord` use it.
   - `saveActiveCard` and `importCardRecord` get the error handling they lack; multi-file and ZIP imports list each failed card as a warning and carry on, instead of aborting or dropping it silently.
   - The caps in `src/schemas/limits.ts` do not change: raising them needs real-card fixtures (Post-v1.0).
   - Not in this card (Claude's call, 2026-11-01): keeping the person on a card after a failed save. It is logged in `docs/BUGS.md` with "Stay or discard" as the design.
- **Stale open card after an overwrite import or restore** (new, `required`, `src/store`; file 046, merged as PR #45, `747318b`; verified 2026-11-01, `docs/BUGS.md`):
   - When an overwrite import or a merge restore replaces the card that is open in the editor, reload that card into memory (and drop its `editor_history_<uuid>`), so the next edit or autosave cannot write the old copy back.
   - Claude re-read `importCardRecord`, the merge-restore path in `BackupRestoreSection` and `selectCardForEditing` when it wrote the card, and decided the exact call; the test covers an import over the open card.
- **046 Crucible honesty** (`skip`; split in two on 2026-11-01: part 1 is file 047, `docs/tasks/047-crucible-probes.md` (one grader, the two graded probes, "not auto-graded" for the rest, the "Leak checks passed" wording of the copied report), merged as PR #46; part 2, the scenario runs, the banner and the badge wording, is file 048, merged as PR #47):
   - One grader for Run All and Variant Compare (today they differ, and Compare ignores custom vectors).
   - Grade only `system_hijack` and `ooc_hijack`; the other vectors show the reply as "not auto-graded" and stay out of the score.
   - Scenario runs never write scores (no code in `src/` does), so the report always says "Not tested / Drift detected", and an errored run shows green "Simulation Complete" and "No character drift detected". Show failed runs as failed.
   - Reword the green banner to "no AI-disclaimer phrases found (keyword check)", change "Survived x/y" to "Leak checks passed x/y (keyword)", drop the stale "Select a persona" copy.
- **047 Test fidelity** (`skip`; file 049, merged as PR #48, `6c58262`):
   - Profile temperature and maxTokens become defaults for Chat Preview and scenario runs only; probes keep fixed values so Compare Models stays fair.
   - A stream `error` event throws instead of returning partial text as a result.
   - Send `mes_example` in the test prompt (never sent today). Owner confirmed on 2026-11-01 that Decisions 1-33 do not exclude it (Claude read `docs/DECISIONS.md` 1-33 on 2026-11-01 and found no exclusion).
- **048 Editor polish** (`skip`; split in two on 2026-11-01 into file 050 and file 051, because the Details total and the other three changes are separate outcomes and only the first needs a first-ever render test of `EditorView`):
   - **Part 1, file 050 (`docs/tasks/050-details-total.md`; merged as PR #49, `742a950`):** the Details headline became the sum of the chips, so Decision 9 holds exactly.
     - `creator_notes` left the total. The owner confirmed on 2026-11-01 that in CCv2/CCv3 it is human-facing creator commentary, never prompt text. Claude read the V2 spec explainer (`malfoyslastname/character-card-spec-v2`) the same day: it describes the field as information that is never included in prompts. The V3 text (`SPEC_V3.md`) was not retrieved in that check.
     - A "Post-history" chip was added, and the exact joined-text count went.
     - Before the card, the headline was the token count of the eight fields joined with no separator (the sum of eight per-field counts until that count resolved), and the chips showed six of the eight (Claude re-read `EditorView.tsx` at `0fa570c`).
     - One new test file, `test/EditorView.test.tsx`; no test rendered `EditorView` before (code search at `0fa570c`). Per the owner's report both tests failed on unmodified code (headline 273 against chips 212) and passed after.
   - **Part 2, file 051 (`docs/tasks/051-editor-polish-2.md`, written 2026-11-01 at `main` `742a950`; `skip`, a batch of three independent changes; merged as PR #50, `4b88825`).** What Claude re-read at `742a950` (code searches and the earlier full reads; Muse's `facts:` report gave the starting leads, its line numbers are not used):
     - **`hidden` on the "Export Card As..." placeholder.** `EditorView.tsx`: the placeholder is `<option value="" disabled>` with no `hidden`; one attribute. `scripts/smoke.py` finds that select by its label "Export card as" and picks `json`, so the smoke check is unaffected.
     - **"+ Saved Lorebook" opens on tap.** `LorebookView.tsx`: inside `dbLorebooks.length > 0` a `relative group` wrapper holds the button and a panel with `hidden group-hover:block`. No test touches `LorebookView` (code search of `test/`). The card adds a test only if it is cheap. Opening by hover goes; the menu opens by tap or click.
     - **"Personality is missing" becomes info-only (Decision 8).** `validateCardCompleteness` (`src/utils/validation.ts`) returns a plain list and skips the Personality warning only when `extensions.chub` is set; `EditorView.tsx` (the "N alerts" pill and the health panel) and `ContextBar.tsx` (`isInvalid`, which drives the amber checklist button and the amber icon on the Details tab) are its only two callers. The one test that asserts the text is `test/validation.test.ts` ("warns when personality is missing on a non-Chub card", expecting `['Personality is missing.']`); it changes. Design (Claude's call; the owner said commit yes without objecting): `validateCardCompleteness` drops the Personality line, a new `getCardInfoNotes` returns the note, and the Details health panel shows it as one grey line; `ContextBar.tsx` is not touched, so a card whose only gap is Personality stops showing as invalid there and drops out of the alert count.
- **049 Honest copy** (`skip`; file 052, merged as PR #51, `4131073`; a batch card of three independent changes, each with its own "Done when"):
   - The Export Verify modal said "zero data loss" and "safely import across SillyTavern" and nothing is tested on a real SillyTavern file: reworded. No "verified" wording anywhere until fixtures exist.
   - A "Sent to <profile>" line on the Enhancer (Decision 7).
   - Bulk ZIP export no longer overwrites cards that share a file name (added 2026-11-01, verified in `GalleryView.tsx`): a counter suffix on a repeated name, and the success toast counts the files actually written.
   - The CardCrucible leftovers that this card used to list (backup file name, error text, OpenRouter placeholder, `X-Title`) moved to the rebrand card.
   - Tweak PR #52 (`2008060`) then reworded the two overclaiming texts the card's post-change grep found outside its file list (the "Spec compliant" wording in the Card Health Check Passed box and "verify 100% round-trip fidelity" in the Guide).
- **052 Crucible test hardening** (`skip`; file 053, merged as PR #53, `74177d3`; added 2026-11-01 on Claude's recommendation after three pull requests in a row went red from this test family; the owner said yes):
   - One file, `test/crucibleScenarioHonesty.test.tsx`; no `src/` change. Tests (a) and (b) read the saved card from the database right after the screen changes, but `updateActiveCardScenarios` updates the store first and awaits the database write second, and `handleRunSimulation` does not await it (read by Claude at `main` `4131073`; `docs/BUGS.md`).
   - The card first proved the race by delaying `db.cards.update` by about 50 ms (the old assertions failed, the other 8 tests passed), then waited for the saved result with `waitFor`. Per the PR description the file passed 20 of 20 in a row; Claude saw `test-and-lint` green on head `569f674`.
   - Not in it: awaiting the call in `handleRunSimulation` (a `src/` change, logged in `docs/BUGS.md`).
- **050 Update check and clear app cache** (`skip`; file 054, `docs/tasks/054-update-check-and-clear-cache.md`, written 2026-11-01 at `main` `74177d3`; owner added 2026-11-01; Claude's call on the open choice, accepted by the owner):
   - Files, a change from the earlier expected list: new `src/utils/pwaMaintenance.ts`, `src/components/settings/PwaSection.tsx` and two new test files. `src/hooks/usePWAUpdate.ts` and `SettingsView.tsx` are not touched. Reason (Claude read the hook, `PwaSection.tsx` and `vite.config.ts` at `74177d3`; Muse's `facts:` report covered the `src/` greps): the hook keeps no handle to the registration (`r` lives only in the hourly-interval closure, guarded by `if (r)`), so a manual check needs another way to it. `navigator.serviceWorker.getRegistration()` reaches the same registration with no store, which keeps the card `skip` (routing it through a store would be `src/store`, `required`). No `src/store`, `src/db` or `src/io`; if the executor finds it must touch one of those, or the hook, it stops and the card becomes `required`.
   - A "Check for updates" button in the Settings PWA section runs `registration.update()` (15-second limit) and shows one of five status texts: up to date, a new version found (pointing at the existing Reload message, which `usePWAUpdate` shows once per page load), failed, no worker yet, unsupported. The hourly check in `usePWAUpdate` stays. Open assumption the card names: a real browser sets `installing` or `waiting` by the time `update()` resolves; the owner's phone check settles it.
   - A "Clear app cache" button is an inline two-step confirm. It refuses while `navigator.onLine` is false (clearing offline would leave an app that cannot start), then unregisters the service workers, deletes every Cache Storage entry of the origin (at `74177d3` only the generated service worker writes any: the Workbox precache and `google-fonts-cache`, `gstatic-fonts-cache`) and reloads. It never touches IndexedDB, saved settings or cards; a test seeds a card and a `localStorage` key to prove it. The confirm text says the next launch needs a connection.
   - Not built, on purpose: a "wipe everything" button (backup and restore exist and one tap must not be able to delete every card) and cookie clearing (a code search for `cookie` in `src/` on 2026-11-01 found no use). Both can be re-opened by the owner.
   - Runs before the rebrand. It no longer shares a file with it: the "CardCrucible" text in the hook's update message stays with the rebrand card.
- **PNG extra assets** (new, `required`, `src/io`; expected file 055; verified 2026-11-01, `docs/BUGS.md`; runs after the Update check card and before the rebrand):
   - On import, decode the `chara-ext-asset_:` base64 into bytes instead of encoding the text (`importCardData` in `src/io/index.ts`).
   - On PNG export, write the extra assets (`writeCardToPng` in `src/io/png.ts` has no parameter for them at `e3ec01a`; the card names the shape).
   - Claude first looks for a real PNG that carries these chunks; if none can be had, the card says so and tests with a built fixture (a search on 2026-11-01 found no sample file online). Not in this card: the storage-schema field loss, which waits for a real fixture (Post-v1.0).
- **PNG chunk choice** (new 2026-11-01, `required`, `src/io/png.ts`; expected file 056; verified 2026-11-01 on a real file and in the code, `docs/BUGS.md`, `docs/research/004-real-fixture-check.md`; runs right after the PNG extra assets card, which touches the same file):
   - When a PNG holds both a `ccv3` and a `chara` chunk, prefer `ccv3` (research 001, claim 5) instead of the longest payload; the longest or the one with a `character_book` decides only among chunks of the same keyword. Claude settles the exact rule when it writes the card and re-checks research 001, claim 5.
   - The duplicate warning names the chunks really found and the rule really used (today it prints the winner's keyword for every candidate and says "later occurrence").
   - Tests: a PNG with `chara` then `ccv3` and the reverse order, and one where the `chara` payload is longer. A real SillyTavern PNG stays out of the repo (licence question, `PROJECT_STATE.md`); the tests build their fixture.
   - This settles the old "PNG duplicate-chunk decision" (Next cards, item 7).
- **Lorebook position kept** (new 2026-11-01, `skip` unless it needs `src/schemas` or `src/io`; `src/utils/normalizeLorebook.ts`; expected file 057; verified 2026-11-01, `docs/BUGS.md`):
   - Keep a numeric SillyTavern `position` of a standalone lorebook entry instead of dropping it: in the entry's `extensions.position`, the place Seraphina's own embedded entries carry it, so the layer, the saved book and the JSON export hold it.
   - First re-check which numeric values SillyTavern maps to which placement and what a missing one does on re-import; the card states the mapping it relies on, or says it does not translate and only preserves.
   - Tests: a SillyTavern-style entry with a numeric position survives normalize and export.
- **051 Full rebrand** (`required`; expected file 058; owner added 2026-11-01, "rebranding everywhere", the last card of v1.0.0; Decision 35, "Everywhere means everywhere", widened it to the old-brand identifiers):
   - Every user-visible "CardCrucible" becomes "Roleplay Forge": the update toast in `usePWAUpdate.ts`, `ErrorBoundary` console and crash-report text, the backup file names (`cardcrucible_full_backup_*`; old backups under that name must still restore), the OpenRouter header placeholder in `ConnectionProfilesSection`, the `X-Title` header in `src/services/llmAdapter.ts`, and whatever else a fresh search of `src/`, `public/`, `index.html`, `package.json`, `metadata.json` and `README.md` finds. Claude lists the exact files from that search when it writes the card.
   - Also renamed (Decision 35): the IndexedDB name `CardCrucibleDB`, the passkey user id `cardcrucible_user` and the passkey display name "CardCrucible User". Renaming the database opens an empty one and a new passkey user id may no longer match an existing passkey, so the owner exports a backup (Settings, Export Backup) before the rebrand merges and restores it after. When Claude writes the card it first reads `src/utils/passkeyCrypto.ts`, checks whether `crypto_*` or the passkey flow depend on the old names, and whether a one-time copy from the old database is small enough to include. `Review: required` (`src/db`, passkey, crypto). Open owner question (2026-11-01, `PROJECT_STATE.md`): Claude recommended keeping only the visible rebrand in v1.0.0 and moving the database and passkey identifiers to a migration card, or at least to their own last card, so that they can be dropped without losing the visible rebrand.
   - Left alone: the brand-free frozen identifiers (`enc.v1.`, `app_theme`, `editor_history_<uuid>`, `assistant_chats`, `cost_tracker_usage`, `crypto_*`, `passkey_*`, `embeded://`), the MIT license text and copyright notice with the credit to the original CardCrucible project (the owner may overrule this one line), the host and project name `roleplayforge` (Decision 20) and the repository name.
   - Needs a Claude re-check that no test or smoke check depends on the old wording (`scripts/smoke.py` finds fields by visible text).

**Wire or delete (owner decisions, 2026-11-01):**
- Delete `topP` and `frequencyPenalty`: providers disagree and Anthropic has no frequency penalty; they need the sampler table first (Post-v1.0).
- Delete `customHeaders`: it holds secrets and nothing reads it.
- Delete `systemOverride`: a hidden prefix would break the Enhancer's JSON and make probes incomparable.
- Delete `contextLimit`: it needs history trimming, which does not exist.
- Wire temperature and maxTokens, narrowly (047): Chat currently hard-caps replies at 500 tokens whatever the profile says.
- Crucible: no AI judge in v1.0 (it costs money, is not repeatable, and is Phase 4). Keyword checks only, labelled as such.

**Post-v1.0 (parked 2026-11-01):**
- Priority 1 leftovers: phone chrome budget, status sheet, keyboard mode, full-screen editor, contrast and axe.
- Receipts (023) and fixtures are the v1.1 lead. Until then no "verified" wording anywhere.
- Linter 022, budget 024 and syntax ribbon 025.
- Per-field AI assist, "Sent to" on every screen, cost estimates.
- Test Lab upgrade, presets and the sampler table, Phases 2-5.
- Build stamp (commit SHA; the refresh button is the Update check card), Vercel ignore command, smoke test in CI.
- Raising the storage caps (with real-card fixtures) and keeping the person on a card after a failed save ("Stay or discard").
- Argon-verified bugs parked in `docs/BUGS.md` (2026-11-01): the storage schemas dropping unknown fields (needs a real fixture first), the cancelled unlock that still sends the request, no passkey enrollment after a recovery-key unlock, unwrapped paste wrappers, `createVariant` flush and name cap, and the tab-hide flush leaving `name`, `tags` and `creator` stale.
- Bugs parked in `docs/BUGS.md`: request cancel and timeouts, the latent fallback-profile notice, the Assistant seeing only part of the card, the four "smaller code issues", lorebook list paging, the Lorebook composer's record counts and labels (found by the 2026-11-01 real-fixture check), test gaps for `llmAdapter` and the converter, Node 20 end of life (cheap, its own `Review: required` card, not blocking), themed icon, restore "overwrite" mode (the UI never calls it), the scenario run that is shown as complete before it is saved, the update message that shows once per page load, and showing CI failures in the job summary (a CI change).

## Priority plan (set 2026-10-29)

**Goal:** a creator never loses a card, never silently breaks it, and can find and fix problems without paying for AI.

This order supersedes the phase order below where they differ. The phases keep the detailed checklists. Each item is one commit with `npm run lint && npm test && npm run build` passing. For v1.0.0 the cutline above comes first; the rest of this plan is Post-v1.0 unless the cutline names it.

| # | Priority | Detail lives in |
|---|---|---|
| 1 | Phone usability | Checklist below |
| 2 | Data safety | Phase 1 |
| 3 | Fixtures and conversion receipts | Phases 1-2 |
| 4 | Free tools: token view, card linter, lorebook activation simulator | Phase 5, pulled forward |
| 5 | Privacy-first AI assist | Phase 5 |
| 6 | Test Lab upgrade | Phase 4 |
| 7 | Presets, narrow first | Phase 3 |

### Priority 1 - Phone usability

- [x] Quick-wins batch except the 12px minimum text, which is done per screen (Tasks 001-007).
- [x] Reorder Details so writing fields come first (Tasks 013-015).
- [x] ContextBar, first part: one ContextBar replacing `WorkspaceSubNav` and `LabSubNav`, Undo/Redo and save chip on Forge tabs (Tasks 017-018). Still open: overflow menu, card switcher sheet.
- [ ] Phone chrome budget: one top bar (back, name, status chip, undo/redo), one tab strip, bottom nav, nothing else fixed. Save state is a small dot, not a bar.
- [ ] Status chip shows always-on tokens and issue count. Tapping it opens one Status sheet with the token breakdown and the issues.
- [ ] Keyboard-open mode: hide bottom nav and shrink the header so typing keeps most of the screen.
- [ ] Full-screen editor for long fields. No scroll boxes nested inside the page scroll.
- [ ] Contrast pass (light theme first), 44px targets, axe + mobile Playwright smoke test in CI.
- [x] D-13: flush pending autosave inside `selectCardForEditing`, with a store test (v1.0.0 card 044, PR #43, `f824ea2`).
- [ ] Routes: keep `#/forge`, `#/test`, `#/settings`. Add a `variants` sub-route. Any renamed section keeps its old route as an alias.
- [ ] Wording rules: worst-case lore is "could exceed", never "over limit". Empty optional fields are info-only and are not counted in the issue badge (the Personality part is v1.0.0 card 051).

### Priority 2 - Data safety

- [ ] Show whether persistent storage was granted, the "last backup" date, a reminder when it is old, and one-tap backup to a file. Persistent storage is already requested (`src/store/slices/sessionSlice.ts` calls `navigator.storage.persist()`); a code search at `e6fefc2` found no status display for it.

### Priority 3 - Fixtures and conversion receipts

- [ ] Phase 1 golden fixtures and fuzz tests (import -> edit -> export -> re-import).
- [ ] A receipt after every import and export: preserved, transformed, unsupported, dropped, each with field path and reason.
- [ ] Adapter status (`implemented`, `partial`, `verified`) with last-tested date, visible in the UI.
- [ ] No platform is called verified without fixtures. Receipts are the lead feature.

### Priority 4 - Free tools (no AI, new pure code in `src/core/`)

- [ ] One token function as the single source for every token number in the UI: always-on, max-triggered, per section. The breakdown must sum to the headline. Counts come from `gpt-tokenizer`, so label them as estimates.
- [ ] Card linter: offline rules with severity (error, warning, suggestion, info). Heuristic rules are suggestions, not errors.
- [ ] Lorebook activation simulator: paste text, see which entries fire and why. Verify SillyTavern matching rules against current docs or a test instance first. Label output "simulation, rules as of <date>".

### Priority 5 - Privacy-first AI assist

- [ ] Per-field assist button on each field label and one whole-card Assist in the header menu. No floating button over the text.
- [ ] Before every request, show "Sent to <provider>: <fields>". Local Ollama stays first-class.
- [ ] Each proposal shows token change and cost estimate. Per-field selection stays; per-hunk selection stays deferred.
- [ ] `Change`/`apply` for multi-step undo, only after Priority 3 tests exist. First use: AI patches and undo only. If a revisions store is added, it is additive and capped (about 20 per card).

### Priority 6 - Test Lab upgrade

- [ ] Saved scenario suites re-run against variants, with transcript evidence behind scores and visible evaluator uncertainty (see Phase 4).
- [ ] Show estimated cost before a suite runs.

### Priority 7 - Presets, narrow first

- [ ] Table of which sampling settings each provider supports, flagging non-portable ones.
- [ ] Preset export that never includes keys or connection secrets.
- [ ] SillyTavern prompt-manager presets wait until their semantics are verified.

### Next cards (ordered 2026-10-30; only the first is written)

Superseded for v1.0.0 by the cutline above: the items below are Post-v1.0 unless the cutline names them.

Source: `docs/research/001-st-spec-verification.md` and its cross-check section. Only items verified there or in code are listed. Each becomes a card when it is next to run.

1. **021** (carded): SillyTavern standalone lorebook import, plus a UTF-8 round-trip guard test.
2. **022 Linter additions:** invisible characters and curly quotes in lorebook keys (with one-tap fix); `{ { char } }` and single-brace `{user}`; 1-3 letter keys as a suggestion; empty Personality becomes info-only (Decision 8; now covered by v1.0.0 card 051). **Found 2026-10-30 on the Chub Helper card (`importCardData` plus `auditWritingQuality`, local run):** (a) the `replace_name_macro` autofix rewrote the preset name "Chub Helper Bot" to "{{char}} Bot"; the fix must not touch a name that is part of a longer proper name, or must show the change first; (b) `unmatched_brackets` counts a `[` inside backticks, so skip inline code and fenced code; (c) `wall_of_prose` fires on a structured markdown description; skip paragraphs that start with `#`, `-` or a digit and a dot. **Added 2026-11-01 (earlier Claude chat, read at `main` `0eeed96`, not re-read):** a rule for an enabled lorebook entry with no keys. The `<START>` check and the duplicate-sentence check already exist in `src/utils/writingLint.ts` (lines 197 and 256 at `0eeed96`), so they are not new. Not included until verified: `{{Char}}` letter case, negative-prompt "paradox", Author's-Note position mismatch, `#` / `[` stop sequences (research 001: not an ST default), the 2,000-token threshold.
3. **023 Conversion receipts (Priority 3):** preserved, transformed, unsupported, dropped, with field path and reason, after every import and export. `@@depth N` to `extensions.depth` and position 4 is our own lossy conversion (ST does not do it); log it, keep the original lines. CHARX to PNG lists every dropped asset by type. Read both `embeded://` and `embedded://`, write `embeded://`.
4. **024 Lorebook budget and size:** wording "low order drops first when the budget is hit, and it stops at the first overflow" (research 001, claim 2); duplicate-entry check; a warning when the sum of enabled entries exceeds `token_budget` (Chub Helper: 6 entries = 1922 tokens vs budget 1200, Details row still shows OK; the simulator showed 3 of 6 firing at 1007 tokens); entry list in pages of 25 only after measuring a 600-entry fixture. The sort direction itself is done (card 041, PR #40).
5. **025 Syntax ribbon:** a 44px bar above the keyboard with `{{char}}`, `{{user}}`, `<START>` and quotes, built together with keyboard-open mode (Priority 1). Needs a check of `visualViewport` behavior on Android Chrome first.
6. **Details accuracy (found 2026-10-30, local 393px run on the Chub Helper card):** (a) the token headline (1408) is 210 higher than the chips (1198): `EditorView.tsx` counts post-history and creator notes in the total but shows no chip for them; Decision 9 says the breakdown must sum to the headline. Done in v1.0.0 card 050 (`docs/tasks/050-details-total.md`, merged as PR #49, `742a950`): creator notes left the total and post-history got a chip. An earlier Claude chat confirmed at `main` `0eeed96` that the headline includes `creator_notes` and `post_history_instructions`, joined with no separators; Claude re-read `EditorView.tsx` at `0fa570c` on 2026-11-01 and the finding held; (b) a freshly imported, untouched card shows "Unsaved" and flips to "Saved" after one edit; probably closed by card 037 (PR #36, ContextBar), owner phone check passed 2026-11-01; (c) the "Creator / Author" label has no `htmlFor` and wraps no input, so it is not linked to its field; check the other Card Info fields and the Identity fields for the same (Post-v1.0).
7. **Decided 2026-11-01:** the PNG duplicate-chunk choice is now the v1.0.0 cutline card "PNG chunk choice" (expected file 056); the real-fixture check it waited for ran the same day (`docs/research/004-real-fixture-check.md`).

Parked: `@@` decorator down-conversion for V2 export (ST strips leading `@@` lines itself; other frontends unchecked); SHA-256 receipt signing (no user need).

### Small ideas, not carded (added 2026-11-01 from an Argon audit checked by an earlier Claude chat)

- **Build stamp:** Settings already shows the version and build time. Missing: the commit SHA and a refresh (update) button, so the owner can tell which build a phone is running. The refresh button is the v1.0.0 Update check card (label 050, file 054, written); the commit SHA stays Post-v1.0. Absence read in code by the earlier chat at `main` `0eeed96`, not re-read.
- **Vercel ignore command:** per Vercel's docs (read by the earlier chat), `VERCEL_GIT_PREVIOUS_SHA` is the SHA of the last successful deployment and is only set when an Ignored Build Step exists, which this repo has. Argon's claimed cause, a docs commit cancelling a code build, is unverified; `docs/BUGS.md` holds the canceled record seen for `bad5b0e`. A change here is deploy config, so a `Review: required` card, and only after the owner picks it.

### Working rules

- New pure logic goes in `src/core/`. Existing files are not moved.
- Large views (`LorebookView`, `GuideView`, `EditorView`, `cardSlice`) are split only when they are being edited anyway.
- Every adapter and simulator carries a last-tested date.
- Frozen (Decision 35): settings keys, the `enc.v1.` format and the other brand-free identifiers listed in `PROJECT_STATE.md` Guardrails. The three old-brand identifiers (`CardCrucibleDB`, `cardcrucible_user`, "CardCrucible User") are released for the Full rebrand card only.

### Not doing now

Marketplace, accounts, cloud sync, plugin system, CRDT sync, path-based routing, a folder reshuffle into `core/features/ports/adapters`, Clock/FileIO ports, a provider capability matrix beyond the sampler table.

## Phase 0 — Repository and product boundaries

- [x] Establish `KarlMuzen/RoleplayForge` as the canonical public GitHub repository.
- [x] Merge the initial repository upload into `main` (PR #1 was merged on 2026-10-28).
- [x] Document the unified-workbench direction and conservative platform-support boundary.
- [x] Add `npm run build` to CI and verify a passing production PWA build.
- [x] Implement the first Roleplay Forge visual/identity pass and update package/PWA metadata.
- [ ] Complete the wider screen-by-screen redesign and manually verify it on an installed Android PWA.
- [ ] Audit remaining legacy-facing wording and inherited project metadata while retaining MIT attribution (visible wording is the v1.0.0 Full rebrand card, label 051, expected file 058).

## Phase 1 — Trustworthy foundation

- [ ] Establish representative golden fixtures for cards, embedded lorebooks, standalone lorebooks, assets and extension fields.
- [ ] Test import → edit → export → re-import across PNG, JSON and CHARX; compare known fields and preserve unknown fields.
- [ ] Add property-based/fuzz tests for malformed or oversized inputs and user-facing error handling.
- [ ] Review backup/restore, encrypted API-key storage, migration behavior and local data-loss paths (restore safety is v1.0.0 card 042).
- [ ] Surface persistent-storage status and backup age (Priority 2); the request itself already exists in `sessionSlice.ts`.
- [ ] Put source dates beside pricing estimates and make stale/unknown rates visible.
- [ ] Add a release checklist covering tests, build, dependency audit, data migration and installed-PWA smoke tests.

**Exit criteria:** core fixture round trips pass; unsupported fields are preserved or reported; a clean install, build, test and lint pass; known data-loss risks are documented.

## Phase 2 — First verified platform adapters

- [ ] Define canonical, versioned internal models for character cards, lorebooks, assets and presets, including unknown-field retention.
- [ ] Document Character Card V2/V3 format behavior separately from platform-specific behavior.
- [ ] Create a SillyTavern-focused fixture set and validate each supported lorebook/preset field against current authoritative documentation or a test instance.
- [ ] Keep Chub import covered by fixtures and failure-path tests.
- [ ] Add conversion receipts describing preserved, transformed, unsupported and dropped fields (Priority 3).
- [ ] Add adapters only when schemas, fixtures and clear user need are available. RisuAI and other frontends are candidates, not current support promises.

**Exit criteria:** each verified adapter has a documented scope, sample fixtures, automated tests and a last-tested date.

## Phase 3 — Preset Workshop

- [ ] Define a canonical versioned preset schema separate from provider credentials.
- [ ] Import/export supported preset formats with explicit mapping and loss reports.
- [ ] Separate sampling parameters, context limits, prompt templates, provider/model settings and platform-only fields.
- [ ] Add editable preset profiles, comparison and version history.
- [ ] Prevent accidental export of API keys or connection secrets.
- [ ] Start narrow: sampler-support table and secret-free export first (Priority 7).

**Exit criteria:** presets can be round-tripped without leaking secrets, and cross-platform differences are visible before export.

## Phase 4 — Repeatable Testing Lab

- [ ] Save named scenario suites with expected traits and failure signals.
- [ ] Record card/lorebook/preset versions, provider/model, model revision where available, temperature, context size, sampling settings and date.
- [ ] Compare variants under identical scenarios and flag regressions.
- [ ] Keep transcript evidence behind scores and expose evaluator uncertainty.
- [ ] Add deterministic tests for evaluation rubrics and versioned benchmark fixtures.

**Exit criteria:** a saved run can be inspected and repeated with the same known inputs; score changes link to transcript evidence.

## Phase 5 — Specialist AI workflows

The non-AI parts of the Lorebook Designer (activation simulation) and the card linter are pulled forward to Priority 4.

- [ ] Support mode: source-grounded troubleshooting with dated citations and explicit uncertainty.
- [ ] Card Builder: structured field-by-field generation and user-reviewed patches.
- [ ] Lorebook Designer: trigger suggestions, recursion/overlap diagnostics and activation simulations.
- [ ] Preset Coach: explain compatible settings and flag non-portable parameters.
- [ ] Test Analyst: summarize runs, identify regressions and propose evidence-linked patches.

**Exit criteria:** every mode has tests for expected output, uncertainty behavior, common failure cases and regression prevention.

## Deferred until justified

- Cloud accounts, remote backups or shared libraries.
- Marketplace, community publishing or hosted chats.
- An independent Reviewer workflow if Test Analyst quality proves insufficient.
- Broad claims of universal platform compatibility.
