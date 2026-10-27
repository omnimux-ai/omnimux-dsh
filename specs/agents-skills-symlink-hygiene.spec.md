# agents-skills 软链入库修复

Issue: 无独立 Issue（由 #3817 排查中发现，用户直接指派）
Track: D · Risk: R1 · Base: origin/main

## 目标

`.agents/skills/` 的「指向仓外个人资产库的软链不入库」约定在仓内被破坏两处，修复它们，并补一条可执行门禁防止再次漂移。

## 现状

`.agents/skills/` 共 7 个条目，5 个入库、2 个被忽略：

| 条目 | 类型 | 入库 | 指向 |
| --- | --- | --- | --- |
| `omnimux-form-authoring` | 真实目录 | 是 | — |
| `omnimux-rc-upgrade` | 真实目录 | 是 | — |
| `omnimux-repo-workflow` | 真实目录 | 是 | — |
| `tiktok-drama-center` | 真实目录 | 是 | — |
| `dsh-plugin-dev` | 软链 | **是（错误）** | `/Users/x/Desktop/Project/OPC/资产库/skills/opc-skills-dsh-plugin-dev` |
| `hallmark` | 软链 | 否 | 同上资产库 |
| `short-drama-router` | 软链 | 否 | 同上资产库 |

`.gitignore` 第 18-20 行的既有约定原文：「本机符号链接，指向仓外 OPC 资产库，仅开发机可用。」

## 两个缺陷

1. **`dsh-plugin-dev` 破了约定**：软链内容是本机绝对路径，任何人 clone 都是断链。来源 `602165691 wip: batch pending workspace changes`（69 文件批量误提交，2026-08-20）。
2. **`.gitignore` 有僵尸规则**：`dsh-plugin-guide` 指向的软链磁盘上不存在，但该技能历史上曾作为真实目录提交过（`5edb3d46e`）。规则留下、文件消失，属于会误导后来者的死条目。

## 范围

- `git rm --cached .agents/skills/dsh-plugin-dev`（保留本地软链，只取消跟踪）
- `.gitignore` 增加 `dsh-plugin-dev`、`hallmark` 两条忽略；删除 `dsh-plugin-guide` 僵尸条目
- 新增 `scripts/verify-agents-skills-symlinks.mjs` + 单测：仓库内不得跟踪指向仓外的软链；`.gitignore` 不得出现指向不存在条目的 `.agents/skills/*` 规则
- 更新 `docs/evidence/2026-09-05-astra-agent-guidance-audit.md` 中「跟踪的 dsh-plugin-dev 是外部共享源软链接」这一现已失实的表述

## 非目标

- 不动任何真实目录技能（4 个仓库自有技能保持入库）
- 不改资产库真源内容
- 不引入把仓外技能复制进仓的替代方案

## 假设

`.agents/skills/` 下的软链是开发机专属的便利入口，指向仓外 OPC 资产库；仓外绝对路径无法在他人机器解析，因此这类条目必须靠 `.gitignore` 排除，而不是入库。真实目录技能属于仓库自有资产，必须入库。

## 证伪方式

若 `git ls-files -s .agents/skills` 仍出现 mode 为 `120000` 且目标为绝对路径的条目，或 `.gitignore` 中仍有指向不存在路径的 `.agents/skills/*` 规则，或新门禁在干净 checkout 上无法复现「跟踪了仓外软链」的失败，则本实现失败。另需验证移除跟踪后本地软链仍可用（`ls .agents/skills/dsh-plugin-dev/` 可读）。

## 验收

- [ ] `git ls-files -s .agents/skills` 无仓外绝对路径软链
- [ ] 4 个真实目录技能仍全部入库
- [ ] `.gitignore` 无僵尸 `.agents/skills/*` 规则
- [ ] 新门禁可执行并给出计数，且能在含违规条目的 fixture 上失败
- [ ] 本地软链移除跟踪后仍可用

## 旧标准变更

- `scripts/verify-agents-skills-symlinks.test.mjs` :: `escapesRepo：绝对路径与逃出仓库的相对路径都算逃出`

  **原断言**：`escapesRepo(linkPath, target)` 双参数调用，以 `process.cwd()` 隐式作为仓库根。

  **必须改的理由**：该用例是本任务本次新建的草稿，实现落地时发现 `escapesRepo` 原实现用 `resolve('.')` 当仓库根，导致相对路径逃逸判定依赖测试进程的当前目录 —— 在仓库根之外的 cwd 下会误判。同一任务内为修正实现缺陷而调整断言，不是削弱既有外部契约。

  **新期望证据**：`escapesRepo(linkPath, target, root)` 显式接收仓库根；用例固定 `root = '/repo'`，断言 `'../../outside'` 逃出、`'./sibling'` 与 `'../skills/y'` 不逃出、绝对路径一律逃出。断言数量与覆盖的四种情形不变。

