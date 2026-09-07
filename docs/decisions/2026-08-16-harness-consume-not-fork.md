---
title: "决策：消费官方 dsh，不整仓 fork"
id: "decision-harness-consume-not-fork"
type: "decision"
status: "superseded"
authority: "L2"
date: "2026-08-16"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# 决策：消费官方 dsh，不整仓 fork

> 2026-09-06：本文保留历史证据；其中允许官方源码补丁及重放补丁的条款已由 [现行只读消费合同](../harness-pin.md) 和 [#668 退役合同](../contracts/quota-error-compatibility.md) 替代，不得再作为执行授权。

日期：2026-08-16。
状态：**站位已确认。**
性质：对 [2026-08-16 中枢拥有全部核心能力](2026-08-16-hub-owns-core.md)「不 fork harness」的展开。仓规入口是根 `AGENTS.md`。活 pin：[docs/harness-pin.md](../harness-pin.md)。

依据：同日会话（官方 clone 脏树审计 → 否决整仓 fork → 版本单位定为 pin × 产品仓 × 补丁）。

## 结论

OmniMux 消费官方 `deepseek-ai/deepseek-harness`，不创建也不维护它的 git 分叉。产品真源是本仓插件与独立桌面仓 `/Users/x/Desktop/Project/omnimux-desktop`。官方 clone 只当上游只读树和本机构建输入。

版本单位是三层，不是「一棵 OmniMux 化的 harness」：

| 层 | 记什么 | 谁拥有 |
|---|---|---|
| 官方 pin | npm 版或 SHA | [docs/harness-pin.md](../harness-pin.md) |
| 产品仓 | 本仓与桌面各自的 git tag | `omnimux-dsh`；`/Users/x/Desktop/Project/omnimux-desktop` |
| 相对 pin 的补丁 | `patches/<pin>/` | 本仓。官方一旦提供等价物就删 |

禁止把换标、登录、模型路由、Apps 业务写进官方 `packages/`。允许的官方源码改动只有「任何插件都用得上的通用座位」，且必须以本仓补丁存在，不得以官方 clone 的未提交 diff 当主场。

## 碰官方源码的门

过不了就停在插件：

1. 现有座位 / hook / config 能否完成？能则只写插件。
2. 官方是否已有同名或同职责实现？有则对齐，删本地补丁。
3. 缺的是不是任何插件都用得上的洞？是则可以补丁化，只加座位。
4. 缺的是不是 OmniMux 身份（标、登录、模型、中枢 UI）？是则只进 `plugins/dsh-omnimux/`。

「应用」走官方已有的 `sidebar.footer.action`（设置上方）。不在官方壳上新开「新会话下方」座位。曾写过的 `sidebar.lead.action` 补丁已删除。

桌面壳是官方没有的新产品面，不是 fork。家在 `/Users/x/Desktop/Project/omnimux-desktop`。不得再写回官方 clone 的 `apps/desktop/`。

## 否决

| 方案 | 为何否决 |
|---|---|
| GitHub / 长期分叉整棵 `deepseek-harness` | 预览期官方不保证兼容；每次上游推进都是整仓 merge；产品身份焊进别人的树 |
| 在官方 `master` 上开产品分支当发版线 | 与整仓 fork 同类：上游抖动变成产品历史 |
| 把 OmniMux 身份写进官方 `packages/` | 已否决：见 hub-owns-core |
| 为按钮位置改 loop / session / compaction / LLM | 8-14 失败条件；插件已能挂现有座位 |
| 改官方 `ui-sidebar` 新开 `sidebar.lead.action` | 官方已有 `sidebar.footer.action`；设置上方更合适 |
| 向上游提功能 PR | 本仓 `AGENTS.md` 禁止；官方 `CONTRIBUTING` 现亦不收外部功能 PR |

## 升级官方

仪式在 [docs/harness-pin.md](../harness-pin.md)。换 pin → 重放补丁 → 冒烟 → 产品自己打 tag。不为了「跟上 master」而升。

> 2026-08-22 注：桌面壳已于 2026-08-21 切换为 fork 线（`omnimux-desktop-fork`，fork 自 anywhere-labs），旧 slim 壳 `omnimux-desktop` 归档为只读参考；本文为其时决策，路径以 [dev-pipeline.md](../contracts/dev-pipeline.md) 为准。
