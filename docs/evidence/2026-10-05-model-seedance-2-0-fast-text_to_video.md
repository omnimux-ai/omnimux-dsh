---
title: "model evidence — seedance-2-0-fast#text_to_video — 2026-10-05"
id: "evidence-model-seedance-2-0-fast-text_to_video-20261005"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-05"
authors: ["dsh-agent"]
subsystem: "omnimux/catalog"
tags: ["model-evidence", "listing", "video", "seedance", "issue-3152"]
---

# model evidence — seedance-2-0-fast#text_to_video — 2026-10-05

## 0. 身份（Identity）
| 字段 | 值 |
|---|---|
| runtime ID | `seedance-2-0-fast` |
| operation | `text_to_video` |
| 契约位置 | `plugins/omnimux/src/catalog/specs/video-models.yaml` |
| 探测环境 | Darwin / Node v25.8.0 / live key 注入：`omnimux tokens exec 48 --yes --timeout=900`；**禁止记录 key 值** |
| 线上字段 | 仅 prompt 与参数（无参考素材） |
| 素材槽位角色 | 无 |
| 实测者 / 署名 | dsh-agent |

## 1. 为什么重做
本模型此前未上架，原因是模型级 `research.status=draft`（操作级状态继承模型级）。
旧证据（2026-09-05 批次）的结论建立在**当时**的映射契约上；#2848 已把视频映射改为网关新契约，
故必须以**当前**映射器重新取证，不能沿用旧结论。

## 2. minimal（最小生成）—— 通过
- 走真实执行缝隙（`executeOmnimuxMedia('video', …)`，`mode: live`），操作 `text_to_video`。
- 输入：prompt 固定短句；duration=4；resolution=480p；aspectRatio=16:9；无参考素材。
- 结果：**`mode: live`；taskId `task_R0xz7DFPMMiY7IYtYfqJGLXS6otmRKbx`；产物 1087142 字节；elapsedMs=157575。**

结论：当前映射器下该操作端到端可用。

## 3. boundary（边界）
- 角色必须与槽位一致：传错角色会被缝隙拒收（`asset role … does not match slot role …`）。
- 参考图宽度：上游私有素材接口要求 **300–6000px**；小于 300px 在建素材阶段直接 400，
  表现为「上游生成失败」而非参数校验错误（本批在 `seedance-2-0-fast#first_frame` 上实测到该拒绝点）。
- 本操作未撞体积/时长拒绝点；契约中的体积与时长上限保持既有 `official_docs` / `policy_conservative` 标注。

## 4. conclusion（结论）
- **接入（admission）**：`seedance-2-0-fast#text_to_video` 在当前映射契约下 live 成功。
  本证据只证明**本模型本操作**，不得挪用于同族其它 SKU（一操作一文件，同族禁止互背书）。
