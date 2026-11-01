# Task 049: Test fidelity

Review: skip
Goal: The test chat, the scenario runs and the probes behave like the card would in real use and fail loudly: the profile's temperature and max tokens are used, `mes_example` is sent, and a provider error is never returned as a reply.
Batch card: three independent changes (A, B, C), each with its own "Done when".
Files to touch:
- `src/services/conversationEngine.ts`
- `src/services/llmAdapter.ts`
- `src/components/crucible/DiagnosticScorePanel.tsx`
- `src/components/settings/ConnectionProfilesSection.tsx` (two hint lines only, see A)
- `test/testFidelity.test.ts` (new; one file for A, B and C)
- One existing test file only if it asserts a string or a prompt line this card changes; name it in the PR description.
Do not touch: `src/store`, `src/db`, `src/io`, `src/schemas`; `src/components/ChatPreviewModal.tsx` and `src/components/crucible/useCrucibleRun.ts` (the engine resolves the values, so neither caller changes); `src/components/AssistantView.tsx` (Forge Assist keeps its own prompt and values, parked in `docs/BUGS.md`); the `X-Title: 'CardCrucible'` header and every other "CardCrucible" string (the rebrand card owns them); `package.json`, CI, deploy config, `docs/`.
Decisions: none new. Relies on the owner's 2026-11-01 calls in `docs/ROADMAP.md` ("Wire or delete": wire temperature and maxTokens narrowly; the 047 Test fidelity entry: send `mes_example`, a stream `error` throws) and on Decision 33 (Muse is the default executor).

Claude re-read at `main` `f259e55`: `conversationEngine.ts`, `llmAdapter.ts`, `DiagnosticScorePanel.tsx` (the probe runner `executeCrucibleVectorsOnCard`), `useCrucibleRun.ts`, `ChatPreviewModal.tsx` and `ConnectionProfilesSection.tsx`. Line numbers below are not given on purpose; find each place by the names.

## Change A: the profile's temperature and max tokens reach Chat Preview and scenario runs

Today: `executeConversationTurn` takes `temperature = 0.7` and `maxTokens = 500` as destructuring defaults. Chat Preview (`generateConversationTurn` in `ChatPreviewModal.tsx`) and scenario runs (`handleRunSimulation` in `useCrucibleRun.ts`) pass neither. Settings always saves both on a profile (`temperature ?? 0.7`, `maxTokens ?? 2048`) and no code reads them back. The probe runner sends a fixed 0.7 and 150.

Changes:
1. In `executeConversationTurn` only, resolve the two values as: the option if the caller passed one, else the profile's value if it is usable, else the fallback. Usable means a finite number, and for max tokens also greater than 0 (round it to a whole number). Fallbacks: temperature 0.7, max tokens 2048 (2048 is what Settings already shows for a profile without a value, so the screen and the code agree). Callers do not change.
2. The probe runner keeps its fixed 0.7 and 150 and does not read the profile, so Compare Models and probe results stay comparable. `sendSingleLLMRequest`'s own defaults stay as they are.
3. In `ConnectionProfilesSection.tsx` change only these two hint paragraphs, same element and classes:
   - Temperature hint: keep "Lower values (0.2) produce factual, predictable text; higher values (1.2) increase creativity." and add " Used by Chat Preview and scenario runs; probes and other tools use their own fixed values."
   - Max Output Tokens hint: replace "Maximum response length per message turn." with "Maximum reply length in Chat Preview and scenario runs; probes and other tools use their own limits."
   - Before editing, search `test/` and `scripts/smoke.py` for the old hint strings (the smoke test finds fields by visible text). If a test asserts an old string, change that assertion only. Labels, inputs and every other line of the file stay.

Done when A: a profile with temperature 0.3 and max tokens 900 makes the request of a Chat Preview turn and of a scenario turn carry 0.3 and 900; a profile with neither carries 0.7 and 2048; a value passed explicitly to `executeConversationTurn` still wins; a probe request still carries 0.7 and 150 whatever the profile says. The test covers all four and the first two fail on unmodified code. What the owner can see: replies in Chat Preview can now be longer than before (the cap was 500 whatever the profile said; profiles saved through Settings carry 2048 unless changed).

## Change B: `mes_example` is sent in the test prompt

Today: the system prompt of `buildSystemPrompt` (Chat Preview and scenario runs) is, in order: `system_prompt`, "Description: ...", "Personality: ...", "Scenario: ...", the lorebook text, the relationships text, the group note, `post_history_instructions`. The probe runner builds the same list without the relationships and the group note. `mes_example` is in neither.

Design, from SillyTavern's docs: `<START>` is a separator marker and never prompt text (SillyTavern replaces it with its own separator); example dialogue sits after the card's main text and before the chat history; `{{char}}` and `{{user}}` are resolved. Our engine sends one system prompt, so the examples go inside it.

