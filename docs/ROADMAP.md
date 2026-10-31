# Roadmap

This roadmap is dependency-ordered. Items remain planned until code, tests and compatibility evidence show they are complete.

## v1.0.0 cutline (owner said yes 2026-11-01)

Eight cards, then a tag. The tag comes after the owner's phone pass on 042-049, one smoke run (`scripts/smoke.py`) and a final `sync`. This cutline comes before the priority plan below; everything not named here is Post-v1.0 (list at the end of this section). A card is written only when it is next to run, one at a time. The findings behind 043-049 come from an earlier Claude chat (read at `main` `e6fefc2`); Claude re-checks each one in the code when it writes that card, so treat them as unverified until the card says otherwise. Card 042 was re-read in the code on 2026-11-01 (`docs/BUGS.md`).

1. **042 Restore safety** (`Review: required`, `src/io`; card written, `docs/tasks/042-restore-safety.md`):
   - Cards and lorebooks keep the newer side by date. The lorebook restore has the same rollback as cards.
   - A winning backup copy also brings `testSuites`, `scenarios`, `variantOf`, `variantLabel` and `avatarUrl`.
   - A local API key is never erased (a keyless backup merged onto an existing profile writes `apiKey: undefined`; the card starts with a test).
   - Merge mode no longer overwrites local settings (assistant chats, undo history).
   - The result dialog counts what was kept, skipped for no uuid, or failed.
2. **043 Profile cleanup and key privacy** (`required`):
   - Remove `topP`, `frequencyPenalty` and `customHeaders` (owner decision), and also `systemOverride` and `contextLimit`, which only the form, the type and the backup code touch (code search at `e6fefc2`; not a full read of `src/`).
   - Scrub values already stored, and build exports from an allowlist: removing the fields from the form alone leaves old headers in the database and in backups.
   - Old backups must still restore.
3. **044 Autosave flush, D-13** (`required`, `src/store`): its own card, because it is data loss and should not ride with UI polish.
4. **045 Save never fails silently** (`required`, investigate first): a test with oversized extensions. Import or "Save failed" must name the field. It may shrink to one test and one message.
5. **046 Crucible honesty** (`skip`):
   - One grader for Run All and Variant Compare (today they differ, and Compare ignores custom vectors).
   - Grade only `system_hijack` and `ooc_hijack`; the other vectors show the reply as "not auto-graded" and stay out of the score.
   - Scenario runs never write scores (no code in `src/` does), so the report always says "Not tested / Drift detected", and an errored run shows green "Simulation Complete" and "No character drift detected". Show failed runs as failed.
   - Reword the green banner to "no AI-disclaimer phrases found (keyword check)", change "Survived x/y" to "Leak checks passed x/y (keyword)", drop the stale "Select a persona" copy.
6. **047 Test fidelity** (`skip`):
   - Profile temperature and maxTokens become defaults for Chat Preview and scenario runs only; probes keep fixed values so Compare Models stays fair.
   - A stream `error` event throws instead of returning partial text as a result.
   - Send `mes_example` in the test prompt (never sent today). Owner confirmed on 2026-11-01 that Decisions 1-33 do not exclude it (Claude read `docs/DECISIONS.md` 1-33 on 2026-11-01 and found no exclusion).
7. **048 Editor polish** (`skip`):
   - Details headline: drop `creator_notes` from the total (owner confirmed on 2026-11-01 that in CCv2/CCv3 it is human-facing creator commentary, never prompt text; Claude checks the spec text when it writes the card) and add a chip for `post_history_instructions`. Decision 9 holds: the breakdown sums to the headline.
   - Add `hidden` to the "Export Card As..." option, make "+ Saved Lorebook" open on tap, make "Personality is missing" info-only (Decision 8).
