# Roleplay Forge — Local-First AI Roleplay Workbench (Character Card V2/V3, CHARX & Lorebook Editor)

**Live App (PWA):** [roleplayforge.vercel.app](https://roleplayforge.vercel.app) · **Source:** [github.com/KarlMuzen/RoleplayForge](https://github.com/KarlMuzen/RoleplayForge) · **Docs:** [Project State](PROJECT_STATE.md) | [Platform Support](docs/PLATFORM_SUPPORT.md) | [Roadmap](docs/ROADMAP.md)

**Roleplay Forge** is the planned evolution of this CardCrucible-derived, local-first browser application into a unified workbench for authoring, organizing, converting, and testing AI roleplay assets. The aim is to give creators a reliable place to manage **Character Cards (V2/V3, PNG, JSON, CHARX)**, **lorebooks**, **generation presets**, and **repeatable LLM evaluations** without overstating cross-platform compatibility.

> **Repository state (2026-10-31):** Production deploys from `main` to [roleplayforge.vercel.app](https://roleplayforge.vercel.app) as an installable Progressive Web App (PWA), still built on the CardCrucible codebase. Since the first UI pass it has gained a phone-first Library and Details layout, a context bar (undo, redo, save status), paste-to-card import, a chat test bench for cards, backup export that can leave API keys out, and an install prompt. The AI cover generator and device-to-device sync were removed on purpose; move data between devices with a backup file. CI verifies lint/type checking, tests, and a production PWA build. Many owner phone checks and Android installed-PWA behavior still need a manual pass (see [Project state](PROJECT_STATE.md) and [known bugs](docs/BUGS.md)).

---

## Current Foundation & Key Features

The current codebase includes:

- **Character Card V2 & V3 Studio:** A searchable card gallery and full Character Card V2/V3 editing workflows.
- **Multi-Format Import & Export:** PNG card metadata, JSON, and CHARX import/export paths, plus a public Chub card import path and paste-to-card import.
- **Lorebook Editor & Diagnostics:** Lorebook entry editing, activation keys, regex options, and overlap utilities.
- **Schema-Validated AI Patching:** AI-proposed card patches with diff review, selective application, and undo/redo support.
- **Scenario Testing & Model Evaluation:** Card variants, comparison tools, chat test bench, scenario runs, transcript review, and diagnostic metrics.
- **Multi-Provider LLM Connections:** Direct connections to configured model providers, including **Google Gemini**, **OpenAI**, **Anthropic**, **OpenRouter**, and local **Ollama** endpoints where the provider/endpoint supports them.
- **Local-First Storage & Backups:** Local browser storage (IndexedDB), backup/restore (with the option to exclude API keys), and optional passphrase encryption for saved API keys. Device-to-device sync was removed (card 034); move data between devices with a backup file.
- **Installable PWA:** Progressive Web App configuration for offline-capable, installable desktop and mobile browser use.

Feature presence does not, by itself, prove complete compatibility with every receiving platform. See the [platform support matrix](docs/PLATFORM_SUPPORT.md) for the limits of current claims.

---

## Product Principles

- **One workbench, specialist workflows.** Support, card building, lorebook design, preset coaching, and test analysis should share the same project data and history rather than fragment into separate bots or apps.
- **Local-first by default.** Keep character data in the user's browser unless a deliberate feature says otherwise. AI operations send selected content to the user's chosen provider; make that boundary clear.
- **Review before applying.** Material AI edits must be inspectable and selectively applicable, with undo support.
- **Loss-aware conversion.** Preserve unknown fields where feasible. When data must be transformed or dropped, provide a clear conversion report instead of silently losing it.
- **Repeatable evaluation.** Store enough information about the asset versions, model, settings, scenario, and evaluator to explain comparisons.
- **Evidence-led compatibility.** Label features as implemented, partially supported, verified, or planned. Do not equate successful import with equivalent runtime behavior.

---

## Work Areas

### Library and Card Studio
Organize character cards, edit supported V2/V3 fields, import and export known formats (PNG, JSON, CHARX), manage variants, and run local consistency and token-budget checks.

### Lorebook Studio
Create and edit world-info/lorebook entries, activation keys, regex options, and ordering. Expand toward fixture-based validation of platform-specific activation behavior.

### AI Assistance
Use structured, schema-validated proposals with previews and selective application rather than allowing unreviewed model output to rewrite a project.

### Testing Lab
Run roleplay scenarios against configured LLM providers, review transcripts, compare card variants, and inspect diagnostic signals. Evaluator scores are fallible evidence, not ground truth.

### Preset Workshop — *Planned*
Manage versioned generation settings separately from provider credentials. Show which parameters map cleanly across platforms and which are platform-specific or unsupported.

### Compatibility Center — *Planned*
Offer per-format/per-platform import and export adapters, round-trip tests, and conversion receipts describing preserved, transformed, unsupported, and dropped fields.

---

## Privacy and Security

The application is designed around local browser storage and direct calls to the user's chosen model provider. Do not assume that prompts, selected card text, or transcripts stay local when an AI feature is used: they may be sent to that provider.

Cards and lorebooks are stored in browser IndexedDB. The optional master passphrase encrypts saved API keys; it does **not** encrypt all card/lorebook content stored in the browser. Losing the passphrase can make encrypted keys unrecoverable. The project has not undergone a formal third-party security audit. Review the in-app security guidance before storing sensitive content.

---

## Roadmap and Documentation

- [Product vision](docs/PRODUCT_VISION.md): mission, principles, work areas, and boundaries.
- [Roadmap](docs/ROADMAP.md): phased delivery and completion criteria.
- [Platform and format support](docs/PLATFORM_SUPPORT.md): implemented paths versus verified compatibility.
- [Testing strategy](docs/TESTING_STRATEGY.md): required checks, integrity tests, and release smoke tests.
- [Project state](PROJECT_STATE.md): current task, decisions, and known risks (start here for any AI or human).
- [Known bugs](docs/BUGS.md): tracked issues and manual verification items.

---

## Local Development

Requirements: **Node.js 20+** (Node 20 is used by CI) or a compatible Bun environment.

```bash
npm ci
npm run dev
npm run lint
npm test
npm run build
