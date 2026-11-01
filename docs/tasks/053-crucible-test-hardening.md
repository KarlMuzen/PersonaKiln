# Task 053: Crucible scenario tests wait for the database write

Review: skip
Goal: the two Crucible scenario tests that read the saved card from the database stop failing at random, because they wait for the write instead of assuming it is already done.
Files to touch: `test/crucibleScenarioHonesty.test.tsx` (the only file).
Do not touch: everything else, including all of `src/`. If the fix seems to need a `src/` change, stop and send one message.
Changes:

Cause (read by Claude at `main` `4131073`; the card rests on it, so check it first):
- `handleRunSimulation` (`src/components/crucible/useCrucibleRun.ts`) ends with `updateActiveCardScenarios([...])` and does not await it.
- That store action (`src/store/slices/cardSlice.ts`) first puts the new scenarios into the store with `set` (this is what makes the screen show "Simulation Complete" or the red Error line) and only then awaits two Dexie calls: `db.cards.where('uuid').equals(...).first()` and `db.cards.update(...)`.
- In test (a) "a rejected adapter stores an error and shows it..." and test (b) "a clean run stores no error and shows the new green banner", the line `const scenarios = await savedScenarios('test-uuid')` runs right after the screen assertion, so it can read the record before the write has landed.
- CI on PR #51 (run 41318969715) failed exactly there: test (b), `AssertionError: expected undefined to be false` at line 204 (`expect(result && 'error' in result).toBe(false)`, `result` was undefined). A re-run on the same head was green. Test (a) reads the record the same way and is the other likely flake (inferred, not shown to fail).

Steps:
1. Prove the race first. In tests (a) and (b) only, make `db.cards.update` slow: spy on it, wait about 50 ms, then call the real method (bound to `db.cards`), and restore the spy at the end of each test (a `try/finally` is fine). With the delay in place and the assertions unchanged, both tests must fail. Paste that result in the PR description. If they do not fail, stop and send one message: the cause above is wrong.
2. Fix: add one small helper in the test file that waits (with `waitFor`) until the saved scenarios hold a `lastRunResult['profile-1']`, then returns it; use it in (a) and (b) in place of the direct `savedScenarios` read followed by the assertion. Keep every assertion's content and every test name. Keep the delay spy from step 1 in (a) and (b), so the two tests keep exercising the race.
3. Leave tests (c) and (d) and the other helpers alone: they seed the record directly and do not race.
4. Not in this card: awaiting the call in `handleRunSimulation` (a `src/` change; it is logged in `docs/BUGS.md`).

Done when: CI green; with the delay in place the old assertions failed (step 1, reported) and the new ones pass; `npx vitest run test/crucibleScenarioHonesty.test.tsx` passes 20 times in a row; the full suite still passes with the same count as before the card (383 tests per PR #51); the PR's file list is this file plus the card deletion.
Decisions: none.