Changes:
1. In `conversationEngine.ts` add and export a pure function `buildExampleDialogueBlock(mesExample?: string): string`. Split the text on `<START>` (case-insensitive), trim each piece, drop empty pieces. No piece left: return an empty string. Otherwise return the line `Example dialogue (shows how the character speaks; these events are not part of this chat):`, then each piece preceded by the line `[Example]`, with one blank line between pieces. The literal `<START>` never appears in the result. The function does not resolve macros.
2. Engine: put the block after the lorebook entry and before the relationships text. The whole prompt already goes through `resolveMacros`, so the names in the examples resolve there. In a group scene each character gets its own `mes_example`.
3. Probe runner (`DiagnosticScorePanel.tsx`): import the function from `../../services/conversationEngine` and put the block after the lorebook entry and before `post_history_instructions`. The existing `resolveMacros` call covers it. If the import creates a cycle or a build error, stop and report (it should not: the engine imports `llmAdapter` and utils only).
4. No trimming and no budget logic (the app has no history trimming). No change to token counters, the Details totals or any screen text.

Done when B: for a card whose `mes_example` is `<START>\n{{user}}: Hi\n{{char}}: *waves*\n<START>\n{{user}}: Bye\n{{char}}: Later.` the system prompt of the engine and of the probe runner contains both blocks with the names resolved, no `<START>`, after Scenario and the lorebook text and before `post_history_instructions`; for an empty or whitespace-only `mes_example` both prompts are exactly what they are today. Tests cover both cases and the function on its own (one block, two blocks, empty, mixed-case `<start>`). The first case fails on unmodified code.

## Change C: a provider error is never returned as a reply

Today: both stream loops in `sendSingleLLMRequest` (OpenAI-style and Anthropic) parse each `data:` line inside `try { JSON.parse(...) } catch {}` and read only content and usage, so an error event is skipped and the loop returns the text so far as a success. The tail-buffer parse after each loop has the same shape. The non-streamed OpenAI-style path reads `data.choices?.[0]?.message?.content || ''`, so a 200 reply that carries an error body becomes an empty reply. Nothing in `src/` passes `onChunk` today (Muse `facts:` report, 2026-11-01), so the stream part protects code no screen runs yet; the non-streamed part is the path the app uses.

Error shapes (not verified against the providers' own pages; the sources were gateway docs and a blog quoting Anthropic's docs for the first, one blog for the second). The tests use them as fixtures and claim nothing more:
- Anthropic stream: a `data:` line like `{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}`; the HTTP status stays 200 and the stream ends there.
- OpenAI-style stream (OpenRouter): a chunk with a top-level `error` (an object with a `message`, or a string), or `choices[0].finish_reason` equal to `"error"`.

Changes, in `sendSingleLLMRequest` only:
1. OpenAI-style stream loop and its tail-buffer parse: parse first (`let json; try { json = JSON.parse(...) } catch { /* skip the line */ }`), and run the error check after and outside that try/catch. A `throw` written inside the existing `try` would be swallowed by the `catch {}`. If `json.error` is set, or `finish_reason` is `"error"`: cancel the reader (`reader.cancel()`, ignore a failure of the cancel itself) and throw `new Error('LLM stream error: <message>')`.
2. Anthropic stream loop and its tail-buffer parse: same shape; the check is `json.type === 'error'`; the message is `json.error.message`, with `json.error.type` in front when present.
3. Non-streamed OpenAI-style reply: if the parsed body has `error` set, throw `new Error('LLM provider returned an error: <message>')` before reading `choices`. Non-streamed Anthropic reply: same when `data.type === 'error'`.
4. The message goes through the same API-key scrubbing as the other error paths in the file (the key becomes `***HIDDEN_KEY***`). With no message to be found, use "no message" instead of dumping the body.
5. A failed call does not reach `recordLLMResponseUsage` (no tokens recorded) and the partial text is dropped. The Gemini path and the HTTP-status errors are unchanged. `sendLLMRequest` already treats any throw as a failed profile and tries the next one; unchanged.
6. No caller changes; do not add an `onChunk` caller.

Done when C: tests with a mocked `fetch` and a mocked key lookup (the adapter imports `useCardStore` and `useTokenTracker`; follow how existing tests in `test/` mock them, search for `llmAdapter`): an OpenAI-style stream with two content chunks then an error chunk rejects instead of resolving with the partial text; the same with the error as the last line and no trailing newline; the same for `finish_reason: "error"`; an Anthropic stream with a `type: "error"` line after content rejects; a non-streamed 200 reply `{"error":{"message":"x"}}` rejects with "x" in the message, and so does a non-streamed Anthropic `{"type":"error",...}`; a normal stream and a normal non-streamed reply still resolve with the full text and unchanged token handling; the API key never appears in any of the thrown messages. The error tests fail on unmodified code.

## Done when (whole card)

CI green (`test-and-lint`). Run `npm ci && npm run lint && npm test && npm run build` on the branch and report real results under `Checks run`; the PR description names each change A, B, C with its test. If a change would need a file outside the list, stop and send one message. The card is deleted in the last commit.
