# Task 058: Full rebrand

Review: required
Goal: The old name CardCrucible is gone from the app, its code and its tests, and the database name, passkey labels and two crypto labels that carried it now carry the Roleplay Forge name. One outcome, about 15 files, all of them text or label changes.
Files to touch:
- `src/db/index.ts`
- `src/utils/passkeyCrypto.ts`
- `src/utils/crypto.ts`
- `src/hooks/usePWAUpdate.ts`
- `src/components/ErrorBoundary.tsx`
- `src/components/settings/BackupRestoreSection.tsx`
- `src/services/llmAdapter.ts`
- `src/utils/visualCardExporter.ts`
- `src/utils/crucibleBadgeExporter.ts`
- `src/utils/binaryEncoding.ts`
- `src/components/settings/ConnectionProfilesSection.tsx`, only if step 1 finds the old name there (`docs/BUGS.md` lists an OpenRouter header placeholder in it; Claude's code search at `d9fdc91` did not find it)
- `test/persistenceInvariants.test.ts`
- `test/profileCleanup.test.ts`
- `test/binaryEncoding.test.ts`
- `test/rebrand.test.ts` (new)

Do not touch:
- `src/io/backup.ts` and the restore logic, `src/store/` (`sessionSlice.ts` calls the same helper names and stays as it is).
- Brand-free frozen identifiers: the key prefix `enc.v1.`, the setting keys `app_theme`, `editor_history_<uuid>`, `assistant_chats`, `cost_tracker_usage`, `crypto_*`, `passkey_*`, and the URI spelling `embeded://`.
- `LICENSE`: the line "Copyright (c) 2026 CardCrucible" stays (MIT requires the notice; Decision 36).
- `README.md`, `PROJECT_STATE.md` and everything in `docs/`: Claude edits them after the merge.
- `package.json`, the lock file, CI, `vercel.json`, `public/_headers`.
- The word "Crucible" as a feature name (the Crucible tab, probes, scenarios, files named `crucible*`). It is not the old brand.
- No migration or copy from the old database, and no fallback that still accepts the old crypto labels: both would keep the old name in the code (Decision 36).

Changes:
1. Branch `wip/058` from the latest `main`. First run `grep -rniE "card[ _-]?crucible" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist` and keep the output. Claude's search found the old name in the files listed above, plus `LICENSE`, `README.md`, `PROJECT_STATE.md` and `docs/`; the search is not complete. A hit in one other file under `src/`, `test/`, `public/` or `scripts/` (or in `index.html`, `vite.config.ts`): change it the same way (text only) and name the file in the PR description. Hits in two or more other files: stop and send one message (the stop rule in `docs/AI_WORKFLOW.md`).
2. Exact changes, nothing else in these files:
   - `src/db/index.ts`: class `CardCrucibleDatabase` becomes `RoleplayForgeDatabase`; `super('CardCrucibleDB')` becomes `super('RoleplayForgeDB')`; `export const db = new RoleplayForgeDatabase();`. Versions, stores, hooks and `CURRENT_SCHEMA_VERSION` (5, with `db.verno` 6) stay. Grep the class name and fix any other reference by name.
   - `src/utils/passkeyCrypto.ts`: header comment says Roleplay Forge; the HKDF `info` text `'CardCrucible-Passkey-Wrap-v1'` becomes `'RoleplayForge-Passkey-Wrap-v1'`; `rp.name` becomes `'Roleplay Forge'`; `user.name` becomes `'roleplayforge_user'`; `displayName` becomes `'Roleplay Forge User'`. `rp.id` (the hostname), the random `userId`, the sentinel, the algorithms and the rest stay.
   - `src/utils/crypto.ts`: the HMAC label `'CardCrucibleVerifier'` in `hashKey` becomes `'RoleplayForgeVerifier'`. Nothing else.
   - `src/hooks/usePWAUpdate.ts`: the message reads "A new version of Roleplay Forge is available. Reload to update."
   - `src/components/ErrorBoundary.tsx`: the console text reads "Roleplay Forge Component Error:" and the first line of the crash report reads "Roleplay Forge crash report".
   - `src/components/settings/BackupRestoreSection.tsx`: the two download names become `roleplayforge_full_backup_${Date.now()}.json` and `.zip`. Old files must still restore: the restore reads the file content, not its name. Grep `full_backup` in `src/` and confirm no code reads the name prefix; if some does, stop.
   - `src/services/llmAdapter.ts`: the OpenRouter `X-Title` header value becomes `'Roleplay Forge'`.
   - `src/utils/visualCardExporter.ts`: the drawn header `'CARDCRUCIBLE'` becomes `'ROLEPLAY FORGE'`; the footer `'EXPORTED WITH CardCrucible'` becomes `'EXPORTED WITH Roleplay Forge'`. Same position, alignment and font.
   - `src/utils/crucibleBadgeExporter.ts`: `'CARDCRUCIBLE'` becomes `'ROLEPLAY FORGE'`; `'GENERATED VIA CARDCRUCIBLE • AUTOMATED BENCHMARK SUITE'` becomes `'GENERATED VIA ROLEPLAY FORGE • AUTOMATED BENCHMARK SUITE'`. Same position, alignment and font. The new header is two characters longer than the old one: look at what is drawn next to each changed text in the same function, and say in the PR description whether the longer text can touch it (the owner checks the exports on the phone).
   - `src/utils/binaryEncoding.ts`: the comment only.
   - `src/components/settings/ConnectionProfilesSection.tsx`: only if step 1 finds the name there: same rename, text only.
3. Tests, existing:
   - `test/persistenceInvariants.test.ts`: the name expectation becomes `'RoleplayForgeDB'`; version 5, `db.verno` 6, tables and indexes stay.
   - `test/profileCleanup.test.ts`: the legacy `new Dexie('CardCrucibleDB')` becomes `'RoleplayForgeDB'`, so the 5-to-6 upgrade test still opens the database the app opens.
   - `test/binaryEncoding.test.ts`: the sample string `'CardCrucible 🧙‍♂️ ✨ — 日本語 / Español / Русский'` becomes `'Roleplay Forge 🧙‍♂️ ✨ — 日本語 / Español / Русский'`; behaviour unchanged.
4. New `test/rebrand.test.ts`, no `vi.mock` of the code under test, three tests:
   - (a) Verifier label: import a fixed 32-byte AES-GCM key as extractable, call `hashKey`, and compare with an HMAC-SHA-256 the test computes itself, using that key's raw bytes over the UTF-8 text `RoleplayForgeVerifier`, as lowercase hex.
   - (b) Passkey wrap: stub `window.PublicKeyCredential`, `navigator.credentials.create` (returns an object with `rawId` and `getClientExtensionResults: () => ({ prf: { enabled: true } })`) and `navigator.credentials.get` (returns `getClientExtensionResults: () => ({ prf: { results: { first: <a fixed 32-byte ArrayBuffer> } } })`). Call `enrollPasskey` with a known 32-byte master key. The returned `wrappedKeyHex` must decrypt (AES-GCM, the first 12 bytes are the IV) with a key the test derives itself from the same 32 bytes through HKDF-SHA-256, empty salt, info text `RoleplayForge-Passkey-Wrap-v1`, and give back the master key bytes. Also assert that the `create` call got `rp.name` `Roleplay Forge`, `user.name` `roleplayforge_user` and `displayName` `Roleplay Forge User`. If the test environment has no `crypto.subtle`, use `vi.stubGlobal('crypto', webcrypto)` with `webcrypto` from `node:crypto`; if it still cannot run, stop and say why instead of dropping the test.
   - (c) The old name is gone: read every text file under `src/`, `test/` (not this file), `public/` and `scripts/`, plus `index.html`, `package.json` and `vite.config.ts` where they exist, skipping binary files by extension (png, jpg, ico, webp, woff, woff2 and the like). Fail with the list of paths if any file matches `/card[ _-]?crucible/i`. Build the pattern from two string pieces inside the test so this file does not contain the name itself. Not `docs/`, `README.md`, `LICENSE` or `PROJECT_STATE.md`.
5. Effects to state in the PR description, because they change what the owner sees (Decision 36): a fresh start opens a new empty database `RoleplayForgeDB` (the old `CardCrucibleDB` stays on the device unused); an existing passphrase check and passkey unlock stop working, because the two crypto labels changed; OpenRouter now sees `X-Title: Roleplay Forge`.

Done when: CI green and the executor's own `npm ci && npm run lint && npm test && npm run build` real results are in the PR description. All three tests in `test/rebrand.test.ts` and the changed expectation in `test/persistenceInvariants.test.ts` fail on unmodified `src/` (say which ones did). The grep from step 1, run again at the end, lists only `LICENSE`, `README.md`, `PROJECT_STATE.md` and files under `docs/` (paste the file names). The owner can then see: exported posters and Crucible badges read Roleplay Forge; the update message names Roleplay Forge; a new backup file is named `roleplayforge_full_backup_*`.
Decisions: 20, 35, 36
