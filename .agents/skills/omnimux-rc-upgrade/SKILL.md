---
name: omnimux-rc-upgrade
description: "Upgrade the official DeepSeek Harness pin/RC used by OmniMux, or investigate post-upgrade Host, brand, tool-prepare, and cold-start contract drift. Use for harness-pin version/SHA changes and RC acceptance. Not for ordinary plugin edits, this skill's documentation maintenance, or unrequested App deployment."
---

# OmniMux RC upgrade

Input: requested upstream version/SHA, current pin, exact source/profile/App paths, and existing authorization. Output: the pin/overlay change plus verified Host, install-tree, and screen evidence. Missing evidence is not a successful upgrade.

## Scope and sources

- [harness-pin](../../../docs/harness-pin.md) owns the version and overlay procedure. [Dev pipeline](../../../docs/contracts/dev-pipeline.md) owns environment isolation and materialization; [ops entry](../../../docs/contracts/ops-entry.md) owns deployment commands.
- Use the shipping shell `/Users/x/Desktop/Project/omnimux-desktop-fork`; the old `omnimux-desktop` is read-only. Inspect the exact running Host/package tree, not a remembered RC or an assumed profile.
- Retain current authorization across turns. Prepare the patch and checks first; ask only for a missing shared-App/restart/release action. Never hand-copy, delete package directories in a profile, or materialize an unmerged tree into shared Dev.
- Repository source checks do not prove which Host the App runs. Missing source, package, or profile paths must be recorded as unavailable, not an empty successful check.

## Verify the changed contracts

1. Record upstream SHA/package version, product SHA, selected Host version, profile root, and shipping shell revision. Check package realpaths and dependency declarations in that exact install tree: plugin Host singletons (`@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`, `@deepseek-ai/cordis`) remain peers, without a second independently loaded instance. Managed pnpm-internal links are not duplicate packages by themselves.
2. Compare current Host seats and SVG viewBoxes with `plugins/omnimux/src/brand/defaults.js` and the overlay fixtures. Verify sidebar mark/name, hero brand, collapsed rail, and the composer seat. Do not copy old viewBoxes into tests without reading the matching Host implementation.
3. Keep overlays confined to the intended brand seat; do not hide a React-owned ancestor or inject a brand into `[data-composer-seat]`. Follow the current [sidebar contract](../../../docs/contracts/sidebar-extra-entries.md) for app entries and workbench placement.
4. Run relevant brand tests and build from this repository:

   ```sh
   node --test plugins/omnimux/src/brand/*.test.js
   pnpm --filter omnimux build
   ```

   Also run the affected plugin checks from [AGENTS.md](../../../AGENTS.md). Fix the demonstrated failure before re-running its check; there is no real model API probe for RC contract acceptance.
5. Follow [plugin QA](../../../docs/contracts/plugin-qa.md) for isolated pre-merge validation. After authorized merge/materialization, verify the exact delivered Dev App (45120) with ego-browser and the shared probe. Load ego-browser first; missing capabilities are BLOCKED, never an IAB fallback. Test shell-specific behavior in Electron, including Host launch with `--no-open`.

## Required acceptance evidence

| Surface | Evidence |
| --- | --- |
| Empty session | Brand fits; no OmniMux mark inside the composer |
| Expanded/collapsed sidebar | Correct mark/name and usable sidebar/workbench entries |
| Tool call | A harmless read completes without `prepare` or `turn/end` errors |
| Desktop cold start | One Electron window, no external system browser |

Preserve actual browser/probe captures and Electron evidence, each tied to the tested revision and environment. Do not substitute static test fixtures for these surfaces.

## Report

```text
pin: <version + SHA>
product: <SHA>
host: <path + version + revision>
profile: <resolved root>
install-tree: pass | fail | unavailable (<paths and peer/duplicate findings>)
brand-checks: <command + result; fixture/Host comparison>
screens:
  empty-session: pass | fail | missing
  sidebar-brand: pass | fail | missing
  tool-call: pass | fail | missing
  desktop-no-open: pass | fail | missing
evidence: <paths and tested environment>
residual: <unresolved action or none>
```

Any `fail`, `unavailable`, or `missing` blocks upgrade acceptance and a release claim. A pin bump does not itself authorize production deployment or a tag; complete only the release actions the user requested.
