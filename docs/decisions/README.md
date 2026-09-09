---
title: "架构决策记录 (ADR / Decisions) 索引"
id: "index-decisions"
type: "index"
status: "living"
authority: "L2"
date: "2026-08-26"
updated: "2026-09-09"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# 架构决策记录 (ADR / Decisions)

> **权威等级**：L2 | **生命周期**：不可变只读 (Immutable Records)

## 1. 目录职能
重大架构决议与技术选型裁定。历史决议不可篡改，若有升级仅通过新增补丁决议替代。

> **流程版本边界（2026-09-09 / #864）：** 历史决议中的 L2 独立运行环境、生命周期与合入前浏览器验收要求已退役。现行流程见 [dev-pipeline](../contracts/dev-pipeline.md) 与 [plugin-qa](../contracts/plugin-qa.md)；文档 authority、工具/UI 层级 L2 不受影响，历史结果不重标。

## 2. 索引矩阵 (Index Matrix)

| 状态 | 文件名 | 标题 | 模块 | 维护/生效日期 | 核心摘要 |
|---|---|---|---|---|---|
| `accepted` | [2026-09-04-agent-workbench-bidirectional-sync.md](2026-09-04-agent-workbench-bidirectional-sync.md) | 决策：Agent 页面感知与工作台双向协同（信封注入 + Hub SSE 总线） | `omnimux` | 2026-09-04 | Q1 双通道（composer `<ui_context>` 前缀 + viewport mailbox）；Q2 Hub 单路 SSE，禁止垂直私有连接；切页禁止 setFocus。 |
| `accepted` | [2026-08-31-workbench-split.md](2026-08-31-workbench-split.md) | 决策：工作台挂 dsh-better-sidebar，库页留 overlay，对话不卸载 | `omnimux` | 2026-08-31 | 不发明三栏壳；焦点 = 右栏几何；跨插件走 `window.__omnimuxWorkbench`。 |
| `accepted` | [2026-08-30-workflow-artifacts-not-in-git.md](2026-08-30-workflow-artifacts-not-in-git.md) | 决策：omnimux-workflow 生成物不进 Git，源码为唯一真相 | `omnimux-workflow` | 2026-08-30 | `dist/` 与 `lib/client.js` / `lib/canvas.js` 现场 build，禁止为跟仓另开 PR。 |
| `accepted` | [2026-08-30-physical-materialization.md](2026-08-30-physical-materialization.md) | 决策：画布与资产库 100% 物理实体化 | `omnimux-workflow` | 2026-08-30 | 废止零拷贝 `real_path` 作为画布/主体库持久化策略；受管副本可随记录回收。 |
| `accepted` | [2026-08-27-adopt-dsh-native-ui-system.md](2026-08-27-adopt-dsh-native-ui-system.md) | 决策：全面适配 DeepSeek Harness 原生 UI 规范，彻底废除外部主题覆盖层 | `omnimux` | 2026-08-27 | OmniMux 系列全量插件（Hub、Accounts、Assets、Products、Inspiration、Workflow、Clip、Publish 等）**100% 回归并严格消费 DeepS |
| `accepted` | [2026-08-27-unified-shared-auth-config.md](2026-08-27-unified-shared-auth-config.md) | 决策：OmniMux 统一共享复用认证配置落地方案（极简纯文件标准） | `omnimux` | 2026-08-27 | 日期：2026-08-27。 |
| `superseded` | [2026-08-26-l2-in-progress-plugin-cap.md](2026-08-26-l2-in-progress-plugin-cap.md) | 决策：L2 在研插件仍保持「每个 profile link ≤ 1」 | `omnimux-assets` | 2026-09-09 | L2 独立环境及单 link 门槛退役，现行流程见 dev-pipeline。 |
| `superseded` | [2026-08-26-l2-restart-host-session-semantics.md](2026-08-26-l2-restart-host-session-semantics.md) | 决策：L2 restart-host 保端口与磁盘，不保浏览器会话 | `omnimux` | 2026-09-09 | L2 生命周期退役；Dev 重启仍按现行授权与占用协调边界。 |
| `accepted` | [2026-08-26-ops-entry-authority.md](2026-08-26-ops-entry-authority.md) | 决策：运维命令权威入口仍是 fork yarn omnimux: | `omnimux` | 2026-08-26 | 日期：2026-08-26。 |
| `superseded` | [2026-08-21-gxgen-capability-plugin.md](2026-08-21-gxgen-capability-plugin.md) | Gxgen 微服务 → OmniMux 能力插件 | `omnimux-video` | 2026-08-21 | 引擎客户端方案已由 [dsh-video-plugin](../contracts/dsh-video-plugin.md) 的自包含本地执行方案取代；原 ADR 保留历史理由。 |
| `superseded` | [2026-08-21-xai-full-shell-theme.md](2026-08-21-xai-full-shell-theme.md) | 决策：全壳 x.ai 品牌染色（overrideTokens 渲染官方 --dsw-） | `omnimux` | 2026-08-21 | 日期：2026-08-21。 |
| `accepted` | [2026-08-16-harness-consume-not-fork.md](2026-08-16-harness-consume-not-fork.md) | 决策：消费官方 dsh，不整仓 fork | `omnimux` | 2026-08-16 | 日期：2026-08-16。 |
| `accepted` | [2026-08-16-hub-io-and-facilities.md](2026-08-16-hub-io-and-facilities.md) | 决策：执行中枢 I/O 与落地设施 | `omnimux` | 2026-08-16 | 日期：2026-08-16。 |
| `accepted` | [2026-08-16-hub-owns-core.md](2026-08-16-hub-owns-core.md) | 决策：中枢拥有全部 OmniMux 核心能力 | `omnimux` | 2026-08-16 | 日期：2026-08-16。 |
| `accepted` | [2026-08-14-execution-hub.md](2026-08-14-execution-hub.md) | 决策：执行中枢与领域插件 | `omnimux` | 2026-08-14 | 日期：2026-08-14。 |
