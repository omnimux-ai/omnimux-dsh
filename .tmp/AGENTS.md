# OmniMux Ephemeral Scratchpad Guidelines (.tmp/AGENTS.md)

This document is the **sole tracked normative contract** in the `.tmp/` directory. All other files, subdirectories, dumps, and payloads within `.tmp/` are strictly ephemeral, ignored by Git, and disposable at any time.

---

## 1. Hard Bounds (Core Directives)

- **Single Scratchpad Authority (SSOT)**: `.tmp/` is the **only** authorized ephemeral workspace in the OmniMux codebase. Aliases such as `temp/`, `tmp/`, `.temp/`, `scratch/`, or per-plugin root scratchpads are strictly banned.
- **Git Tracking Barrier**: Only `.tmp/AGENTS.md` is committed to Git. All payloads, dumps, and generated files within `.tmp/` MUST remain 100% untracked via root `.gitignore`.
- **Zero Production Dependency**: Production code (`plugins/*/src/**`, `scripts/**`) MUST NOT import or require files from `.tmp/`.
- **Pipeline Cutoff**: The build and materialization pipelines (`sync-to-app.sh`, `scripts/auto-qa-gate.mjs`) physically exclude `.tmp/`. Artifacts in `.tmp/` never reach release bundles or the Dev desktop runtime.
- **Strict Disposability**: Nothing in `.tmp/` is durable. Every process and agent MUST assume `.tmp/` can be wiped instantly without warning.
- **Zero Secret Exposure**: NEVER write API keys, access tokens, credentials, session secrets, or unredacted PII into `.tmp/`.

---

## 2. Permitted vs. Forbidden Usage Matrix

| Category | Permitted in `.tmp/` | Strictly Forbidden |
| :--- | :--- | :--- |
| **Diagnostics & Probes** | Temporary JSON/NDJSON dumps, CDP trace logs, ephemeral probe outputs | Committing probe outputs to `docs/evidence/` or source folders without review |
| **Test Fixtures** | Ephemeral mocks, temporary SQLite test DBs, scratch file bundles | Hardcoded inline mocks in source files, permanent test assets |
| **Build Artifacts** | Intermediate AST dumps, temporary bundler analysis files | Diverting official build outputs (`dist/`, `lib/`) into `.tmp/` |
| **Secrets & Config** | Fully redacted dummy configs with placeholder tokens (`test-token-xxxx`) | Real API keys, production tokens, credentials, private certs |
| **Code Imports** | Test runners executing disposable scripts in `.tmp/` | Production source importing modules from `.tmp/` |

---

## 3. Disposability & Lifecycle Operations

- **On-Demand Incineration**: Execute `pnpm run clean:tmp` to physically incinerate all scratch files while preserving `.tmp/AGENTS.md`.
- **Session Clean-Up**: Agents creating scratch payloads MUST attempt to clean them up prior to handoff or completion.
- **Namespacing**: Parallel agents running concurrent tasks SHOULD namespace payloads under `.tmp/<task-id>/` (e.g. `.tmp/issue-2800-probe/`) to avoid collisions.
- **Fail-Closed Isolation**: If an agent requires scratchpad storage, it MUST create files strictly within `.tmp/` in its own isolated worktree.

---

## 4. Verification & Gate Enforcement

- **Auto-QA Exemption**: `.tmp/` is explicitly listed in `scripts/auto-qa-gate.mjs` (`SKIP_DIRS`) and `scripts/auto-qa-scan.test.mjs` to bypass repo-wide static scans.
- **PreToolUse Hook Guard**: `scripts/guard-worktree.mjs` recognizes `.tmp/` as the single authorized ephemeral directory while blocking modifications to all other directories in the primary checkout.
