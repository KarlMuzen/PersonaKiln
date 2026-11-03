# Architecture

Three diagrams of how RoleplayForge is built. GitHub draws the Mermaid blocks; any AI can read them as text. Edges in diagrams 1 and 2 come from the `import` lines and function calls in `src/` read at `main` `48c6eae` (2026-10-30), except where a note below says otherwise. They are not a full call trace. Device sync was removed by card 034 (PR #32, merge `b2f1afe`), so its boxes and arrows were taken out of diagrams 1 and 2 on 2026-10-31 from `PROJECT_STATE.md`; the restore path was re-read in `src/io/backup.ts` and `src/db/index.ts` on 2026-10-31 (see the open item under diagram 2); the rest was not re-read in `src/` since `48c6eae`. If a diagram and the code disagree, the code wins; fix the diagram.

An editable FigJam copy exists on the owner's Figma board. It is a picture only; this file is the source.

## 1. App layers

No backend. Everything runs in the browser; the only network calls are to the model providers and to Chub (card import by URL). Since Task 028 no file under `src/components` imports the `db` object (a lint rule fails the build if one does), so screens read through the store; services, routing and `src/io` may use the database. Not re-checked since: how Chat and Test Lab save their data.

```mermaid
flowchart LR
    subgraph client ["User Device"]
        phone["Phone or desktop browser (installed PWA)"]
    end
    subgraph gateway ["App Shell"]
        router["Hash router (src/routing)"]
    end
    subgraph service ["App Logic (src)"]
        library["Library (GalleryView, paste import)"]
        editor["Forge: Details, Lorebook, Prompt"]
        assist["Assist and Enhancer (AI patches)"]
        chat["Chat preview (ChatPreviewModal)"]
        testlab["Test Lab (CrucibleView)"]
        settings["Settings (profiles, backup, security)"]
        store["Zustand store (card, ui, profile, session, assistant slices)"]
        io["Import and export (png, charx, json, chub, converter)"]
        tools["Free tools (tokenizer, writingLint, lorebookScan, chatMarkup, pasteImport)"]
        engine["Conversation engine (prompt building)"]
        llm["LLM adapter (llmAdapter.ts)"]
    end
    subgraph datastore ["Local Storage"]
        dexie["IndexedDB via Dexie (cards, lorebooks, connectionProfiles, settings)"]
    end
    subgraph external ["External"]
        providers["LLM providers (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, custom)"]
        chub["Chub (card import by URL)"]
    end

    phone -->|"Navigates"| router
    router -->|"Opens Library"| library
    router -->|"Opens Forge"| editor
    router -->|"Opens Assist"| assist
    router -->|"Opens Test"| testlab
    router -->|"Opens Settings"| settings
    editor -->|"Opens Chat"| chat
    library -->|"Imports cards"| io
    library -->|"Reads"| store
    editor -->|"Reads and edits"| store
    editor -->|"Counts and lints"| tools
    assist -->|"Requests edits"| llm
    chat -->|"Builds prompts"| engine
    chat -->|"Saves chats"| dexie
    testlab -->|"Runs scenarios"| engine
    testlab -->|"Scores runs"| tools
    engine -->|"Sends requests"| llm
    engine -->|"Scans lorebook"| tools
    settings -->|"Saves profiles"| store
    store -->|"Reads and writes"| dexie
    io -->|"Saves imports"| dexie
    llm -.->|"Provider APIs: chat requests"| providers
    io -.->|"Chub: fetches card"| chub
```

Notes:
- Free tools live in two places: `src/utils` (older: tokenizer, `writingLint`, `lorebookScan`) and `src/core` (newer: `chatMarkup`, `pasteImport`). Existing files are not moved (`PROJECT_STATE.md` Decision 2).
- `writingLint` is used only by the pre-flight audit modal.

## 2. Data safety

Frozen identifiers (do not rename): DB name `RoleplayForgeDB` (renamed from the old brand name by card 058, PR #58), settings keys, the `enc.v1.` format and passkey identifiers (`PROJECT_STATE.md` Guardrails). The sync data-channel label went with the code in card 034; no sync identifier remains.

```mermaid
flowchart LR
    subgraph inputs ["Ways data enters"]
        edit[/"Editing in the app"/]
        imp[/"Import card file or paste"/]
        restore[/"Restore backup file"/]
    end
    subgraph guard ["Checks on the way in"]
        cardImport["importCardData and converter (defaults, warnings)"]
        backupParse["validateBackupData (src/schemas/backupSchema) in parseBackupPayload and restoreFullBackup (zip or JSON, 200 MB cap)"]
        hooks["Dexie write hooks (Zod storage schema on cards and lorebooks)"]
    end
    dexie[("IndexedDB RoleplayForgeDB: cards, lorebooks, connectionProfiles, settings")]
    subgraph secrets ["Secrets (frozen identifiers)"]
        vault["API keys: enc.v1 AES-GCM, key from passphrase (PBKDF2) or passkey"]
        vaultKeys["Settings keys: crypto_mode, passkey_credential_id, passkey_wrapped_key, passkey_prf_salt"]
    end
    subgraph outputs ["Ways data leaves"]
        exp["Export card (PNG, JSON, CHARX)"]
        backupOut["Backup file from Settings (API keys optional since Task 027)"]
    end

    edit -->|"Saves card"| hooks
    imp --> cardImport
    cardImport -->|"Saves card"| hooks
    restore --> backupParse
    backupParse -->|"Cards and lorebooks: add or update"| hooks
    backupParse -.->|"Profiles and settings: no hooks"| dexie
    hooks --> dexie
    vault -->|"Stored in"| dexie
    vaultKeys -->|"Stored in"| dexie
    dexie --> exp
    dexie --> backupOut

    style inputs fill:#C2E5FF,stroke:#3DADFF
    style guard fill:#CDF4D3,stroke:#66D575
    style secrets fill:#FFCDC2,stroke:#FF7556
    style outputs fill:#FFECBD,stroke:#FFC943
```

Checked 2026-10-31 at `main` `12864aa`: `restoreFullBackup` (`src/io/backup.ts`) calls `validateBackupData` first (the schema file itself was not read), then writes cards and lorebooks with `db.cards` and `db.lorebooks` `add` and `update` inside one transaction, so the Dexie hooks (`src/db/index.ts`) run on them. A card the hook rejects is skipped and reported. Hooks exist only on the `cards` and `lorebooks` tables; `connectionProfiles` and `settings` have none. Open (unverified): whether a hook error caught inside the transaction leaves it intact, and whether the restore screen shows the `errors` list. Skipped-without-notice cases are in `docs/BUGS.md`.

## 3. Delivery pipeline

A picture of `docs/AI_WORKFLOW.md`. That file is final and wins on any difference. The dashed `tweak:` arrow is the Decision 32 lane: small UI text or layout changes go from the owner straight to the executor with no card, and with no Claude review they continue like a `Review: skip` card.

```mermaid
flowchart LR
    owner(["Owner: idea or problem"])
    plan["Claude plans and writes the task card"]
    card[/"Task card in docs/tasks"/]
    exec["Executor (ChatGPT or Muse, owner names one) codes on wip/NNN and opens PR"]
    ci{"CI test-and-lint green?"}
    stop["Executor stops and reports"]
    rev{"Card says Review required?"}
    review["Claude reviews PR diff"]
    merge["Executor squash-merges by hand"]
    deploy["Vercel deploys main (code commits only)"]
    ready{"Production deployment READY?"}
    recover["Manual deploy (Decision 22)"]
    done["Merged (executor deleted the card in the PR)"]
    sync["Claude syncs PROJECT_STATE"]
    check[/"Owner checks production on phone"/]

    owner --> plan
    owner -.->|"tweak: (no card)"| exec
    plan --> card
    card -->|"Execute NNN"| exec
    exec --> ci
    ci -->|"No, fix (2 tries)"| exec
    ci -->|"Red after 2 fixes"| stop
    ci -->|"Yes"| rev
    rev -->|"Yes"| review
    rev -->|"No"| merge
    review -->|"Approved"| merge
    review -->|"Changes needed"| exec
    merge --> deploy
    deploy --> ready
    ready -->|"Yes"| done
    ready -->|"No"| recover
    recover --> done
    done --> sync
    sync --> check
    check -.->|"Problems become new cards"| owner

    style owner fill:#CDF4D3,stroke:#66D575
    style check fill:#CDF4D3,stroke:#66D575
    style plan fill:#DCCCFF,stroke:#874FFF
    style review fill:#DCCCFF,stroke:#874FFF
    style sync fill:#DCCCFF,stroke:#874FFF
    style exec fill:#C2E5FF,stroke:#3DADFF
    style merge fill:#C2E5FF,stroke:#3DADFF
    style stop fill:#FFCDC2,stroke:#FF7556
    style recover fill:#FFECBD,stroke:#FFC943
```
