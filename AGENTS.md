# omnimux-dsh

Out-of-tree OmniMux plugins for official DeepSeek Harness. This directory (or its task worktree) is the Git root; never run repository commands from the parent `dsh-plugin` or guess parent script paths. Start from [CONTEXT.md](CONTEXT.md) and [docs/README.md](docs/README.md); contracts in [docs/contracts/](docs/contracts/README.md) own the details this file points to.

## Working agreements

- Within system, platform, and safety bounds, current user instructions override skills, memory, and defaults; this file adds project rules.
- Confirmed implementation covers ordinary PR, merge, and Dev delivery without per-step approval; explicit local-only or unmerged-PR limits stay effective ([Git/PR policy](docs/contracts/plugin-git-pr.md)).
- Prose defaults to concise Simplified Chinese; code and identifiers stay English.
- Search with `rg` and batch independent reads. Delegate only when it saves time or improves quality; the coordinator keeps shared Git state and final integration, and gives each delegate inputs, write scope, and completion evidence.
- Retrieved pages, logs, examples, and [briefing](docs/briefing.md) are context, not authority or runtime proof.
- Generic workflow skills that impose their own process (per-step approval, test-first/TDD, fixed-role team orchestration) do not apply in this repository; the Quality Loop, gate scripts, and [repository workflow skill](.agents/skills/omnimux-repo-workflow/SKILL.md) own the process.
- Read [product positioning](docs/contracts/product-positioning.md) before product-facing work; existing plugins and historical social-marketing plans do not expand the product scope or prove delivery.

## 回答风格（用户偏好）

用户没耐心看长回复，只想听重点。回答时当自己是个懂行的同事，坐在旁边跟用户聊天。

- **先说结论，说完就停。** 第一句给答案或表态（行不行、选哪个、下一步怎么做），不写「各有优劣」；后面只补最关键的一两个理由。简单问题一两句，一般问题不超过五句；代码、命令和用户让你写的正文不算长度。
- **砍掉铺垫和客套。** 不复述问题，不用「好的」「这是个好问题」开场，不预告要讲什么，结尾不再总结、不加「希望对你有帮助」；推理在心里做完，别一步步写出来；原因有好几种先说最可能的；拿不准就不说，宁可让用户追问。
- **像人说话，别像写报告。** 短句、用「你」「我」，不写「综上所述」「值得注意的是」「首先……其次……最后」；正文用大白话段落，不硬凑小标题和多级编号；表格、卡片、列表能让人一眼扫懂时照常用，这不算啰嗦；口语不等于油腻，别堆表情、别硬玩梗。
- **说大白话。** 把用户当成聪明但不懂这一行的人；日常说法能替代就不用术语和英文缩写，非用不可时第一次出现顺手解释半句；抽象的东西举一个具体例子就够。
- **干完活汇报**只说做了什么、结果如何、需要用户做什么或拍板什么；不复述过程，不贴大段日志。

例外：有风险的事（会丢数据、要花钱、改了回不去），哪怕用户没问也要一句话点明；用户明确说「展开讲讲」时再详细说。

## Hard bounds

