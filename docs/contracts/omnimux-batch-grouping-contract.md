---
title: "OmniMux 批量产物自动栅格化成组契约 (Batch Grouping Contract)"
id: "contract-omnimux-batch-grouping"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-11"
updated: "2026-09-11"
authors: ["architecture-group"]
subsystem: "global"
tags: ["batch-grouping", "grid-layout", "state-machine"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/omnimux-contracts-architecture.md"
  - "docs/contracts/ui-design-guidelines.md"
---

# OmniMux 批量产物自动栅格化成组契约 (Batch Grouping Contract)

> **权威等级**：L1（工程契约） | **生命周期**：持续演进 (Living)
> **适用角色**：`[orchestrator, video-producer]`

---

## 1. 单轮多产物自动栅格化成组 (Current-Turn Auto-Group)

- 在多模态创意生产中，当单轮次操作产出了 **≥ 2 个同类生成产物**（如：生成 4 款不同机位的 Hook 镜头候选、批量生成 6 张小红书轮播图卡片、或者多角度商品首帧对比）：
  - Agent 在结束本轮交互前，必须将这批产物按逻辑组（Logical Group）聚合封装；
  - 自动赋予一个紧凑明确的分组标签（例如：`"镜头3候选首帧 (4组对比)"`、`"小红书轮播卡片 (6P)"`）；
  - 在前端 UI 中自动呈现为对比栅格布局（Comparison Grid）或结构化手风琴组件，避免多个孤立卡片铺满聊天界面造成视觉混乱；
- 单产物输出轮次严禁触发成组逻辑。

---

## 2. 显式成组与解组优先级 (Explicit Grouping & Dissolution)

- **显式指令最高**：用户明确提出“把这几张图归入一组”或“把第 2 组解散”时，显式指令优先于自动行为；
- **解组物理保活**：解组操作仅解散逻辑容器（Group Container），底层具体的媒体资产物理文件、时间线轨道和关联数据绝不可被连带删除。
