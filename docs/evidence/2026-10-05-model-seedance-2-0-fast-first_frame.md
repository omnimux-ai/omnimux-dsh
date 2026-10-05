---
title: "model evidence — seedance-2-0-fast#first_frame — 2026-10-05"
id: "evidence-model-seedance-2-0-fast-first_frame-20261005"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-05"
authors: ["dsh-agent"]
subsystem: "omnimux/catalog"
tags: ["model-evidence", "listing", "video", "seedance", "issue-3152"]
---

# model evidence — seedance-2-0-fast#first_frame — 2026-10-05

## 0. 身份（Identity）
| 字段 | 值 |
|---|---|
| runtime ID | `seedance-2-0-fast`（wire alias：`seedance-2.0-fast`） |
| operation | `first_frame` |
| 契约位置 | `plugins/omnimux/src/catalog/specs/video-models.yaml` |
| 探测环境 | Darwin / Node v25.8.0 / live key 注入：`omnimux tokens exec 48 --yes --timeout=900 -- env OMNIMUX_API_KEY=__OMNIMUX_TOKEN_48__`；**禁止记录 key 值** |
| 映射契约 | `videoGenerate` 的 `operationVendorShapes.first_frame`：`require: [image_with_roles]` |
| 实测者 / 署名 | dsh-agent |

## 1. 为什么重做（旧证据的结论已过期）

`docs/evidence/2026-09-05-model-seedance-2-0-fast-first_frame.md` §5 的结论是「**不接**」，
理由是：singular `image`（string）live 400；`images` 数组可 terminal success；**但当时 Hub mapper 仍发 `image`**。

此后 #2848 把视频映射改为网关新契约，`first_frame` 必填 `image_with_roles`。
即旧结论的前提（映射器发错字段）**已不成立**，必须用当前映射器重新取证。

## 2. minimal（最小生成）—— 通过

- 走真实执行缝隙（`executeOmnimuxMedia('video', …)`，`mode: live`），操作 `first_frame`，
  参考图经缝隙自行 presign/上传换公网 HTTPS 直链，映射器发 `image_with_roles`。
- 输入：prompt 固定短句；duration=4；resolution=480p；aspectRatio=16:9；1 张参考图。
- 结果：**`mode: live`；taskId `task_9IdlqaCNGBRWB3LPeQldw3XEGKG3dzGi`；产物 690 277 字节；elapsedMs=141 127。**

结论：**当前映射器下该操作端到端可用**，旧「不接」结论作废。

## 3. boundary（输入数量与角色边界）

| 维度 | 实测 | 说明 |
|---|---|---|
| 角色 | `first_frame` | 传 `role: reference` 会被缝隙拒收（`asset role reference does not match slot role first_frame`），必须用槽位角色 |
| 参考图宽度 | 96px → **上游 400** | `CreateAsset API error: code=InvalidParameter.WidthTooSmall, message=Width must be between 300px and 6000px.` |
| 参考图宽度 | 512px → 通过 | 本次成功所用尺寸 |
| 参考图数量 | 1 | 首帧语义即单帧；`max=1` 与实现一致 |

**新增可复用事实**：上游私有素材接口要求图片宽度 **300–6000px**，小于 300px 会在建素材阶段直接 400，
表现为「上游生成失败」而非参数校验错误。测试用小图（如 96px）会误判为通路故障。

## 4. mime-size-duration
- 本次只验证通路可用性，未撞体积/时长拒绝点；契约中的 `maxSizeMb` 与时长档位保持既有 `official_docs` / `policy_conservative` 标注。
- 已知边界（沿用 2026-09-05 证据，未在本次重复烧费用）：duration 低于 4s → 上游 400。

## 5. conclusion（结论）
- **接入（admission）**：`seedance-2-0-fast#first_frame` 在当前映射契约下 live 成功。
  本证据只证明本模型本操作，**不得**挪用于 `seedance-2-0` / `seedance-2-0-mini` / `seedance-2-5`（同族 SKU 禁互背书）。
- 计费：本次一次调用，费用以网关返回为准（本模型 standard 组按秒计费、cheap 组按条计费）。
