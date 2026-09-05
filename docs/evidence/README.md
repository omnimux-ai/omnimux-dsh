---
title: "实测与验证证据 (Evidence) 索引"
id: "index-evidence"
type: "index"
status: "living"
authority: "L3"
date: "2026-08-26"
updated: "2026-09-05"
authors: ["x", "agent-architect", "kou-douma"]
subsystem: "global"
---

# 实测与验证证据 (Evidence)

> **权威等级**：L3 | **生命周期**：不可变只读 (Immutable Evidence)

## 1. 目录职能
自动化测试、真机实测、基线度量与能力验证的客观证据记录。

## 1.1 模型证据命名规约（#530）

- **模板**：[`_template-model-evidence.md`](_template-model-evidence.md)（下划线前缀 = 非证据本体，不进下方索引矩阵）。
- **命名**：`YYYY-MM-DD-model-<id>-<op>.md`；日期 = 实测日期 = YAML `verifiedAt`（禁止后填）。
- **身份**：一 op 一文件；`<id>` 用 canonical runtime ID（alias 不单独出证据）；YAML `research.docUrl` 只能指向本 op 自己的文件。
- **四要素**：existence / minimal / boundary / mime-size-duration 缺一 → 该 op 不得 listed；§5 conclusion 二选一（可上架 / 不接）。
- 详细规约：[`docs/specs/2026-09-05-model-evidence-backfill-design.md`](../specs/2026-09-05-model-evidence-backfill-design.md) §3。

## 2. 索引矩阵 (Index Matrix)