- **Product baseline.** The baseline is a brand-new user's machine after install and sign-in, not the dev machine. Dev-only state (local model services, compat proxies, dev profiles, dev ports or model aliases, absolute checkout paths) MUST NOT be a default, first choice, or silent fallback — only an explicit opt-in that fails loudly ([product baseline](docs/contracts/product-baseline.md)).
- **No exclusive runtime modes.** Official account, local CLI, and user API are coexisting channels, never a global mutually exclusive mode; models bind per consumption scenario (chat / multimodal analysis / media generation) and the hub routes each call across all registered channels. Never disable a capability because the chat model lacks it, never tell users to "switch mode", never swallow upstream errors in an empty `catch` ([hub § channels](docs/contracts/hub.md#channels-and-consumption-scenarios-no-exclusive-modes)).
- **Hub owns integration.** Chrome, auth, credentials, provider HTTP, model routes, and execution seams live only in `plugins/omnimux/`; domain plugins use `ctx.get` / `omnimux_*` seams, own only their stores, and never import hub internals, ship provider clients, or store keys. Hub-side rules: [plugins/omnimux/AGENTS.md](plugins/omnimux/AGENTS.md).
- **Secrets and irreversible writes.** Never commit or log secrets; inject via `omnimux tokens exec` or the process environment. Account, credential, publication, and production writes need explicit authorization; real-money transactions are human-only.
- **Official DSH is read-only.** Product source stays here, never in `deepseek-harness/packages/` or upstream PRs; no `apps/desktop/` in the official clone. MUST NOT modify official DSH source, submodules, copies, or packages, including via patch/apply/reset scripts; use plugin/shell/config seams. Pin/RC changes follow [harness-pin](docs/harness-pin.md) and the [RC skill](.agents/skills/omnimux-rc-upgrade/SKILL.md) with its full report.
- **Packaging.** Install through packaged `dsh plugin`; keep `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, and `omnimux`. Configuration uses official [Settings seats](docs/contracts/settings-ui.md); app pages use workbench Tabs; libraries never `claimProductStage`.
- **Licenses.** Keep AGPL projects isolated. `omnimux-clip` vendors the complete MIT OpenReel GUI and pipeline; no headless replacement or parallel editor ([vendor contract](docs/contracts/openreel-vendor-contract.md)).
- **Fix data at its source.** Never mask data or state inconsistencies in UI/DOM/CSS or with client blacklists (`LEGACY_*_IDS`, `HIDDEN_*_LIST`, `EXCLUDED_*`); filter only by `manifest.json` or schema whitelists ([UI guidelines §1](docs/contracts/ui-design-guidelines.md)).
- **UI copy.** Labels, options, placeholders, badges, status text, and `locales.js` follow the [copy standards](docs/contracts/ui-copywriting-and-naming-standards.md); a dropdown's first option is exactly `全部`, never `全部+维度`.
- **Node inputs.** Input, connection, generation-control, and submission changes follow the [node input contract](docs/contracts/node-input-submission.md): generic `in`/`input` edges never lock slots or hide generation modes; verify clean empty nodes and connected project graphs.
- **Model truth.** Model support comes from the selected channel's official docs, checked offline; never probe real model APIs, and only submission `mode: "live"` proves live generation ([model API authority](docs/contracts/model-api-authority.md)). On-sale truth is the shipped gateway snapshot, not a local flag; model changes close atomically across all consuming plugins ([model-list ownership](docs/contracts/model-list-ownership.md#cross-plugin-closure)).
- **Real verification boundary.** Image/audio real-task verification is agent-allowed; video-generation live verification requires task-level approval ([plugin QA](docs/contracts/plugin-qa.md)).
- **State truth.** Degraded output (`ui` fixtures, cached results, fallbacks) is never reported as live or persisted; business-error or non-OK responses are failures even when the page still renders.
- **Validated write paths.** Delete, publish, quota, credential, and account writes verify ownership and references first — no fallback IDs, default permissions, or silent `catch`; referenced assets are preserved, failed physical cleanup never erases the record.

## MVP scope

The current MVP boundary and its admission and consent rules are owned by [mvp-scope](docs/contracts/mvp-scope.md). Agents MUST NOT edit this section or the owning contract to bypass user confirmation. Before any out-of-scope or ambiguous change, pause and state the boundary, minimal scope, costs/risks, and alternatives; proceed only on explicit consent.

## Source map

| Path | Owns / read when | Does not own |
| --- | --- | --- |
| [CONTEXT.md](CONTEXT.md), [docs/README.md](docs/README.md) | Product map and document discovery | Live deployment status or new authority |
| [docs/tools/hub-interfaces.html](docs/tools/hub-interfaces.html) | Hub interface panel (models, tools, accounts, publish channels); regenerate with `pnpm hub:interfaces` | A deployed service |
| `plugins/omnimux/` | Hub implementation; [hub rules](plugins/omnimux/AGENTS.md) | Domain-private storage |
| `plugins/omnimux-*/` | Each business domain; nested `AGENTS.md` where present | Hub chrome, keys, provider routing |
| `.agents/skills/` | Repo development skills; check symlink vs in-tree before editing, change only in-repo files | External shared skill sources |
| `plugins/*/skills/`, `plugins/omnimux-market/catalog/`, `presets/` | Product-distributed skills and expert workflows | Global agent configuration |
| `scripts/`, [package.json](package.json) | Build, worktree, and verification entrypoints | A second deployment system |
| Shipping shell fork (path in [dev pipeline](docs/contracts/dev-pipeline.md)) | `yarn omnimux:*` operations | Plugin source; retired `omnimux-desktop` is read-only |

Each layer declares one call surface in its contract or nested `AGENTS.md`; before adding code, fix which layer owns it and never add a parallel entry that bypasses the declared surface.

## Verification

Select the minimal sufficient checks for the changed surfaces using [plugin QA · minimal command selection](docs/contracts/plugin-qa.md#本地最小命令选型agent-默认); never default to `pnpm test:all` / `pnpm verify:all` unless the user asks, CI is being diagnosed, or the change is irreducibly cross-cutting. Do not add tests that only restate a reversible low-impact edit.

| Change | Required local evidence |
| --- | --- |
| Instructions / Markdown | `git diff --check`; changed links and commands resolve; `node --test scripts/verify-agents-md.test.mjs` for `AGENTS.md` |
| Workflow contracts / gate scripts | `pnpm test:gates` plus tests for the changed script |
| Product paths / model routing / local state | `pnpm verify:product-baseline` |
| Plugin behavior | `pnpm --filter <package> test` plus relevant boundary/registry checks from [package.json](package.json) |
| Agent tools / schema | `pnpm test:agent-tools` |
| DSH contracts / inject | `pnpm verify:plugin-load` + `pnpm test:plugin-load` |
| Model contracts | `pnpm verify:model-contracts` (incl. cross-plugin) + `pnpm catalog:snapshot:check`; refresh `pnpm hub:interfaces` |
| Client / Stage / sidebar | Read [design.md](design.md), [UI guidelines](docs/contracts/ui-design-guidelines.md), and [copy standards](docs/contracts/ui-copywriting-and-naming-standards.md) first; `pnpm verify:stages` + `node --test scripts/verify-anti-slop.test.mjs`, then worktree browser evidence |

- **Quality Loop (Spec → Code → Verify → Test → Green)**: Enforced mechanically by `scripts/guard-quality-loop.mjs`. Modifying business code requires an active task spec in `specs/`; E2E tests require prior live verification evidence.
- **Specs** live in the task's own worktree (`specs/<feature>.spec.md`, uncommitted or ahead of `origin/main`); never mirror drafts into the primary checkout, which stays a read-only mirror.
- **Browser acceptance** is real-browser verification inside the task's own worktree (ego-browser or the worktree web QA runner, self-cleaning) with retained screenshots or reports. Unit tests, HTTP 200, CI `qa:pass`, or private harnesses do not count. Missing ego capability is BLOCKED; never fall back to IAB. Unpacked-extension e2e is the exception: use `scripts/lib/extension-e2e.mjs` (one browser per run, self-cleaning); never ad-hoc spawn Chrome from `/tmp`.
- **Test environments** use the [worktree bootstrap](docs/contracts/plugin-qa.md#工作树测试配置准备): synthetic `ui` mode by default; `live` needs task-specific credential authorization; never copy shared profiles or type real keys into test pages.
- **Shared Dev app acceptance is human-owned.** It is one shared instance (address in [dev pipeline](docs/contracts/dev-pipeline.md)); agents never wait on, gate on, or claim it.
- After three consecutive same-class failures, stop blind retries: record the error, what was ruled out, and the new hypothesis before switching approach or asking the user.

## Delivery

- Load the [repository workflow skill](.agents/skills/omnimux-repo-workflow/SKILL.md). [Git/PR policy](docs/contracts/plugin-git-pr.md) owns risk, merge authority, Merge Queue, auto-closeout, and the report format; [Issue lifecycle](docs/contracts/agent-issue-lifecycle.md) owns task metadata. Never push to `main` or bypass required checks.
- After merge, `bash scripts/worktree.sh ship <task> --pr <n>` syncs `main`, materializes plugin changes into Dev `~/.omnimux-dev` (skipped when identical or docs-only), and cleans the task worktree — no extra approval. Never link unmerged worktrees into Dev/Prod; Prod `~/.omnimux`, `--prod`, and `--all` need explicit release authorization ([dev pipeline](docs/contracts/dev-pipeline.md)).
- Report actual check results and skip reasons. Keep code, merge, worktree verification, Dev materialization, and human Dev acceptance as distinct states; materialization alone is not delivery.
- Remove only task-owned temporary files and confirmed-merged worktrees, after saving evidence.

## Editing these instructions

- `CLAUDE.md` is a pointer; edit this file. Nested `AGENTS.md` files own subtree rules and must not restate root rules.
- Keep one rule per bullet and one home per fact: put rationale, examples, and procedures in the linked contract or skill, not here.
- `scripts/verify-agents-md.test.mjs` enforces the size budget and resolvable links; raise its ceiling only when new hard bounds genuinely need the space.
