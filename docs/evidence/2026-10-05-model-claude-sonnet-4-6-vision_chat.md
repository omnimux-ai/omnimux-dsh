---
title: "model evidence — claude-sonnet-4-6#vision_chat — 2026-10-05"
id: "evidence-model-claude-sonnet-4-6-vision-chat-20261005"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-05"
authors: ["dsh-agent"]
subsystem: "omnimux/catalog"
tags: ["model-evidence", "backfill-530", "text", "vision"]
---

# model evidence — claude-sonnet-4-6#vision_chat — 2026-10-05

## 0. 身份（Identity）
| 字段 | 值 |
|---|---|
| runtime ID | `claude-sonnet-4-6`（wire alias：无） |
| operation | `vision_chat` |
| 契约位置 | `plugins/omnimux/src/catalog/specs/text-models.yaml` |
| 探测环境 | Darwin / Node v25.8.0 / live key 注入：`omnimux tokens exec 45 --yes --timeout=120 -- env OMNIMUX_API_KEY=__OMNIMUX_TOKEN_45__`；base `https://api.omnimux.ai/v1`；fixture：1×1 PNG（data URL，不入库） |
| 实测者 / 署名 | dsh-agent（用户已授权本次付费级真实生成验证） |

## 1. existence（存在性探针）
- 同 chat 证据：GET /v1/models → 200，模型在列

## 2. minimal（最小生成）
- 最小输入：`POST /v1/chat/completions` body `{model:"claude-sonnet-4-6", max_tokens:32, messages:[{role:user, content:[{type:text, text:"One word: what color dominates this image?"},{type:image_url, image_url:{url:<1x1 PNG data URL>}}]}]}`
- 结果：HTTP 200；response id `chatcmpl-req_vrtx_011CfiPmNi33kpeF5oJ33tB3`；usage prompt=21 completion=6 total=27；内容 `**Pink**`；耗时 2565ms

## 3. boundary（输入数量与角色边界）
| slot | role | min 实测 | max 实测（拒绝点） | 拒绝时上游行为 |
|---|---|---|---|---|
| prompt | prompt | 非空 prompt → 200 | node_field max=1 | 未重发（单次 POST 预算纪律） |
| reference_images | reference | min=0 可空（chat 已证） | 契约 max=10（policy_conservative，未触上限） | — |

## 4. mime-size-duration（格式 / 体积 / 时长）
- allowedMimes：image/png 实测接受（data URL 形式）
- size / duration 上限：未触限
- limitSource：policy_conservative（沿用契约声明）

## 5. conclusion（结论）
- **可上架**：existence 200 + minimal live 200（图像理解回答非空）→ research: verified（docUrl=本文件, verifiedAt=2026-10-05）
