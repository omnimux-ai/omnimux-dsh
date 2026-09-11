---
title: "OmniMux 常驻行为契约系统架构与治理规范"
id: "contract-omnimux-contracts-architecture"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-11"
updated: "2026-09-11"
authors: ["architecture-group"]
subsystem: "global"
tags: ["agent-contracts", "always-on", "anti-loop", "semantic-judgment", "timeline-discipline", "batch-grouping"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/multimodal-creative-agent-architecture.md"
  - "docs/contracts/plugin-agent-tools-inventory.md"
  - "docs/contracts/docs-governance-standard.md"
---

# OmniMux 常驻行为契约系统架构与治理规范

> **权威等级**：L1（工程契约） | **生命周期**：持续演进 (Living)
> **适用范围**：OmniMux 多模态社媒全链路运营 Agent 体系与全量插件调度上下文。

---

## 1. 契约架构总览与设计哲学

在长链条多模态创意内容生产中，单体长 Prompt 必然导致规则漂移、死循环重试与上下文污染。OmniMux 吸收工业级工程最佳实践，采用**四层渐进式知识金字塔与常驻行为契约（Always-On Contracts）**解耦体系：

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 1: Core Persona (角色微内核, ≤ 80 行)                            │
│ 纯粹的身份定义、主权定位、双轨分流准则、权限与安全防线。                   │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 2: Living Contracts (常驻行为契约, 单个 ≤ 100 行) [本文档重点]    │
│ 启动期 / 运行时由 contracts-loader 靶向缝合入 System Prompt：           │
│ • baseline: 资产路径不变性、3次异参重试熔断、working_language 裁决栈    │
│ • anti-loop: 前置自检对照表 + LoopGuard 5步3击运行时硬门禁             │
│ • semantic-judgment: 多模态素材输入五角色与 take/adapt/ignore 决策流    │
│ • timeline-discipline: 分镜与剪辑工程 Hunk 增量修改、生成物即资产     │
│ • batch-grouping: 批量生成多候选自动成组栅格化排版展示                 │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 3: Micro Knowledge Cards (微型专业知识卡片, 单个 ≤ 50 行)         │
│ • 平台算法卡 (Playbooks): TikTok / 小红书 / YouTube Shorts 节拍与规范  │
│ • 厂商编译卡 (Vendors): 真实模型语法与 4 维正交机位适配                │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 4: Workflow Topologies (流水线 DAG 模板库)                       │
│ 爆款视频复刻模板、小红书图文轮播模板、TVC 广告影视模板                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 动态缝合与路由机制 (Targeted Staging Invariant)

1. **物理目录**：微内核契约源码统一定义于 `plugins/omnimux/src/agents/contracts/*.md`。
2. **靶向分发 (Per-Agent Routing)**：每个 contract 文件头部必须包含 YAML frontmatter：
   ```yaml
   ---
   name: semantic-judgment
   agents: [orchestrator, video-producer, executor]
   ---
   ```
3. **零上下文浪费**：由 `contracts-loader.js` 统一解析，仅对目标 Agent（或通配符 `*`）拼接对应的 `<contract name="...">...</contract>` 结构，常驻挂载到 `ctx.systemPrompt.section({ name: 'omnimux-contracts', order: 20 })`。

---

## 3. 五大常驻微契约职能矩阵

| 契约分册 | 目标角色 | 核心铁律 |
|---|---|---|
| **`baseline`** | `[orchestrator, video-producer, router, planner, executor]` | 路径不可变性（严禁私自改名移动）；最多 3 次异参重试；`working_language` 级联裁决。 |
| **`anti-loop`** | `[orchestrator, video-producer, router, planner, executor]` | 工具调用前自省；死循环替代策略表；配合 Hub `LoopGuard`（5 步内 3 次同指纹即硬熔断）。 |
| **`semantic-judgment`** | `[orchestrator, video-producer, executor]` | 意图四级优先级；素材 5 维角色解耦；五维决策流；Prompt 纯净化（禁负词、禁无意义美学废话）。 |
| **`timeline-discipline`** | `[orchestrator, video-producer, planner, executor]` | 生成产物自动入库为资产；分镜/时间线必须走局部 Hunk Patch，禁止全量覆写破坏撤销栈。 |
| **`batch-grouping`** | `[orchestrator, video-producer]` | 单轮多产物自动栅格化成组聚合展示；显式成组/解组状态机。 |

---

## 4. 治理与演进规则

- **篇幅红线**：每个常驻微契约严格控制在 100 行以内，严禁将具体模型参数或平台算法长篇塞入微契约。
- **静态与动态测试**：新增或修改契约必须通过 `contracts-loader.test.js` 与 `loop-guard.test.js` 自动化测试。
