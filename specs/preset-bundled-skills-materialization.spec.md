# 预设自带技能从真实目录物化（Issue #3130）

## 问题陈述

开发版用「创建Agent」(cordis 预设) 新建会话时，persona 指示模型加载 `editing-cordis-compositions`，技能工具回 `skill ... is unknown or no longer available`。

已实证的根因：该预设的 `skill-filesystem` 行用 `new URL('skills/', baseUrl)` 指向预设自身目录；物化把预设放进 `app.asar` 后 `baseUrl` 落在安装包内部，而 DSH `fs-local` 的 `probe()` 走 `stat(path, {bigint:true})` + `info.mode & 0o777n`，Electron 的 asar `stat` 忽略 `bigint` 返回 Number → `Cannot mix BigInt and other types`；`skill-registry` 整条跳过该 provider，两份技能不入库。

## 用户操作旅程

1. 用户（或物化脚本）在开发版/正式版 home 上执行预设物化。
2. 物化结束时，每个出厂预设自带的 `skills/<id>` 已出现在该 home 的真实技能根 `<home>/skills/<id>`；同名已存在的技能保持原样，不被覆盖。
3. 用户新建一个「创建Agent」会话。
4. 模型调用技能工具加载 `editing-cordis-compositions` / `cordis-plugin-development` → 成功返回技能正文。
5. 宿主日志不再出现 `skill provider "filesystem" skipped: FsError: cannot list ".../app.asar/preset/agent-presets/cordis/skills"`。

## 验收标准（可观察）

- A1：`bash scripts/sync-agent-presets.sh --target=<临时 home>` 结束后，`<临时 home>/skills/editing-cordis-compositions/SKILL.md` 与 `<临时 home>/skills/cordis-plugin-development/SKILL.md` 存在且非空。
- A2：目标 home 中已存在同名技能（用户或既有技能库）时，该目录内容不变（no-clobber）。
- A3：`presets/**/agent.cordis.yml` 不再出现 `customSkillDirs`（出厂预设不得再自指目录，防回归到安装包内部读取）。
- A4：`presets/cordis/skills/editing-cordis-compositions/SKILL.md` 与 `cordis-plugin-development/SKILL.md` 仍在仓库内（技能本体不丢）。
- A5：开发版真机复验：物化后 `~/.omnimux-dev/skills/` 含这两个技能；日志不再出现上述 provider skipped 行。

## 产品基线（新用户机器）

- 依赖：仅随包相对路径（`presets/<id>/skills/`）与当前环境 home（`<DSH_HOME>/skills`）。
- 缺失时的表现：技能根不存在时脚本 `mkdir -p` 创建；home 不存在时脚本跳过该目标并打印 `· skip missing`，不静默伪造成功。
- 无开发机绝对路径进入产物：脚本目标 home 由 `$HOME`/显式参数推导，不硬编码本机路径。

## 非目标

- 不改 `omnimux-desktop-fork`（打包与 asar 头；另一工作区，需单独授权）。
- 不改 DSH 官方 fs 内核的 bigint stat 行为。
- 不改任何预设的 persona / tool 行。
- 不删除任何既有技能目录。

## 改动面

| 文件 | 改动 |
| --- | --- |
| `scripts/sync-agent-presets.sh` | 物化后把各预设自带 `skills/<id>` 落盘到目标 home 的真实技能根，同名跳过 |
| `presets/cordis/agent.cordis.yml` | 去掉自指 `skills/` 的 `skill-filesystem` 行（`tool-skill` 保留） |
| `scripts/verify-preset-skills-materialization.test.mjs`（新） | A1–A4 的确定性门禁 |

## 风险

R2。主要风险为同名技能被覆盖 —— 以「已存在则跳过」规避；其次为广播目标（`--all`）误写用户目录 —— 只在各目标 home 的 `skills/` 下新增目录，不删除、不移动任何既有内容。
