# Roadmap

This roadmap is dependency-ordered. Items remain planned until code, tests and compatibility evidence show they are complete.

## Priority plan (set 2026-10-29)

**Goal:** a creator never loses a card, never silently breaks it, and can find and fix problems without paying for AI.

This order supersedes the phase order below where they differ. The phases keep the detailed checklists. Each item is one commit with `npm run lint && npm test && npm run build` passing.

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
- [ ] D-13: flush pending autosave inside `selectCardForEditing`, with a store test.
- [ ] Routes: keep `#/forge`, `#/test`, `#/settings`. Add a `variants` sub-route. Any renamed section keeps its old route as an alias.
- [ ] Wording rules: worst-case lore is "could exceed", never "over limit". Empty optional fields are info-only and are not counted in the issue badge.

### Priority 2 - Data safety

- [ ] Check whether persistent storage is already requested; if not, request it (`navigator.storage.persist()`) and show the result in Settings.
- [ ] Show "last backup" date, a reminder when it is old, and one-tap backup to a file.

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

Source: `docs/research/001-st-spec-verification.md` and its cross-check section. Only items verified there or in code are listed. Each becomes a card when it is next to run.

1. **021** (carded): SillyTavern standalone lorebook import, plus a UTF-8 round-trip guard test.
2. **022 Linter additions:** invisible characters and curly quotes in lorebook keys (with one-tap fix); `{ { char } }` and single-brace `{user}`; 1-3 letter keys as a suggestion; empty Personality becomes info-only (Decision 8). **Found 2026-10-30 on the Chub Helper card (`importCardData` plus `auditWritingQuality`, local run):** (a) the `replace_name_macro` autofix rewrote the preset name "Chub Helper Bot" to "{{char}} Bot"; the fix must not touch a name that is part of a longer proper name, or must show the change first; (b) `unmatched_brackets` counts a `[` inside backticks, so skip inline code and fenced code; (c) `wall_of_prose` fires on a structured markdown description; skip paragraphs that start with `#`, `-` or a digit and a dot. **Added 2026-11-01 (earlier Claude chat, read at `main` `0eeed96`, not re-read):** a rule for an enabled lorebook entry with no keys. The `<START>` check and the duplicate-sentence check already exist in `src/utils/writingLint.ts` (lines 197 and 256 at `0eeed96`), so they are not new. Not included until verified: `{{Char}}` letter case, negative-prompt "paradox", Author's-Note position mismatch, `#` / `[` stop sequences (research 001: not an ST default), the 2,000-token threshold.
3. **023 Conversion receipts (Priority 3):** preserved, transformed, unsupported, dropped, with field path and reason, after every import and export. `@@depth N` to `extensions.depth` and position 4 is our own lossy conversion (ST does not do it); log it, keep the original lines. CHARX to PNG lists every dropped asset by type. Read both `embeded://` and `embedded://`, write `embeded://`.
4. **024 Lorebook budget and size:** wording "low order drops first when the budget is hit, and it stops at the first overflow" (research 001, claim 2); duplicate-entry check; a warning when the sum of enabled entries exceeds `token_budget` (Chub Helper: 6 entries = 1922 tokens vs budget 1200, Details row still shows OK; the simulator showed 3 of 6 firing at 1007 tokens); entry list in pages of 25 only after measuring a 600-entry fixture.
5. **025 Syntax ribbon:** a 44px bar above the keyboard with `{{char}}`, `{{user}}`, `<START>` and quotes, built together with keyboard-open mode (Priority 1). Needs a check of `visualViewport` behavior on Android Chrome first.
6. **Details accuracy (one small card, number when next to run; found 2026-10-30, local 393px run on the Chub Helper card):** (a) the token headline (1408) is 210 higher than the chips (1198): `EditorView.tsx` counts post-history and creator notes in the total but shows no chip for them; Decision 9 says the breakdown must sum to the headline, so add the chips or drop them from the total (first check whether creator notes are sent to the model; unverified). An earlier Claude chat confirmed at `main` `0eeed96` (not re-read) that the headline (around line 164) includes `creator_notes` and `post_history_instructions`, joined with no separators; whether creator notes are sent to the model is still unchecked; (b) a freshly imported, untouched card shows "Unsaved" and flips to "Saved" after one edit; cause not checked, read the save-status code first; (c) the "Creator / Author" label has no `htmlFor` and wraps no input, so it is not linked to its field; check the other Card Info fields and the Identity fields for the same.
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
- [ ] Review backup/restore, encrypted API-key storage, migration behavior and local data-loss paths.
- [ ] Request persistent storage and surface backup age (Priority 2).
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
