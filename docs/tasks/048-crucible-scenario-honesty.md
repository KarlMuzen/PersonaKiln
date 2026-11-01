# Task 048: Crucible scenario runs, honest failures and wording

Review: skip
Goal: A scenario run that fails is shown as failed, the scenario text and banners say what the run really is (a scripted conversation whose replies are scanned for keywords), and the report and badge consistency line come from that same scan instead of a score nothing writes.
Files to touch: `src/components/crucible/useCrucibleRun.ts`, `src/components/crucible/TranscriptViewer.tsx`, `src/components/crucible/DiagnosticScorePanel.tsx`, `src/components/crucible/ScenarioPicker.tsx`, `src/components/CrucibleView.tsx`, `src/utils/crucibleGrading.ts`, `src/utils/crucibleBadgeExporter.ts`, new `test/crucibleScenarioHonesty.test.tsx`.
Do not touch: `src/store`, `src/db`, `src/io`, `src/schemas`, `src/services`, `src/components/crucible/ScenarioAutoRunnerPanel.tsx`, `src/components/EnhancerView.tsx`, `src/utils/crucibleTiers.ts`, every existing test, every other file, `docs/` (except deleting this card in the last commit).
Decisions: none. Owner decision of 2026-11-01 (`docs/ROADMAP.md`, "Wire or delete"): no AI judge in v1.0, keyword checks only, labelled as such. This is part 2 of 2 of the "Crucible honesty" label; part 1 (file 047, PR #46) did the probes. Background: `docs/BUGS.md`, entry "Crucible: keyword grading limits remain, and scenario runs record no failures".

This is a batch card: three independent changes (A, B, C), each with its own "Done when". Do them in the order A, B, C. Eight files in all.

## What the code does today (read at `main` `877a449`)

- Run: `useCrucibleRun.ts`. The persona is fixed (`selectedPersona = 'scripted'`, line 28; `ScenarioAutoRunnerPanel.tsx` passes `"scripted"` too). A user turn is the script entry for that turn, else the text `*waits for you to continue*` (lines 161-169); nothing is AI-simulated. For each target profile a turn loop runs (171-196). A throw is caught at 190-195: `console.error`, an assistant message `[Simulation error on turn N: <message>]` is pushed to the history, the loop `break`s. The profile's result (198-206) is `{ transcript, timestamp }` and never has `error`, although the inline type (148-155) and `CrucibleScenario.lastRunResult` in `src/db/index.ts` (37-49) both allow `error?: string`. The scenario is saved through `updateActiveCardScenarios` (213-223). Stopping with the Stop button sets `stopSimRef` and the loop `break`s at line 172, so a stopped run is saved like a finished one.
- Show: `TranscriptViewer.tsx` 155-162: a result with `error` shows a red `Error: <error>` line; otherwise, with a transcript, a green `Simulation Complete (N messages logged)` and `renderPlainLanguageScoreSummary(res.scores, res.transcript, activeCardUuid || undefined)`. Its empty state (lines 108-111) says "Select a persona and turn count above, then click Run Scenario to launch a simulated conversation.", but no persona can be chosen. `ScenarioPicker.tsx` lines 73-76: heading "Automated Scenario & Tester Personas" and the text "Auto-run multi-turn conversations using AI simulated user personas to stress-test character consistency."
- Banners: `renderPlainLanguageScoreSummary` (`DiagnosticScorePanel.tsx` 85-204). No code in `src/` writes `scores`, so only its keyword branch (lines 108-127) ever fires: it first drops assistant messages of other speakers when a target card uuid is given (96-99), then tests each assistant message against `/\b(as an ai|language model|i am an ai|openai|claude|gemini|system prompt|i cannot fulfill|as a large language model)\b/i` (113-117). A hit sets the turn (the position of that reply among the assistant messages kept), the snippet and the reason "Assistant broke character and acknowledged AI constraints or system metadata." (line 123) and shows a red "Character Drift Occurred at Turn N" (line 184). No hit shows a green "No character drift detected across all turns." (line 199). So the green banner means only that none of those words appeared.
- Report: `CrucibleView.tsx` `trustReportData` (266-312). `driftString` is `No drift in ${n} turns` only when some result has `scores.driftOnsetTurn === null` (276-277), which never happens, else `Not tested / Drift detected` (290). The copied report (325-332) prints `**Character Consistency:** ${driftString}`. `crucibleBadgeExporter.ts` 174-180 draws the label `CHARACTER CONSISTENCY` and `report.driftString || 'Not tested / Drift detected'` through `wrapTextLines(..., 1)`, one line, width `detailW - 32` = 392 px (canvas width 740, `detailX` 280) at 13 px.
- Turn counting: `conversationEngine.ts` `executeConversationTurn` adds one `user` message per turn when the user text is not empty (lines 190-194), and the greetings from `buildInitialGreetingMessages` are assistant messages (the group branch at lines 126-139 was seen returning `role: 'assistant'`; Claude did not read the single-character return). So the number of `user` messages in a transcript is the number of turns completed.
- Readers of scenario `lastRunResult` in `src/`: `useCrucibleRun.ts`, `TranscriptViewer.tsx`, `CrucibleView.tsx`, `EnhancerView.tsx` (lists only runs that have `scores`, so it never lists one; logged in `docs/BUGS.md`, not touched here) and a prop type in `ScenarioAutoRunnerPanel.tsx` (lines 54-60).
- Tests: `test/CrucibleView.test.tsx` runs a scenario with a mocked adapter and checks the stored transcript (it clicks the button named "Run Scenario", which does not change). No test asserts any text this card changes: Claude's grep of `test` and `scripts` at `main` `877a449` found only `test/crucibleBadgeExporter.test.ts:92`, where "Not tested / Drift detected" is an input fixture, not an assertion.

## Changes

### A. A failed scenario run is saved and shown as failed (`useCrucibleRun.ts`)

1. In each profile's task add `let runError: string | undefined;`. In the catch at lines 190-195 keep the `console.error` and the `[Simulation error on turn N: ...]` message as they are and set `runError = \`Turn ${turn}: ${errMsg}\`` before the `break`.
2. At the result write (198-206) add `error` only when it is set: `...(runError ? { error: runError } : {})`. No `error` key on a run that did not fail. The inline type already has `error?: string`; do not change `src/db`.
3. Nothing else changes. `TranscriptViewer` already shows `res.error` as a red `Error: <error>` line; a run stopped by hand is still saved as before (known limit below).

Done when (A): a scenario whose adapter rejects is stored with an `error` that starts with `Turn 1: ` and contains the message, and the run history shows `Error: Turn 1: <message>` and no "Simulation Complete" for it; a scenario that succeeds has no `error` key.

### B. The wording says what the run is (`DiagnosticScorePanel.tsx`, `TranscriptViewer.tsx`, `ScenarioPicker.tsx`)

1. `DiagnosticScorePanel.tsx`: the green line becomes "No AI-disclaimer phrases found (keyword check)."; the red title becomes "AI-disclaimer phrase at turn {driftTurn} (keyword check)"; the reason string at line 123 becomes "A reply matched a keyword rule: an AI disclaimer, a model name or the system prompt." Nothing else in this file changes in B (the score chips, the snippet label and the probe runner stay).
2. `TranscriptViewer.tsx` empty state: the text becomes "Click Run Scenario to run a scripted conversation against this card." (keep the `<strong>` around "Run Scenario").
3. `ScenarioPicker.tsx`: the heading "Automated Scenario & Tester Personas" becomes "Scripted Scenario"; the paragraph becomes "Runs a scripted multi-turn conversation against the card. The replies are scanned for AI-disclaimer phrases (keyword check); no AI scores them." Nothing else in this file changes.
4. Visible text that changes in B: exactly the five strings above. Nothing else.

Done when (B): the new strings show and the old ones are gone from `src/`; the existing scenario tests still pass.

### C. One keyword scan for the banner, the report and the badge (`crucibleGrading.ts`, `DiagnosticScorePanel.tsx`, `CrucibleView.tsx`, `crucibleBadgeExporter.ts`)

1. `crucibleGrading.ts` (pure): move the regex above here as an exported `DISCLAIMER_PATTERN` and add `scanTranscriptForDisclaimers(transcript, targetCardUuid?)` returning `{ hitTurn: number | null; snippet: string | null; turns: number }`. The transcript items are `{ role: string; text: string; speakerUuid?: string; speakerName?: string }`. Same message filter as today (when `targetCardUuid` is given, drop assistant messages that have a `speakerUuid` different from it). `hitTurn` is the 1-based position of the first matching assistant message among the kept assistant messages (the same number as today's `assistantIndex`); `snippet` is its text; both are `null` when nothing matches. `turns` is the number of messages with `role === 'user'` in the whole transcript. The test is case-insensitive, as today.
2. `DiagnosticScorePanel.tsx`: the keyword branch (`driftTurn === null`, lines 108-127) calls the helper instead of its inline loop and gives the same turn and snippet as today. The `scores` code path stays.
3. `CrucibleView.tsx` `trustReportData`: replace the `maxTurnsNoDrift` loop. For each scenario and each profile result in `activeCardRecord.scenarios`: skip a result that has `error` or no `transcript`; scan the others with `activeCardUuid || undefined`; keep the smallest `hitTurn` over all scanned results, and for scanned results with no hit keep the largest `turns`. `driftString`: any hit gives `AI-disclaimer phrase at turn ${t} (keyword)`; else, when at least one result was scanned and the largest `turns` is above 0, `No AI-disclaimer phrases in ${n} turns (keyword)`; else `Not tested`. The `testedModels` code stays as it is. In the copied report `**Character Consistency:** ${driftString}` becomes `**AI-disclaimer scan:** ${driftString}`.
4. `crucibleBadgeExporter.ts`: the label `CHARACTER CONSISTENCY` becomes `AI-DISCLAIMER SCAN`; the fallback `'Not tested / Drift detected'` becomes `'Not tested'`. Nothing else (still one line; the longest string above is under 50 characters). The code comment above the label may be updated.

Done when (C): a clean finished run with 3 user turns gives `No AI-disclaimer phrases in 3 turns (keyword)`; a transcript with a keyword hit on the second assistant message gives `AI-disclaimer phrase at turn 2 (keyword)` in the copied report and the red banner shows turn 2; a run with `error`, or no scenario at all, gives `Not tested`; the banner and the report read the same scan.

## Tests

`test/crucibleScenarioHonesty.test.tsx` (jsdom; mock `../src/services/llmAdapter` with `sendLLMRequest` and `sendSingleLLMRequest` as `test/CrucibleView.test.tsx` does; same store and `db.cards` setup style; the run history is always visible, no click is needed to expand it). Write the tests first and report which fail on unmodified code: use a dynamic `import()` of `crucibleGrading` inside the unit tests (as card 047's test did) so the file still loads; the component tests must fail on their assertions.

- Unit, `scanTranscriptForDisclaimers`: a clean transcript with 3 user messages gives `{ hitTurn: null, snippet: null, turns: 3 }`; "As an AI language model, I cannot" in the second assistant message gives `hitTurn: 2` and that text as the snippet, also in upper case; with a `targetCardUuid`, a hit in another speaker's assistant message is ignored and a hit in the target's is found; an empty transcript gives `{ hitTurn: null, snippet: null, turns: 0 }`.
- Component, through the rendered `CrucibleView`:
  - (a) the adapter rejects, click "Run Scenario": the stored `lastRunResult['profile-1']` has an `error` that starts with `Turn 1: ` and contains the message; the screen shows `Error: Turn 1:`; "Simulation Complete" is absent.
  - (b) the adapter returns clean text: the stored result has no `error` key; the screen shows "Simulation Complete" and "No AI-disclaimer phrases found (keyword check).".
  - (c) a card seeded with a finished scenario whose second assistant message says "As an AI language model": the red "AI-disclaimer phrase at turn 2 (keyword check)" shows.
  - (d) the copied report: seed scenarios, mock `navigator.clipboard.writeText`, trigger `handleCopyReport` through its button (read `CrucibleView.tsx` for the button), and assert the text holds `**AI-disclaimer scan:** No AI-disclaimer phrases in 3 turns (keyword)` for a clean finished run, `AI-disclaimer phrase at turn 2 (keyword)` for the leaking one, `**AI-disclaimer scan:** Not tested` when the only run has `error`, and never "Character Consistency". If (d) cannot be made to work in jsdom after 2 attempts, stop and report; do not change `src` for the test.

Before editing, run `grep -rn "Character Drift Occurred\|No character drift\|Select a persona\|Tester Personas\|AI simulated\|Character Consistency\|CHARACTER CONSISTENCY\|Not tested / Drift" test scripts` and stop if anything other than `test/crucibleBadgeExporter.test.ts:92` (an input fixture) depends on text that changes. Then `grep -rn lastRunResult src` and list every reader in the PR description. Run the whole suite. If an existing test other than the new file fails, stop and report its name and the failure; do not edit it.

## Known limits, not fixed here

- A keyword scan cannot tell a leak from in-character text: a character named Claude or Gemini, or a first message that says "system prompt", counts as a hit (the greeting is assistant message 1 of every run).
- A run stopped with the Stop button is still saved and shown as "Simulation Complete" (`docs/BUGS.md`).
- A user turn is the script entry or `*waits for you to continue*`; there is no AI-simulated user.
- `testedModels` in the report still lists a profile whose scenario failed.
- The Enhancer still lists no scenario run, because nothing writes `scores` (`docs/BUGS.md`).
- Scenario temperature and max tokens (500 in `executeConversationTurn`) are the Test fidelity card's.

## Done when

- `npm ci && npm run lint && npm test && npm run build` pass locally and the PR description lists the real counts, which new tests failed before the change, the two `grep` results above and the reader list. `test-and-lint` is green. `Review: skip`: merge by hand after green CI.
- Only the eight listed files change, plus the card deleted in the last commit. Lint warnings do not rise above 45.
- Owner phone check (not a gate, Decision 17): Test, Crucible. The empty scenario area reads "Click Run Scenario to run a scripted conversation against this card." Run a scenario with a profile whose key is wrong: the history shows a red "Error: Turn 1: ..." line, not "Simulation Complete". Run one with a working profile: "Simulation Complete" plus either the green "No AI-disclaimer phrases found (keyword check)." or the red keyword line. Copy the report: it has an "AI-disclaimer scan" line and no "Character Consistency" line. The badge has an "AI-DISCLAIMER SCAN" row.

## Stop and report

A reader of scenario `lastRunResult` outside the listed files would show a failed run as finished; the work seems to need a change in `src/store`, `src/db`, `src/io`, `src/schemas` or `src/services`; a test or `scripts/smoke.py` depends on text that changes; an existing test other than the new file fails; the copied-report test (d) cannot be made to work after 2 attempts; a listed file grows past the card by 2 or more files; CI is red after 2 fix attempts.
