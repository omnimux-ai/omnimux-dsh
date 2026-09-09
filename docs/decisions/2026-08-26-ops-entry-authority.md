---
title: "决策：运维命令权威入口仍是 fork yarn omnimux:"
id: "decision-ops-entry-authority"
type: "decision"
status: "accepted"
authority: "L2"
date: "2026-08-26"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# 决策：运维命令权威入口仍是 fork `yarn omnimux:*`

> **命令表部分 SUPERSEDED — 2026-09-09 / #864：** fork 权威入口原则保留；下文 L2/`dev` 生命周期、合入前运行环境与默认生产同步描述不再适用。当前命令和 Dev 默认目标见 [ops-entry](../contracts/ops-entry.md) 与 [dev-pipeline](../contracts/dev-pipeline.md)。旧命令表仅作历史追溯，不要求外仓保留已退役入口。

日期：2026-08-26。
状态：**已确认（审计修订）。**
性质：否决 `spec-plugin-dx-pipeline.md` v1.0.0 G1「唯一心智入口改到 dsh-plugin 根 npm scripts」。对照合同 [ops-entry.md](../contracts/ops-entry.md)。
依据：2026-08-26 工程保障审计（Archi / Docu；原稿未入库）。对照合同 [ops-entry.md](../contracts/ops-entry.md)。

## 结论

**对外权威入口保持** `/Users/x/Desktop/Project/omnimux-desktop-fork` 的 `yarn omnimux:*`。

`dsh-plugin` 根目录的 `node scripts/omnimux.mjs` / `npm run dev|sync|doctor` 是 **同等 argv 的 Agent 便利转发**，**禁止再称为「唯一入口」**。两份 `omnimux.mjs`（fork 与 dsh-plugin 根）必须同子命令、同帮助文本、同安全守卫。

文档、DoD、测试矩阵 **禁止直调** `./scripts/dev-env.sh`。写 `yarn omnimux:dev …` 或（Agent 在源码仓时）`node scripts/omnimux.mjs dev …`。

## 为何保留 fork 权威

- 桌面发版 / `stage` / `package:dev` 仍在 fork
- `ops-entry.md` 明文「对外命令只暴露 fork 的 `yarn omnimux:*`」，并禁止文档再教人直调真源 bash
- 根 `AGENTS.md` 已允许 Agent 在 `dsh-plugin` 跑根 CLI——这是便利，不是第二套合同
- G1 的合理部分（Agent 不必 `cd` 到 fork）**已经存在**，不需要再立第二套权威

## 否决

| 方案 | 为何否决 |
|---|---|
| 把「唯一心智入口」改到 `dsh-plugin` 根 `npm run *` | 与 ops-entry 互斥；fork 门面仍是单插件 argv 时两套入口行为分叉 |
| 用缩减 `package.json` 片段替换现有 scripts | 会删掉现网 `restart` / `restart:dev` / `restart:prod` / `stage` / `package:dev` |
| DoD 写 `npm run dev --help` | npm 会吞掉 `--help`，打印的是 npm 自己的 help |
| 验收/文档直调 `dev-env.sh restart-host` | 违反 ops-entry「禁止教人直调真源」 |

## 命令字典（冻结）

对外动词只有一套。**禁止**把 L2 Host 重启写成裸 `dev restart`（现网 `restart` 是杀桌面 App，Agent 严禁）。

| 对外（权威） | Agent 便利转发（同等 argv） | 含义 |
|---|---|---|
| `yarn omnimux:dev start <task> <plugin>` | `node scripts/omnimux.mjs dev start <task> <plugin>` | 启 L2，**一个**在研插件 |
| `yarn omnimux:dev watch <task> <plugin>` | 同上 `dev watch` | 换 watch，Host 不停 |
| `yarn omnimux:dev restart-host <task>` | 同上 `dev restart-host` | 只重启该 task 的 L2 Host（见会话语义 ADR） |
| `yarn omnimux:dev stop\|ls\|rm` | 同上 | 停 / 列 / 删任务子根 |
| `yarn omnimux:sync [插件…]` | `node scripts/omnimux.mjs sync` | 物化进生产 profile，不重启进程 |
| `yarn omnimux:doctor` | `node scripts/omnimux.mjs doctor` | 三层合规 |
| `yarn omnimux:help` | `node scripts/omnimux.mjs help` | 帮助（**不是** `npm run dev --help`） |
| `yarn omnimux:restart [prod\|dev]` | `node scripts/omnimux.mjs restart …` | **仅人类**；Agent fail-closed |

`package.json` **只做加法**（可加 `build:all`）。不得整段替换、不得删 `restart*` / `stage` / `package:dev`。

新增命令必须 **同一 PR** 改：

1. fork `scripts/omnimux.mjs` `printHelp()` + `package.json` `omnimux:*`
2. `dsh-plugin/scripts/omnimux.mjs` `printHelp()`
3. [ops-entry.md](../contracts/ops-entry.md)
4. 产品树 `AGENTS.md`、根 `AGENTS.md`、fork `AGENTS.md`（若存在）

## 对实施计划的约束

- TASK 标题不得写「将根目录 CLI 打造为唯一开发入口」
- 帮助验收：`node scripts/omnimux.mjs help` 与 `yarn omnimux:help`
- `check:all` 无实现脚本则 **禁止** 挂路由；不要与 `doctor` 再造同名心智