| 状态 | 文件名 | 标题 | 模块 | 维护/生效日期 | 核心摘要 |
|---|---|---|---|---|---|
| `accepted` | [2026-09-05-astra-agent-guidance-audit.md](2026-09-05-astra-agent-guidance-audit.md) | GPT-6 Astra Agent 指令与工作流审计 | `global` | 2026-09-05 | #602 官方依据、全量入口覆盖、规则收敛与验证边界。 |
| `accepted` | [2026-09-05-plugin-suite-refactor-audit.md](2026-09-05-plugin-suite-refactor-audit.md) | 重构前审查证据 | `global` | 2026-09-05 | 246 条合并记录、源码热点、82 项选定回归、静态检查边界及既有文档错误。 |
| `accepted` | [2026-09-05-model-seedance-2-0-text_to_video.md](2026-09-05-model-seedance-2-0-text_to_video.md) | model evidence — seedance-2-0#text_to_video — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 C1 Seedance live t2v；token id 45；listed。 |
| `accepted` | [2026-09-05-model-seedance-2-0-first_frame.md](2026-09-05-model-seedance-2-0-first_frame.md) | model evidence — seedance-2-0#first_frame — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 C1 images[] live / mapper image 拒；不 listed。 |
| `accepted` | [2026-09-05-model-seedance-2-0-fast-first_frame.md](2026-09-05-model-seedance-2-0-fast-first_frame.md) | model evidence — seedance-2-0-fast#first_frame — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 C1 PNG/JPEG images[] live；mapper gap；不 listed。 |
| `accepted` | [2026-09-05-model-seedance-2-0-fast-video_multi_ref.md](2026-09-05-model-seedance-2-0-fast-video_multi_ref.md) | model evidence — seedance-2-0-fast#video_multi_ref — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 C1 multi_ref 1/2 图 live；listed max2。 |
| `accepted` | [2026-09-05-model-seedance-2-0-mini-text_to_video.md](2026-09-05-model-seedance-2-0-mini-text_to_video.md) | model evidence — seedance-2-0-mini#text_to_video — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 C1 新 runtime mini t2v live；listed。 |
| `accepted` | [2026-09-05-model-seedance-2-0-mini-first_frame.md](2026-09-05-model-seedance-2-0-mini-first_frame.md) | model evidence — seedance-2-0-mini#first_frame — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 C1 mini first_frame images[] live；mapper gap；不 listed。 |
| `accepted` | [2026-09-05-model-seedance-2-5-text_to_video.md](2026-09-05-model-seedance-2-5-text_to_video.md) | model evidence — seedance-2-5#text_to_video — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 C1 2.5 t2v live；listed。 |
| `accepted` | [2026-09-05-model-seedance-2-5-first_frame.md](2026-09-05-model-seedance-2-5-first_frame.md) | model evidence — seedance-2-5#first_frame — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 C1 2.5 first_frame images[] live；mapper gap；不 listed。 |
| `accepted` | [2026-09-05-model-seedance-2-5-video_multi_ref.md](2026-09-05-model-seedance-2-5-video_multi_ref.md) | model evidence — seedance-2-5#video_multi_ref — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 C1 2.5 multi_ref×1 live；listed max1。 |
| `accepted` | [2026-09-05-model-claude-opus-5-chat.md](2026-09-05-model-claude-opus-5-chat.md) | model evidence — claude-opus-5#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-claude-opus-4-6-chat.md](2026-09-05-model-claude-opus-4-6-chat.md) | model evidence — claude-opus-4-6#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-claude-opus-4-6-vision_chat.md](2026-09-05-model-claude-opus-4-6-vision_chat.md) | model evidence — claude-opus-4-6#vision_chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-gpt-5.6-sol-chat.md](2026-09-05-model-gpt-5.6-sol-chat.md) | model evidence — gpt-5.6-sol#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-gpt-5.6-sol-vision_chat.md](2026-09-05-model-gpt-5.6-sol-vision_chat.md) | model evidence — gpt-5.6-sol#vision_chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-gpt-5.5-chat.md](2026-09-05-model-gpt-5.5-chat.md) | model evidence — gpt-5.5#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-gpt-5.5-vision_chat.md](2026-09-05-model-gpt-5.5-vision_chat.md) | model evidence — gpt-5.5#vision_chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-grok-4.6-chat.md](2026-09-05-model-grok-4.6-chat.md) | model evidence — grok-4.6#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-grok-4.6-vision_chat.md](2026-09-05-model-grok-4.6-vision_chat.md) | model evidence — grok-4.6#vision_chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-kimi-k3-chat.md](2026-09-05-model-kimi-k3-chat.md) | model evidence — kimi-k3#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-kimi-k3-vision_chat.md](2026-09-05-model-kimi-k3-vision_chat.md) | model evidence — kimi-k3#vision_chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-deepseek-v4-pro-chat.md](2026-09-05-model-deepseek-v4-pro-chat.md) | model evidence — deepseek-v4-pro#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-deepseek-v4-flash-vision-exp-chat.md](2026-09-05-model-deepseek-v4-flash-vision-exp-chat.md) | model evidence — deepseek-v4-flash-vision-exp#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-deepseek-v4-flash-vision-exp-vision_chat.md](2026-09-05-model-deepseek-v4-flash-vision-exp-vision_chat.md) | model evidence — deepseek-v4-flash-vision-exp#vision_chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-gemini-3.7-flash-chat.md](2026-09-05-model-gemini-3.7-flash-chat.md) | model evidence — gemini-3.7-flash#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-gemini-3.7-flash-vision_chat.md](2026-09-05-model-gemini-3.7-flash-vision_chat.md) | model evidence — gemini-3.7-flash#vision_chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-gemini-3.1-pro-preview-chat.md](2026-09-05-model-gemini-3.1-pro-preview-chat.md) | model evidence — gemini-3.1-pro-preview#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-gemini-3.1-pro-preview-vision_chat.md](2026-09-05-model-gemini-3.1-pro-preview-vision_chat.md) | model evidence — gemini-3.1-pro-preview#vision_chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-09-05-model-glm-5.3-chat.md](2026-09-05-model-glm-5.3-chat.md) | model evidence — glm-5.3#chat — 2026-09-05 | `omnimux/catalog` | 2026-09-05 | #530 PR-A live chat-completions；token id 45；四要素齐全。 |
| `accepted` | [2026-08-31-workbench-split-live.md](2026-08-31-workbench-split-live.md) | Workbench split live QA — 2026-08-31 | `omnimux` | 2026-08-31 | 点「视频剪辑」不 claim overlay；对话/分栏/工作台写右栏几何。附件 png/json 同目录。 |
| `accepted` | [2026-08-27-web-plugin-pages-qa.md](2026-08-27-web-plugin-pages-qa.md) | Web Plugin Pages QA Evidence — 2026-08-27 | `global` | 2026-08-27 | - **Entry**: fork `yarn omnimux:dev start plugin-pages omnimux` |
| `accepted` | [2026-08-23-omnimux-brand-four.md](2026-08-23-omnimux-brand-four.md) | OmniMux live brand-four probe — 2026-08-23 | `global` | 2026-08-23 | Measured against `https://api.omnimux.ai/v1` with a real `OMNIMUX_API_KEY`. |
| `accepted` | [2026-08-23-omnimux-reader.md](2026-08-23-omnimux-reader.md) | OmniMux live reader evidence — 2026-08-23 | `global` | 2026-08-23 | No secrets below. Probe used a stored `OMNIMUX_API_KEY` against production. |
| `accepted` | [2026-08-20-omnimux-reasoning.md](2026-08-20-omnimux-reasoning.md) | OmniMux live reasoning-effort evidence — 2026-08-20 | `global` | 2026-08-20 | Measured against `https://api.omnimux.ai/v1/chat/completions` with a real |
| `accepted` | [2026-08-18-omnimux-modality.md](2026-08-18-omnimux-modality.md) | OmniMux live modality evidence — 2026-08-18 | `global` | 2026-08-18 | Measured against `https://api.omnimux.ai/v1/chat/completions` with a real |
| `accepted` | [2026-08-16-omnimux-image.md](2026-08-16-omnimux-image.md) | OmniMux live image evidence — 2026-08-16 | `global` | 2026-08-16 | `scripts/verify-omnimux-image-live.mjs` → `executeOmnimuxImage`. No secrets below. |
| `accepted` | [2026-08-15-e2e-dsh.md](2026-08-15-e2e-dsh.md) | dsh e2e generate — 2026-08-15 | `dsh-drama` | 2026-08-15 | Real `dsh --profile drama` session generated `e01-s01` through the `videoGenerate` seam. No secrets. |
| `accepted` | [2026-08-14-omnimux-video.md](2026-08-14-omnimux-video.md) | OmniMux live video evidence — 2026-08-14 | `dsh-video` | 2026-08-14 | One `POST /v1/video/generations` via `scripts/verify-omnimux-live.mjs` → `executeOmnimuxVideo`. No s |
