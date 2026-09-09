---
title: "Official harness pin"
id: "core-harness-pin"
type: "core"
status: "living"
authority: "L1"
date: "2026-08-22"
updated: "2026-09-09"
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

## Unmodified official consumption

Official DSH source, submodules, temporary copies, and distribution packages are read-only for product development. Product behavior belongs in plugins, the desktop shell, or existing configuration seams. Source patching and the former apply/reset commands are retired. Cordis configuration patches remain a supported configuration mechanism; they do not change official source.

The table above records the plugin repository's existing alpha compatibility pin; this change does not upgrade it. Dev acceptance records this pin SHA and the Host's actual identity; it does not upgrade the pin, change `$DSH_SRC`, or modify official clones. Pin/API mismatch is a stop and needs separate RC authorization. The shipping desktop's own submodule pin is authoritative for the App. The quota replacement was tested against desktop DSH `0.1.2-rc.1` (`a66e4702047846cdaa10c66c9d3df3951f5ea70d`), with pi-ai `0.84.2` and OpenAI SDK `6.40.0`.

The gateway normalizes local account-quota rejections on OpenAI text endpoints to HTTP 402 with `insufficient_quota`. Plugin quota notices remain enabled. See [quota compatibility and retirement](contracts/quota-error-compatibility.md) for validation, rollout order, historical evidence, and the separate shared-clone recovery boundary. Removal from this repository does not restore already patched clones.

## Upgrade the pin

1. Select an official release and verify the required seats through read-only inspection.
2. Prepare an isolated, unmodified checkout or official package through the supported install flow. Do not switch, reset, or clean a shared dirty clone.
3. Run the affected plugin checks and the [RC skill](../.agents/skills/omnimux-rc-upgrade/SKILL.md) Host/desktop acceptance. Missing screen evidence is not a completed upgrade.
4. Tag or publish only with release authorization.