8. **049 Honest copy** (`skip`):
   - The Export Verify modal says "zero data loss" and "safely import across SillyTavern" and nothing is tested on a real SillyTavern file: reword. No "verified" wording anywhere until fixtures exist.
   - Replace the CardCrucible leftovers (backup file name, error text, OpenRouter placeholder, `X-Title`) but leave the frozen passkey strings alone.
   - Add a "Sent to <profile>" line on the Enhancer (Decision 7).

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
- PNG duplicate-chunk decision, numeric SillyTavern `position`, build stamp, Vercel ignore command, smoke test in CI.
- Bugs parked in `docs/BUGS.md`: request cancel and timeouts, the latent fallback-profile notice, the Assistant seeing only part of the card, the four "smaller code issues", lorebook list paging, test gaps for `llmAdapter` and the converter, Node 20 end of life (cheap, its own `Review: required` card, not blocking), themed icon, passkey branding, restore "overwrite" mode (the UI never calls it).

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
- [ ] D-13: flush pending autosave inside `selectCardForEditing`, with a store test (v1.0.0 card 044).
- [ ] Routes: keep `#/forge`, `#/test`, `#/settings`. Add a `variants` sub-route. Any renamed section keeps its old route as an alias.
- [ ] Wording rules: worst-case lore is "could exceed", never "over limit". Empty optional fields are info-only and are not counted in the issue badge.

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
2. **022 Linter additions:** invisible characters and curly quotes in lorebook keys (with one-tap fix); `{ { char } }` and single-brace `{user}`; 1-3 letter keys as a suggestion; empty Personality becomes info-only (Decision 8). **Found 2026-10-30 on the Chub Helper card (`importCardData` plus `auditWritingQuality`, local run):** (a) the `replace_name_macro` autofix rewrote the preset name "Chub Helper Bot" to "{{char}} Bot"; the fix must not touch a name that is part of a longer proper name, or must show the change first; (b) `unmatched_brackets` counts a `[` inside backticks, so skip inline code and fenced code; (c) `wall_of_prose` fires on a structured markdown description; skip paragraphs that start with `#`, `-` or a digit and a dot. **Added 2026-11-01 (earlier Claude chat, read at `main` `0eeed96`, not re-read):** a rule for an enabled lorebook entry with no keys. The `<START>` check and the duplicate-sentence check already exist in `src/utils/writingLint.ts` (lines 197 and 256 at `0eeed96`), so they are not new. Not included until verified: `{{Char}}` letter case, negative-prompt "paradox", Author's-Note position mismatch, `#` / `[` stop sequences (research 001: not an ST default), the 2,000-token threshold.
3. **023 Conversion receipts (Priority 3):** preserved, transformed, unsupported, dropped, with field path and reason, after every import and export. `@@depth N` to `extensions.depth` and position 4 is our own lossy conversion (ST does not do it); log it, keep the original lines. CHARX to PNG lists every dropped asset by type. Read both `embeded://` and `embedded://`, write `embeded://`.
4. **024 Lorebook budget and size:** wording "low order drops first when the budget is hit, and it stops at the first overflow" (research 001, claim 2); duplicate-entry check; a warning when the sum of enabled entries exceeds `token_budget` (Chub Helper: 6 entries = 1922 tokens vs budget 1200, Details row still shows OK; the simulator showed 3 of 6 firing at 1007 tokens); entry list in pages of 25 only after measuring a 600-entry fixture. The sort direction itself is done (card 041, PR #40).
5. **025 Syntax ribbon:** a 44px bar above the keyboard with `{{char}}`, `{{user}}`, `<START>` and quotes, built together with keyboard-open mode (Priority 1). Needs a check of `visualViewport` behavior on Android Chrome first.
6. **Details accuracy (found 2026-10-30, local 393px run on the Chub Helper card):** (a) the token headline (1408) is 210 higher than the chips (1198): `EditorView.tsx` counts post-history and creator notes in the total but shows no chip for them; Decision 9 says the breakdown must sum to the headline. Covered by v1.0.0 card 048: creator notes leave the total and post-history gets a chip. An earlier Claude chat confirmed at `main` `0eeed96` (not re-read) that the headline (around line 164) includes `creator_notes` and `post_history_instructions`, joined with no separators; (b) a freshly imported, untouched card shows "Unsaved" and flips to "Saved" after one edit; probably closed by card 037 (PR #36, ContextBar), owner phone check pending; (c) the "Creator / Author" label has no `htmlFor` and wraps no input, so it is not linked to its field; check the other Card Info fields and the Identity fields for the same (Post-v1.0).
7. **Open decision (owner needed):** PNG duplicate-chunk choice, see `PROJECT_STATE.md` risks. Needs real exported fixtures first (research 001, open item 1).

Parked: `@@` decorator down-conversion for V2 export (ST strips leading `@@` lines itself; other frontends unchecked); SHA-256 receipt signing (no user need).

### Small ideas, not carded (added 2026-11-01 from an Argon audit checked by an earlier Claude chat)

- **Build stamp:** Settings already shows the version and build time. Missing: the commit SHA and a refresh (update) button, so the owner can tell which build a phone is running. Absence read in code by the earlier chat at `main` `0eeed96`, not re-read.
- **Vercel ignore command:** per Vercel's docs (read by the earlier chat), `VERCEL_GIT_PREVIOUS_SHA` is the SHA of the last successful deployment and is only set when an Ignored Build Step exists, which this repo has. Argon's claimed cause, a docs commit cancelling a code build, is unverified; `docs/BUGS.md` holds the canceled record seen for `bad5b0e`. A change here is deploy config, so a `Review: required` card, and only after the owner picks it.

### Working rules

- New pure logic goes in `src/core/`. Existing files are not moved.
- Large views (`LorebookView`, `GuideView`, `EditorView`, `cardSlice`) are split only when they are being edited anyway.
- Every adapter and simulator carries a last-tested date.
- Frozen: DB name `CardCrucibleDB`, settings keys, `enc.v1.` format, passkey and sync identifiers.

### Not doing now

Marketplace, accounts, cloud sync, plugin system, CRDT sync, path-based routing, a folder reshuffle into `core/features/ports/adapters`, Clock/FileIO ports, a provider capability matrix beyond the sampler table.

## Phase 0 — Repository and product boundaries

- [x] Establish `KarlMuzen/RoleplayForge` as the canonical public GitHub repository.
- [x] Merge the initial repository upload into `main` (PR #1 was merged on 2026-10-28).
- [x] Document the unified-workbench direction and conservative platform-support boundary.
- [x] Add `npm run build` to CI and verify a passing production PWA build.
- [x] Implement the first Roleplay Forge visual/identity pass and update package/PWA metadata.
- [ ] Complete the wider screen-by-screen redesign and manually verify it on an installed Android PWA.
- [ ] Audit remaining legacy-facing wording and inherited project metadata while retaining MIT attribution.

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
