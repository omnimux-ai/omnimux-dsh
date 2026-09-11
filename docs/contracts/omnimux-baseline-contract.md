---
title: "OmniMux 通用底线与交互契约 (Baseline Contract)"
id: "contract-omnimux-baseline"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-11"
updated: "2026-09-11"
authors: ["architecture-group"]
subsystem: "global"
tags: ["baseline", "retry-ceiling", "path-immutability", "working-language"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/omnimux-contracts-architecture.md"
---

# OmniMux 通用底线与交互契约 (Baseline Contract)

> **权威等级**：L1（工程契约） | **生命周期**：持续演进 (Living)
> **适用角色**：`[orchestrator, video-producer, router, planner, executor]`

---

## 1. 资产物理路径不可变性 (Path Immutability)

- 任何由底层模型生成的音视频、图像、分镜物化文件，由 Hub 统一下发于当前会话或项目专属存储目录；
- **严禁重命名、移动或复制生成文件**。磁盘上的物理真实路径与返回的 `asset_id` 是资产血缘的唯一索引，前端播放器、时间线、资产中心均强依赖此绝对路径；
- 对用户友好的展示名称属于 Chat UI 呈现层，严禁落盘修改文件物理名称。

---

## 2. 失败重试熔断纪律 (Retry Ceiling)

- 任何工具调用或生成失败，**最多允许 3 次参数具备实质性差异的尝试**；
- 严禁使用相同或微调无关标点符号的参数反复重试；
- 遇底层平台级致命报错（如配额耗尽、通道下线、权限被拒），必须立即向用户抛出真实错误信息，并提供切换模型渠道或重试策略的结构化选项，严禁静默重试吞错。

---

## 3. 工作语言继承协议栈 (Working Language Discipline)

交互全流程必须严格受 `working_language`（缺省中文）约束，确保交付体验一致：
1. **裁决优先级**：
   - 优先级 1：当前轮次中用户的显式语言要求；
   - 优先级 2：当前轮次用户消息所使用的主要自然语言；
   - 优先级 3：当前 Web GUI 界面的活动语言环境；
   - 优先级 4：系统发布区域默认语言。
2. **执行边界**：
   - 回复正文、进度播报、分镜剧情描述、机位运镜解析、错误说明统一使用 `working_language`；
   - 严禁因底层知识库、外部模型响应体是英文，而自作主张把交付内容改为英文；
   - 内部 JSON Schema 键名、模型 ID、文件路径与代码标识符必须保持原样字面值。
