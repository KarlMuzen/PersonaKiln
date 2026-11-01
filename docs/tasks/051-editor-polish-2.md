# Task 051: Editor polish, part 2 (three small changes)

Review: skip
Goal: Three small fixes, each its own outcome: the export menu's placeholder is hidden from its list, "+ Saved Lorebook" opens on tap, and an empty Personality is a grey note instead of an alert.
Files to touch: `src/components/EditorView.tsx`, `src/components/LorebookView.tsx`, `src/utils/validation.ts`, `test/validation.test.ts`, `test/EditorView.test.tsx`
Do not touch: `src/components/ContextBar.tsx`, `test/ContextBar.test.tsx`, `src/utils/tokenizer.ts`, the section components in `src/components/editor/`, `src/store`, `src/io`, `src/db`, `src/schemas`, `scripts/smoke.py`, `package.json`. No new dependency. No frozen identifier.
Changes: read by Claude at `main` `742a950`; search for the names, line numbers are not given. The three changes are independent; do them in order A, B, C. Before changing code, run the new tests once against the unmodified code and say in the PR description which of them failed (A's test and C's tests must fail there; B's test too, if there is one).

**A. Hide the placeholder option of the export menu.**
- In `EditorView.tsx`, the select labelled "Export card as" has a first option `<option value="" disabled>` with the text "Export Card As...". Add the `hidden` attribute to it (keep `disabled`). Nothing else changes.
- `scripts/smoke.py` finds that select by its label "Export card as" and picks `json` (read by Claude), so the smoke check is unaffected.
- Test, in `test/EditorView.test.tsx` (it already renders `EditorView`; reuse its `setupCard`): the element with the text "Export Card As..." has the `hidden` attribute.
- Done when: the placeholder option has `hidden`, the other four options are unchanged, and the test passes.

**B. "+ Saved Lorebook" opens on tap.**
- In `LorebookView.tsx`, when `dbLorebooks.length > 0` a `<div className="relative group">` holds the "+ Saved Lorebook" button and a panel with the classes `absolute right-0 top-full mt-1 hidden group-hover:block ...` that lists the saved lorebooks, one button each. A phone has no hover, so the list is hard to open.
- Replace the hover with a local open state (`useState`): the button toggles it and gets `aria-expanded`; the panel shows only while open; remove `group-hover:block` (the menu then opens by tap or click only, on desktop too). The panel closes after a lorebook is picked, on a tap outside the wrapper (a `pointerdown` listener on `document`, as `ContextBar.tsx` does for its checklist) and on Escape. What picking a lorebook does stays exactly as it is today: do not change that handler. Keep the existing classes and look.
- `LorebookView` is a large view; do not split it.
- Test: no test touches `LorebookView` today (code search). Add one in a new `test/LorebookView.test.tsx` only if the view renders in jsdom with the store set up as `test/EditorView.test.tsx` does and at most one `vi.mock`: with saved lorebooks in the store, the list is absent, a tap on "+ Saved Lorebook" shows it, and Escape or a pick hides it. If it cannot be done that cheaply, add no test and say so in the PR description. If you add the test file, it is a sixth file, which this card allows.
- Done when: tapping the button opens the list, picking one closes it and does what it did before, an outside tap or Escape closes it, hover alone no longer opens it.

**C. "Personality is missing" becomes an info note (Decision 8).**
- In `src/utils/validation.ts`, `validateCardCompleteness` stops adding `'Personality is missing.'`. It still returns the Name, Description and First Greeting warnings, in the same order, with the same texts.
- Add an exported `getCardInfoNotes(card: CharacterCardV3 | null): string[]`. For a card whose personality is empty after trim, and which has no `extensions.chub` (the same Chub rule as today, with its comment moved here), it returns `['Personality is empty. It is optional; many cards put it in Description.']`. Otherwise, and for `null`, it returns `[]`.
- In `EditorView.tsx`, compute the notes from `activeCard` and show each as one muted line (not amber) in the health panel: under the amber alerts box when there are alerts, and under the green "Card Health Check Passed" box when there are none. The notes are not added to `warnings`, so the "N alerts" pill and the OK pill ignore them.
- `ContextBar.tsx` is not touched. It reads only `validateCardCompleteness`, so for a card whose only gap is Personality its amber checklist button and the amber icon on the Details tab go away. `EditorView` and `ContextBar` are the only two callers of `validateCardCompleteness` (code search at `742a950`).
- Tests. `test/validation.test.ts`: the test "warns when personality is missing on a non-Chub card" now expects `[]` from `validateCardCompleteness` for that card (it is otherwise complete). Add tests for `getCardInfoNotes`: a non-Chub card with empty personality returns the one note; whitespace-only personality too; a Chub card returns `[]`; a filled personality returns `[]`; `null` returns `[]`. `test/EditorView.test.tsx`: a card with name, description and first message filled and personality empty shows the OK pill, no "alerts" pill, and the note text; the same card with the description also emptied shows "1 alerts" (the real gap only) and still shows the note. `test/ContextBar.test.tsx` needs no change (its card has an empty description and greeting too, and it takes its counts from `validateCardCompleteness`); if it fails, stop and report.
- Done when: a card whose only gap is Personality has no alert anywhere and one grey note in the Details health panel; a card with a real gap still shows it; the tests above pass.

What the owner will see: A, the greyed "Export Card As..." line no longer appears in the open list. B, on the phone, tapping "+ Saved Lorebook" opens the list. C, a card that lacks only a Personality loses the amber triangle in the top bar and the amber icon on the Details tab, and the Details pill reads OK, with a grey line in the health panel saying Personality is empty and optional.

Done when (all): `test-and-lint` green; A, B and C each meet their own Done when; the PR description lists which new tests failed on the unmodified code.
Decisions: 8 (empty optional fields are info-only and not counted in the issue badge), 17 (an owner phone check never gates the merge).
