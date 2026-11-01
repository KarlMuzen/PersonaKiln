# Task 050: Details token total adds up

Review: skip
Goal: The token number at the top of the Details health panel equals the sum of the chips under it, so Decision 9 holds and the owner can check the number by hand.
Files to touch: `src/components/EditorView.tsx`; new `test/EditorView.test.tsx`
Do not touch: `src/utils/tokenizer.ts`, `src/utils/validation.ts`, `src/components/editor/*` (the section components), `src/components/ContextBar.tsx`, `src/store`, `src/io`, `src/db`, `src/schemas`, `scripts/smoke.py`, `package.json`. No new dependency. No frozen identifier.
Changes:

What the code does today (read by Claude at `main` `0fa570c`; search for the names, line numbers are not given). In `EditorView.tsx` the headline `totalTokens` is `exactTotalTokens`, a `countTokensAsync` of `fullPromptText`, which is the eight fields joined with no separator (description, first_mes, personality, scenario, system_prompt, post_history_instructions, mes_example, creator_notes). Until that count resolves it is `fallbackTotalTokens`, the sum of the eight per-field counts. The chips under it show Desc, Greeting, Personality and Scenario, plus System and Examples when above 0. So the headline holds post-history and creator notes and the chips do not, and the join adds a small gap of its own.

1. Make `totalTokens` the plain sum of seven per-field values that already exist in the file: `descTokens + greetingTokens + personalityTokens + scenarioTokens + systemPromptTokens + postHistoryTokens + mesExampleTokens`. Delete what this leaves unused: `creatorNotesTokens`; the `creatorNotes` slot of `asyncFieldTokens` (its type, the eighth `countTokensAsync` call, the destructured name, the `setAsyncFieldTokens` entry and `d?.creator_notes` in that effect's dependency list); `fallbackTotalTokens`; `exactTotalTokens` with its `useEffect`; `fullPromptText`; `effectiveExactTokens`. Keep `tokenPercentage`, `tokenBudgetLimit`, the colours and the "High static prompt size (N tokens)" warning with its 4096 threshold exactly as they are.
2. Add a chip `Post-history: {postHistoryTokens}`, shown only when `postHistoryTokens > 0`, with the same classes as the System and Examples chips, placed between them (System, Post-history, Examples).
3. Add `test/EditorView.test.tsx`. No test rendered `EditorView` before (code search at `0fa570c`), so this is its first render in a test.
   - Start with `// @vitest-environment jsdom` and `import '../test/setup';`, and set the store up as `test/ContextBar.test.tsx` does: `createNewDefaultCard`, then `useCardStore.setState` with `activeTab: 'editor'`, `activeCard`, `activeCardUuid`, `cards: []`, no active profile, empty undo and redo stacks, `saveState: 'idle'`, `saveTimeoutId: null`, and clear any `saveTimeoutId` in `afterEach`. With no active profile `countTokensAsync` takes the local gpt-tokenizer path and makes no network call (it calls a provider only for Anthropic or Google profiles that have a key, `src/utils/tokenizer.ts`).
   - Render `<EditorView />` and `await waitFor` for the async counts. The headline is the element with title "Estimated tokens" (text like `123/4096 tok`); the chips are the spans whose text is `Label: number`. The token panel sits in a closed `<details>`; its content is still in the DOM, so queries find it.
   - Test 1: with description, first message, personality, scenario, system prompt, post-history, example dialogue and creator notes all filled with different multi-sentence text, the headline number equals the sum of the numbers on the chips (Desc, Greeting, Personality, Scenario, System, Post-history, Examples). Compare numbers read from the screen with each other; never hard-code a token count.
   - Test 2: the "Post-history" chip is absent when post-history is empty, and present with a number above 0 when it has text.
   - If importing `EditorView` fails in jsdom, mock only the module that fails with `vi.mock` inside the test file and name it in the PR description. If that does not work after one try, stop and send one message.
   - Before steps 1 and 2, run the new tests once against the unmodified `EditorView.tsx` and say in the PR description which of them failed. Test 1 must fail there.

Left alone on purpose: lorebook entries and alternate greetings are in neither the headline nor the chips today, and stay that way. The Context Limit selector, the progress bar and the colours do not change.

What the owner will see: a card with long creator notes shows a lower headline than before, by about the tokens of those notes. Any card can show a headline a few tokens different from before, because a sum of fields is not the same as one count of the joined text. The 4096 warning and the "N alerts" count move with the headline.

Done when: `test-and-lint` green; the new tests pass and test 1 failed on the unmodified code; on any card the headline equals the sum of the visible chips; creator notes are in no total; a card with post-history text shows a "Post-history: N" chip.
Decisions: 9 (the breakdown sums to the headline; counts are estimates), 17 (an owner phone check never gates the merge).
