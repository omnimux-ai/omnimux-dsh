---
title: "Official harness pin"
id: "core-harness-pin"
type: "core"
status: "living"
authority: "L1"
date: "2026-08-22"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# Official harness pin

Current upstream this product builds against. Not a fork record.

| Field | Value |
|---|---|
| Package | `dsh@0.1.2-alpha.3` |
| SHA | `dd6322d604e00eec1ba5e0c8541159906a21094a` |
| Remote | `https://github.com/deepseek-ai/deepseek-harness.git` |
| Default local clone | `/Users/x/Desktop/Project/Github/deepseek-harness` |
| Recorded | 2026-09-01 |

Override the clone path with `DSH_SRC`. Decision: [decisions/2026-08-16-harness-consume-not-fork.md](decisions/2026-08-16-harness-consume-not-fork.md).

## Overlay against this pin

Directory: `patches/dsh-0.1.2-alpha.3/`. Current overlays: `llm-quota-priority.patch` and `ui-commands-client-action.patch` (quota wording wins over a bare 403 so `insufficient_user_quota` is `QUOTA`, not `AUTH`). Official alpha.3 already carries the old client failure-display quota path; this overlay keeps the four `packages/llm/*` hunks. Desktop packaging patches have left this clone; the shipping shell is `/Users/x/Desktop/Project/omnimux-desktop-fork` (sync per its `docs/contracts/upstream-sync.md`); the retired slim shell `omnimux-desktop` is archived. Historical `patches/dsh-0.1.1-rc.2/` is not the live overlay.

`pnpm-lock.yaml` is not a patch.

Untracked on the clone and **not** in this directory: `.agents/skills/dsh-plugin-guide`, `CLAUDE.local.md`. MUST NOT recreate `apps/desktop/` on the official clone.

## Apply / reset

```sh
DSH_SRC=/Users/x/Desktop/Project/Github/deepseek-harness ./scripts/apply-harness-overlay.sh
DSH_SRC=/Users/x/Desktop/Project/Github/deepseek-harness ./scripts/reset-harness-overlay.sh
```

Apply requires `HEAD` to equal the SHA above. Before reset, inspect the script's exact quota and ui-commands overlay target paths and staged/unstaged changes: it restores tracked files from the current index (not `origin/master`) and removes the named legacy desktop patch. It does not clear staged changes; preserve unrelated work before proceeding.

## Bump the pin

1. Fetch the official tag or SHA. Set it in this file.
2. `reset-harness-overlay.sh`, then `git checkout` that SHA in `DSH_SRC`.
3. Replay each patch. If official added the same seat or desktop wiring, delete that patch instead of rebasing it.
4. Install the pinned clone's dependencies. In this product repository, run the affected `omnimux` / domain-plugin checks and the RC skill's Host/desktop acceptance checks.
5. Load skill `omnimux-rc-upgrade` (`.agents/skills/omnimux-rc-upgrade/SKILL.md`) and finish its report. MUST NOT tag or call the bump done while any `screens.*` is `missing`.
6. Tag or publish only when the task explicitly authorizes that action; otherwise report the verified pin and acceptance evidence without creating a release.
