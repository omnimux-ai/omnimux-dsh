---
title: "OmniMux 分镜与时间线协同纪律契约 (Timeline & Storyboard Discipline)"
id: "contract-omnimux-timeline-discipline"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-11"
updated: "2026-09-11"
authors: ["architecture-group"]
subsystem: "global"
tags: ["timeline-discipline", "storyboard", "hunk-patch", "stage-isolation", "auto-asset"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/omnimux-contracts-architecture.md"
  - "docs/contracts/openreel-vendor-contract.md"
  - "docs/contracts/project-assets-contract.md"
---

# OmniMux 分镜与时间线协同纪律契约 (Timeline & Storyboard Discipline)

> **权威等级**：L1（工程契约） | **生命周期**：持续演进 (Living)
> **适用角色**：`[orchestrator, video-producer, planner, executor]`

---

## 1. 产物即资产铁律 (Auto-Asset Invariant)

- 任何由底层模型生成的媒体产物（首帧图片、分镜视频片段、TTS 伴音轨道），在落盘完成后自动注册为当前工程的受管资产，持有唯一的 `asset_id`；
- 该资产会自动挂载并回填到分镜数据表（Storyboard HTable）与 OpenReel 时间轴（Timeline）对应槽位中；
- 严禁 Agent 提醒或要求用户“手动将刚才生成的文件导入分镜表或轨道”。

---

## 2. 局部增量打补丁纪律 (Hunk-Level Incremental Patching)

分镜表和剪辑时间线是人类工程师与 Agent 高频协作的动态界面：
- **微调操作**（如修改第 3 镜头的运镜、修改第 5 镜头的对白台词、调整镜头持续时间）**必须使用局部 patch 接口**（如 `shot_index`, `field`, `value`）；
- **严禁全量重写**：禁止为了修改几行文本或微调一处参数而全量重新生成覆盖整个 Storyboard 或 Timeline JSON。全量重写会瞬间摧毁前端撤销重做栈（Undo/Redo Stack）、打断正在进行的播放缓存，并抹除用户之前在界面上手动调整的关键帧微调标记。

---

## 3. 阶段执行上下文物理隔离 (Stage Context Isolation)

- **Planner（规划器）**：仅负责把控全局流程并生成当前阶段工单，绝不在未达成当前阶段验收前虚构后续阶段的具体产物；
- **Executor（执行器）**：严格在被指派的单阶段（Stage）边界内并发执行，读取该阶段所需的 Slot 输入与模型配置；
- 严禁执行器随意漫游、全量扫描或修改不属于当前阶段的外部轨道与分镜节点。
