---
title: "model evidence — claude-sonnet-4-6#chat — 2026-10-05"
id: "evidence-model-claude-sonnet-4-6-chat-20261005"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-05"
authors: ["dsh-agent"]
subsystem: "omnimux/catalog"
tags: ["model-evidence", "backfill-530", "text"]
---

# model evidence — claude-sonnet-4-6#chat — 2026-10-05

## 0. 身份（Identity）
| 字段 | 值 |
|---|---|
| runtime ID | `claude-sonnet-4-6`（wire alias：无） |
| operation | `chat` |
| 契约位置 | `plugins/omnimux/src/catalog/specs/text-models.yaml` |
| 探测环境 | Darwin / Node v25.8.0 / live key 注入：`omnimux tokens exec 45 --yes --timeout=120 -- env OMNIMUX_API_KEY=__OMNIMUX_TOKEN_45__`；base `https://api.omnimux.ai/v1`；**禁止记录 key 值** |
| 实测者 / 署名 | dsh-agent（用户已授权本次付费级真实生成验证） |

## 1. existence（存在性探针）
- 请求：`GET https://api.omnimux.ai/v1/models`（Bearer token id 45）
- 结果：HTTP 200；`claude-sonnet-4-6` **在列**（present=true）

## 2. minimal（最小生成）
- 最小输入：`POST /v1/chat/completions` body `{model:"claude-sonnet-4-6", max_tokens:32, messages:[{role:user, content:"Reply with exactly one word: pong"}]}`
- 结果：HTTP 200；response id `chatcmpl-req_vrtx_011CfiPiyWDMENUoDzjrYwaF`；usage prompt=15 completion=5 total=20；内容 `pong`；耗时 1440ms

## 3. boundary（输入数量与角色边界）
| slot | role | min 实测 | max 实测（拒绝点） | 拒绝时上游行为 |
|---|---|---|---|---|
| prompt | prompt | 非空 prompt → HTTP 200 | node_field max=1 | 空 prompt 未重发（单次 POST 预算纪律） |

## 4. mime-size-duration（格式 / 体积 / 时长）
- allowedMimes：N/A（text-only chat）
- size / duration 上限：N/A
- limitSource：N/A

## 5. conclusion（结论）
- **可上架**：existence 200 在列 + minimal live 200 内容非空 → research: verified（docUrl=本文件, verifiedAt=2026-10-05）
