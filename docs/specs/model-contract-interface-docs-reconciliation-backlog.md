---
title: "模型契约层缺失模型补齐整改单（19 个网关已开卖 / 已开页模型）"
id: "spec-model-contract-missing-model-backlog"
type: "backlog"
status: "active"
authority: "L1"
date: "2026-09-14"
updated: "2026-09-14"
authors: ["agent"]
subsystem: "plugins/omnimux/src/catalog"
tags:
  - "model-contract"
  - "backlog"
  - "gateway-truth"
related:
  - "docs/contracts/model-capabilities-matrix.md"
  - "docs/contracts/model-api-authority.md"
  - "docs/specs/all-models-gateway-truth-reconciliation-and-remediation-spec.md"
---

> 来源：模型契约层完整性/准确性排查（2026-09-14，Issue #1650）。本单只做取证与排期，**未**逐模型落契约。
> 执行前请先裁决本文 §四 的 U7（E-C 组缺生产快照）与 U8（证据日期异常），以及 §三 的 N4/N6 id 冲突。

# 桌面端契约层补齐整改单（19 个已开卖 / 已开页模型的契约缺口）

- 生成日期：2026-09-14
- 取证方式：**只读**离线比对。未改任何文件、未发网络请求、未发真实模型请求。
- 路径简写：
  - `DOCS` = `/Users/x/Desktop/Project/OmniMux-docs`
  - `GW` = `/Users/x/Desktop/Project/OmniMux`
  - `CT` = `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/plugins/omnimux/src/catalog`
- 契约层 21 个 operation id 真源：`CT/contract/operation-registry.json`（21 条：chat / vision_chat / document_analyze / text_to_image / image_to_image / multi_reference / inpaint_outpaint / text_to_video / first_frame / first_last_frame / end_frame / video_multi_ref / digital_human / video_edit / video_extend / document_to_video / webpage_to_video / text_to_speech / voice_clone / text_to_music / speech_to_text）

## 开放裁定项（需产品 / 网关 owner 裁决后才可继续）

| # | 事项 | 现状证据 | 需要谁裁决 | 裁决前不得做的事 |
| --- | --- | --- | --- | --- |
| D-1 | `gpt-image-2` 是否降级为 `gpt-image-2.5` 的别名 | 公开文档（`OmniMux-docs/.../gpt-image/generate.mdx`）称 2026-09-10 起旧 ID 不再接受；网关 `relay/channel/task/goeasy/adaptor.go:219-220` 仍把 `gpt-image-2` 映射到 `gpt-image-2.5-async`；网关侧另有决议 `OmniMux/docs/ops/image25-public-rename-2026-09-10.md:7` 声明旧 ID「不作为别名保留」（面向公开价目表） | 网关/产品 owner | 不得删除 `gpt-image-2` 契约行、不得把它降级为别名——它是 canonical、有 dated live 证据、其 `text_to_image` 在 `listedOperations` 内，并被自动上架清单与画布白名单引用；降级等于用户可见地少一个模型 |
| D-2 | 公开文档模型页与契约层的对齐门禁由谁承载 | 44 个模型页中 42 个为通用模板；文档仓无 CI 对齐门禁；`OmniMux-docs/scripts/sync-openapi.py` 的同步源 `relay.json` 不含模型 ID | 文档 owner（另一工作区） | 不得在未获授权时修改 `OmniMux-docs` |
| D-3 | `minimax-h3-{t2v,flf,endframe,fl2va}` 四个文档 id 的性质 | `dispositions.json` 明文「不保留 minimax-h3-endframe 伪型号」；网关 `apimart/video_contract.go` wire 只认 `minimax-h3`；但 `apply-prod-rename.js:230-249` 又把四者写入 gxgenai 渠道 models | 网关 owner | 不得为四者新建契约行；`fl2va` 语义未定前不得映射 `first_frame` |

## 0. 优先级口径（本单统一使用）

| 级别 | 判定标准 |
| --- | --- |
| **P0** | 已被产品界面 / 工作流**实际引用**，缺契约行会直接破坏现有功能 |
| **P1** | 网关侧已在售且有渠道行 / 上架批次证据，契约层无行；operation 可从文档与适配器完整表达 |
| **P2** | 在售证据链不完整，或 model id 拼写 / 语义需先裁决，或 registry 缺表达，或仅能作为现有行的 alias |

## 0.1 网关在售证据分级（读表前先看这里）

| 证据级 | 含义 | 本轮覆盖的模型 |
| --- | --- | --- |
| **E-A** | 出现在 `GW/docs/ops/channel-catalog-matrix-data.js`（2026-09-12 生产快照，37 渠道 / 121 公开模型）的渠道行 | wan-3.0-prime、wan-3.0-prime-ref、wan-3.0-ref、seedream-5-0-pro、jina-reader-v1、gemini-omni-1.1-flash、grok-imagine-video-1-5 |
| **E-B** | 未进快照，但已进 `GW/scripts/ops/pricing-ledger/models/*.json` 账本且 `status=active`，并有 `GW/docs/ops/channel-catalog-onboard-zh.md` 上架批次 | pixverse-v6、vidu-q3、qwen-image-3.0 |
| **E-C** | 仅出现在 ops 变更脚本 `GW/scripts/ops/pricing-ledger/naming/apply-prod-rename.js`（直接 mutate 生产 DB 的脚本）的 gxgenai 渠道（ch23/24）models 列表 | depth-video、ltx-2-3-kj、index-tts、zimage-makeup、minimax-h3-t2v / -flf / -endframe / -fl2va |
| **E-D** | 文档页存在但网关侧 id **已被删除** | gemini-omni-1.1、gemini-omni-flash |

> **快照缺口（重要）**：`channel-catalog-matrix-data.js` 的 37 个渠道里**没有 ch23 / ch24（gxgenai-cn / gxgenai-ai）**，因此 E-C 组 8 个模型的"在售"证据只能来自一个会直接改生产的 ops 脚本与一行 ops 说明，**缺独立快照佐证**。

---

# 一、19 个模型逐条整改单

## A. 视频系列（14）

### A1. `depth-video`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `depth-video` |
| 系列 / 中文名 | 视频系列 / **深度图视频生成**（品牌 Depth Video） |
| 文档声明的接口 | `POST /v1/video/generations` + `GET /v1/video/generations/{task_id}`；**异步**（返回 `task_id`）。请求字段：`model`(必)、`prompt`(文生视频时必填)、`seconds`/`duration`、`size`/`resolution`、`image`/`images` |
| 文档正文硬约束 | **未写**（模板页，无任何数量/时长/分辨率/互斥约束） |
| 建议契约 operation | `text_to_video`（prompt 条件必填、模板仅给文生视频示例）；`first_frame` 为待证候选，**不得**在无证据时同时登记 |
| 关键参数面 | 文档缺项；`GW/scripts/ops/pricing-ledger/official-apimart-prices.json` 无 `depth-video` 条目 → **缺证据** |
| 证据 | `DOCS/zh/api-reference/video-series/models/depth-video.mdx:1-43`（frontmatter/接口/请求体）、`:8-10`（异步轮询）；`DOCS/docs.json` navigation `groups[2]/pages[10]/pages[0]`；网关：`GW/scripts/ops/pricing-ledger/naming/apply-prod-rename.js:235,244`（ch23/24 models 列表 + `'depth-video': '2089940087466446849'`） |
| 与现有契约的关系 | **需新建独立行**：契约层 4 个 spec 文件全部零命中 `depth-video` |
| 优先级 | **P2** — 未被产品界面/工作流引用；且除 ops 脚本外无在售快照 |

### A2. `gemini-omni-1.1`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `gemini-omni-1.1` |
| 系列 / 中文名 | 视频系列 / **Omni 1.1 视频生成**（文档 Identity 品牌写 "Omni Flash"） |
| 文档声明的接口 | `POST /v1/video/generations` + `GET /v1/video/generations/{task_id}`；**异步**；字段同通用视频模板 |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `text_to_video`（依据：模板 + 网关在售同类 `gemini-omni-1.1-flash` 的 `text_to_video`） |
| 关键参数面 | 网关侧对应 SKU `gemini-omni-1.1-flash` 的分辨率档：**360P / 720P / 1080P / 4K**；上游 Ext 变体按「分辨率 × 时长」分档（4/6/8/10 秒）。来源 `GW/scripts/ops/pricing-ledger/official-apimart-prices.json`（id `gemini-omni-1.1-flash`、`Omni-Flash-Ext`）与 `GW/relay/channel/task/apimart/video_contract.go:559-580`（`omniFlashExtResolutions` = 360p/720p/1080p、`omniFlashExtMinSeconds=4` / `omniFlashExtMaxSeconds=10`） |
| 证据 | `DOCS/zh/api-reference/video-series/models/gemini-omni-1.1.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[2]/pages[1]`；网关侧反证：`GW/scripts/ops/fix-catalog-integrity.js:28-34`（**删除** id 117 `gemini-omni-flash`、id 125 `gemini-omni-1.1`，统一为 `gemini-omni-1.1-flash`）、`GW/docs/ops/model-integrity-and-governance-sop-zh.md:11`（明令禁止拆分成 `gemini-omni-1.1` 或 `gemini-omni-flash`） |
| 与现有契约的关系 | **不得新建同义独立行**。契约层现有 `omni_flash`（`CT/specs/video-models.yaml:2724`，research draft / implementation none / execution none 的 quarantine 占位）是同一能力的 underscore 旧形 |
| 优先级 | **P2** — 文档页与网关 id 直接冲突，必须先裁决文档口径，再决定登记形态 |

### A3. `gemini-omni-flash`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `gemini-omni-flash` |
| 系列 / 中文名 | 视频系列 / **Omni Flash 视频生成** |
| 文档声明的接口 | 同上（通用视频模板，异步） |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `text_to_video`；契约层 `omni_flash` 现有 `video_multi_ref`（`CT/specs/video-models.yaml:2740`）可保留 |
| 关键参数面 | 契约层 `omni_flash` 现有参数：aspectRatio 16:9/9:16、duration 4/6/10s、resolution 720P（`CT/specs/video-models.yaml:2762-2778`），但 `limitSource.kind = policy_conservative`（"quarantine 占位；无官方证据"）；网关侧 720P 档价 0.11/次（`official-apimart-prices.json` id `gemini-omni-flash-preview`） |
| 证据 | `DOCS/zh/api-reference/video-series/models/gemini-omni-flash.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[2]/pages[0]` 与 redirects[25-26]（`omni_flash` → `gemini-omni-flash`）；网关删除证据同 A2 |
| 与现有契约的关系 | **需裁决**：契约层 `omni_flash` 与文档页 `gemini-omni-flash` 是同一能力的三套拼写（underscore / hyphen / canonical `gemini-omni-1.1-flash`） |
| 优先级 | **P2** — 同上，缺 id 治理裁决 |

### A4. `grok-imagine-video`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `grok-imagine-video` |
| 系列 / 中文名 | 视频系列 / **Grok Imagine 视频生成** |
| 文档声明的接口 | 通用视频模板，异步 |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `text_to_video`（`video_multi_ref` 待证） |
| 关键参数面 | **上游存在两个不同 SKU**：`grok-imagine-video` 档位 480P($0.05)/720P($0.07)；`grok-imagine-video-1.5` 档位 480P($0.08)/720P($0.14)/1080P($0.25)。来源 `GW/scripts/ops/pricing-ledger/official-apimart-prices.json` |
| 证据 | `DOCS/zh/api-reference/video-series/models/grok-imagine-video.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[4]/pages[0]`；网关：`GW/docs/ops/channel-catalog-matrix-data.js` ch32 行 `model_id="grok-imagine-video-1-5"` / `upstream_id="grok-imagine-video"`（**公开 id 是 1-5，上游写 base**）、`GW/relay/channel/xai/constants.go:29`（`grok-imagine-video`）、`GW/relay/channel/task/sora/grok_imagine.go:60-67`（识别 `grok-imagine-video` 前缀，`grok-imagine-video-1-5` → `grok-imagine-video-1.5`） |
| 与现有契约的关系 | 契约已有 `grok-imagine-video-1-5`（`CT/specs/video-models.yaml:1540`，aliases=`grok-imagine-video-1.5`，disposition canonical），**但 alias 表里没有无版本号的 `grok-imagine-video`**。二者上游是不同 SKU（不同价目），因此**不能静默合并** |
| 优先级 | **P1** — 网关在售（E-A，4 条渠道行），文档页已开，契约缺 alias 或独立行，且当前 ch32 的公开↔上游映射本身即待核 |

### A5. `ltx-2-3-kj`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `ltx-2-3-kj` |
| 系列 / 中文名 | 视频系列 / **LTX 数字人对口型**（品牌 LTX / GxgenAI；英文页标题 "LTX digital human"） |
| 文档声明的接口 | `POST /v1/video/generations` + `GET /v1/video/generations/{task_id}`；**异步**；**必须传 `metadata.nodeInfoList`**；"这是人设静帧 + 音频对口型，不是文生视频"；图片/音频先用公网 URL 或上游 fileName，**不要传 `data:` URI** |
| 文档正文硬约束（逐条摘原文） | 必填节点 7 条：`444`/`image` = 人设静帧（**9:16 或 16:9**）；`1755`/`audio` = 语音或歌曲；`1583`/`value` = 生成秒数（`0`=整段音频；**建议 ≤35**）；`1776`/`value` = 音频起始秒；`1624`/`value` = 动作提示词；`1606`/`value` = 最大分辨率（**<1600**）；`1586`/`value` = 帧率。另：轮询**不要**使用 `*-async` / `*-query` 模型名 |
| 建议契约 operation | **`digital_human`**（registry 第 13 项；label 数字人/对口型；`promptPolicy: optional`；notes「图/视频+音频驱动；不得因粗 videoGenerate 自动 listed；不强制 prompt」）——与文档语义精确对应 |
| 关键参数面 | 画幅：9:16 / 16:9（文档）；分辨率：**无档位枚举，上限 `<1600`**（文档）；时长：**0 = 整段音频，建议 ≤35s**（文档，非硬上限）；帧率：节点 `1586` 可传（文档未给范围）；参考素材上限：**未写** |
| 证据 | `DOCS/zh/api-reference/video-series/models/ltx-2-3-kj.mdx:8-55`、`DOCS/en/api-reference/video-series/models/ltx-2-3-kj.mdx:8-55`（中英同构）；网关：`GW/scripts/ops/pricing-ledger/naming/apply-prod-rename.js:224-229,235,242`（`ltx2.3-kj → ltx-2-3-kj`，ch23/24 models + App ID `2031016553440878594`）；契约背景：`CT/contract/operation-registry.json` `digital_human` 条目、现有 `digital_human` 使用方 `CT/specs/video-models.yaml:1345`（kling-avatar） |
| 与现有契约的关系 | **需新建独立行**（契约层零命中）。可复用现成的 `digital_human` operation，不需扩 registry |
| 优先级 | **P1** — 网关在售（E-C），文档约束最完整、registry 表达现成；但产品侧零引用 |

### A6. `minimax-h3-endframe`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `minimax-h3-endframe` |
| 系列 / 中文名 | 视频系列 / **MiniMax 尾帧** |
| 文档声明的接口 | 通用视频模板，异步；无任何尾帧专属字段 |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `end_frame`（registry 第 11 项，已有；notes 明示「仅尾帧锚点；禁止映射为 first_frame；slot=end_frame role=last_frame；wire 候选 image_tail」） |
| 关键参数面 | 文档缺项。可继承 `minimax-h3` 行：subtitle `768P/2K · 4–15s`（`CT/specs/video-models.yaml:2793`）、图片 MIME jpeg/png/webp/heic/heif、`maxSizeMb: 30`、`aspectRatio: adaptive`（`CT/specs/video-models.yaml:2852-2867`、`:2888-2903`） |
| 证据 | `DOCS/zh/api-reference/video-series/models/minimax-h3-endframe.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[0]/pages[6]`；仓内设计：`omnimux-dsh/docs/specs/2026-09-05-minimax-h3-end-frame-design.md:1-49`（status=draft，#567/#566，`image_tail` 对 end-only 仅 H1 中等假设）；网关：`GW/scripts/ops/pricing-ledger/naming/apply-prod-rename.js:235,240`（App ID `2084090507931770881`）、`GW/relay/channel/task/apimart/video_contract.go:16,66-68`（`opEndFrame`、`inferPhaseOneOperation` 中 `roles.last>0 && modelID=="minimax-h3"` → `end_frame`） |
| 与现有契约的关系 | **不应新建独立模型行**。契约层已有：`minimax-h3` 行含 `end_frame` operation（`CT/specs/video-models.yaml:2868`）；`CT/contract/dispositions.json:271-274` 明确「单一产品 id 精确映射 MiniMax-H3；**不保留 minimax-h3-endframe 伪型号**」 |
| 优先级 | **P2** — 语义已由 `minimax-h3#end_frame` 覆盖，缺的是把文档页 id 登记为入口别名；且 end-only 客户 wire 未钉死（draft） |

### A7. `minimax-h3-fl2va`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `minimax-h3-fl2va` |
| 系列 / 中文名 | 视频系列 / **MiniMax 图生视频**（title 如此；id 后缀为 FL2VA） |
| 文档声明的接口 | 通用视频模板，异步 |
| 文档正文硬约束 | **未写**（title 写"图生视频"，但模板 body 与其它页逐字相同，无 I2V 专属字段） |
| 建议契约 operation | **待裁决**：若 = 单首帧 I2V → `first_frame`（已有）；若含音频或多帧 → **registry 缺表达**（需另行开 registry Issue） |
| 关键参数面 | 文档缺项；继承 `minimax-h3` 行同上无区分 |
| 证据 | `DOCS/zh/api-reference/video-series/models/minimax-h3-fl2va.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[0]/pages[4]`；仓内：`omnimux-dsh/docs/specs/2026-09-05-model-evidence-backfill-video-prd-addendum.md:116,162,295`（Q2「fl2va 是否等于单首帧 I2V」列为**未决问题**）、`.../video-design-addendum.md:105,157,374`（BI-5：若超越 first_frame 语义 → 不 listed） |
| 与现有契约的关系 | **不应新建独立行**；作为 `minimax-h3` 的 operation 候选，落点待语义确认 |
| 优先级 | **P2** — 缺证据：官方页未写请求体差异，无法判定 op |

### A8. `minimax-h3-flf`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `minimax-h3-flf` |
| 系列 / 中文名 | 视频系列 / **MiniMax 首尾帧** |
| 文档声明的接口 | 通用视频模板，异步 |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `first_last_frame`（依据：id 后缀 flf = first-last-frame；registry 第 10 项已有；PRD addendum:115 同判定） |
| 关键参数面 | 文档缺项；继承 `minimax-h3`：768P/2K · 4–15s、图片 maxSizeMb 30、aspectRatio adaptive |
| 证据 | `DOCS/zh/api-reference/video-series/models/minimax-h3-flf.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[0]/pages[5]`；仓内：`omnimux-dsh/docs/specs/2026-09-05-model-evidence-backfill-video-prd-addendum.md:115,161`；网关：`GW/scripts/ops/pricing-ledger/naming/apply-prod-rename.js:235,241`（App ID `2084086089706459137`） |
| 与现有契约的关系 | **不应新建独立行**：`minimax-h3` 行已含 `first_last_frame`（`CT/specs/video-models.yaml:2904`） |
| 优先级 | **P2** — 语义已覆盖，缺别名登记；仓内 BI-1 曾记「video mapper 表达 last_frame（flf）」为阻塞项（`video-design-addendum.md:370`） |

### A9. `minimax-h3-t2v`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `minimax-h3-t2v` |
| 系列 / 中文名 | 视频系列 / **MiniMax 文生视频** |
| 文档声明的接口 | 通用视频模板，异步 |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `text_to_video`（依据：id 后缀 t2v；registry 第 8 项；PRD addendum:114 同判定） |
| 关键参数面 | 文档缺项；网关 APIMart `minimax-h3` 档位 768P($0.05712/秒)、2K($0.09144/秒)（`GW/scripts/ops/pricing-ledger/models/apimart.json`）；契约 `minimax-h3` subtitle `768P/2K · 4–15s` |
| 证据 | `DOCS/zh/api-reference/video-series/models/minimax-h3-t2v.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[0]/pages[3]`；网关：`GW/scripts/ops/pricing-ledger/naming/apply-prod-rename.js:235,239`（App ID `2084109189609246721`）、`GW/docs/ops/dual-rotate-gaps-zh.md:13`（"`minimax-h3-t2v`（GxGenAI App）不按此规则双挂"——**证明其在生产为独立 GxGenAI App**） |
| 与现有契约的关系 | **不应新建独立行**：`minimax-h3` 行已含 `text_to_video`（`CT/specs/video-models.yaml:2802`）。网关 wire 只认 `minimax-h3` → `MiniMax-H3`（`GW/relay/channel/task/apimart/video_contract.go:31`） |
| 优先级 | **P2** — 语义已覆盖，缺别名/文档映射登记 |

### A10. `pixverse-v6`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `pixverse-v6` |
| 系列 / 中文名 | 视频系列 / **PixVerse v6 视频生成** |
| 文档声明的接口 | 通用视频模板，异步 |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `text_to_video`（主）；`first_frame` / `video_multi_ref` **未证**，不得登记 |
| 关键参数面 | 分辨率档（上游计费维度）：**360P / 540P / 720P / 1080P**，且每档各有 `-audio` 变体（720P-audio / 1080P-audio 等）。来源 `GW/scripts/ops/pricing-ledger/official-apimart-prices.json`（id `pixverse-v6`）。音轨变体是**计费维度**，不构成新 operation |
| 证据 | `DOCS/zh/api-reference/video-series/models/pixverse-v6.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[6]/pages[0]`；网关：`GW/scripts/ops/pricing-ledger/models/apimart.json`（`public_id=pixverse-v6`、`upstream_id=pixverse-v6`、`status=active`、`billing_mode=per_second`、`channel_refs=[apimart-media]`）、`GW/docs/ops/channel-catalog-onboard-zh.md:14`（`pixverse-v6`｜视｜`apimart-media`｜`pixverse-v6`｜0.026667/秒｜"Evolink 无 SKU"） |
| 与现有契约的关系 | **需新建独立行**（契约层零命中） |
| 优先级 | **P1** — 网关在售（E-B），文档页已开，operation 明确；但产品侧零引用 |

### A11. `vidu-q3`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `vidu-q3` |
| 系列 / 中文名 | 视频系列 / **Vidu Q3 视频生成** |
| 文档声明的接口 | 通用视频模板，异步 |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `text_to_video`（主）；`first_frame` / `video_multi_ref` **未证** |
| 关键参数面 | 分辨率档：**540P / 720P / 1080P**。来源 `GW/scripts/ops/pricing-ledger/official-apimart-prices.json`（id `viduq3`）。同表另有 `viduq3-mix` / `viduq3-pro` / `viduq3-turbo`，均属**独立 SKU，不属本公开 id** |
| 证据 | `DOCS/zh/api-reference/video-series/models/vidu-q3.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[7]/pages[0]`；网关：`GW/scripts/ops/pricing-ledger/models/apimart.json`（`public_id=vidu-q3`、`upstream_id=viduq3`（**无连字符**）、`status=active`、notes「Mix/pro/turbo are separate SKUs, not this public ID.」）、`GW/docs/ops/channel-catalog-onboard-zh.md:15` |
| 与现有契约的关系 | **需新建独立行**（契约层零命中）；注意上游 wire 名与公开 id 拼写不同，必须写进 `routing.wireModel` |
| 优先级 | **P1** — 网关在售（E-B），文档页已开；产品侧零引用 |

### A12. `wan-3.0-prime`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `wan-3.0-prime` |
| 系列 / 中文名 | 视频系列 / **Wan 3.0 Prime 视频生成** |
| 文档声明的接口 | 通用视频模板，异步 |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `text_to_video`（主）+ `first_frame`（次）。依据：`omnimux-dsh/docs/specs/2026-09-05-wan-3-ref-wire-design.md:138-139`（P-primary t2v；P-secondary first_frame） |
| 关键参数面 | 分档价（$0.058/秒 @480p，默认 $0.0578/秒）；来源 `GW/scripts/ops/pricing-ledger/models/evolink.json`（tier_table `{"480p":0.058,"default":0.0578}`）。时长/画幅枚举：**文档缺项** |
| 证据 | `DOCS/zh/api-reference/video-series/models/wan-3.0-prime.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[9]/pages[1]`；网关：`GW/docs/ops/channel-catalog-matrix-data.js` ch34（`public_id=wan-3.0-prime`、`upstream_id=wan3.0-prime-text-to-video`、sell 0.082571/秒）、`GW/scripts/ops/pricing-ledger/models/evolink.json`（status=active）、`GW/scripts/ops/pricing-ledger/id-map-evolink.json` |
| 与现有契约的关系 | **应新建独立模型行**（见第二节家族归并） |
| 优先级 | **P1** — 网关在售（E-A），文档页已开；产品侧零引用 |

### A13. `wan-3.0-prime-ref`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `wan-3.0-prime-ref` |
| 系列 / 中文名 | 视频系列 / **Wan 3.0 Prime 参考生视频** |
| 文档声明的接口 | 通用视频模板，异步（**示例 body 只有 `{"model","prompt"}`，无图**） |
| 文档正文硬约束 | **未写**；四页模板逐字相同，`image`/`images` 标注为 "图生视频参考图（模型相关）"，无数量上限 |
| 建议契约 operation | `video_multi_ref`（依据：产品名 Reference + 架构附录候选 `video_multi_ref`；`wan-3-ref-wire-design.md:140` 对 `wan-3.0-ref` 给 P-primary `video_multi_ref`，prime-ref 同理） |
| 关键参数面 | 计费 $0.038/秒（sell $0.0578/秒）；来源 `GW/scripts/ops/pricing-ledger/models/evolink.json`。参考图**数量上限：文档未写、账本未记 → 缺证据** |
| 证据 | `DOCS/zh/api-reference/video-series/models/wan-3.0-prime-ref.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[9]/pages[2]`；网关：`GW/docs/ops/channel-catalog-matrix-data.js` ch34（`upstream_id=wan3.0-prime-reference-video`）；`omnimux-dsh/docs/specs/2026-09-05-wan-3-ref-wire-design.md:100-102,115` |
| 与现有契约的关系 | **应新建独立模型行** |
| 优先级 | **P1** — 网关在售（E-A）；但 wire 字段冲突未解（见不确定项 U4） |

### A14. `wan-3.0-ref`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `wan-3.0-ref` |
| 系列 / 中文名 | 视频系列 / **Wan 3.0 参考生视频** |
| 文档声明的接口 | 通用视频模板，异步（示例同为 `{"model","prompt"}`） |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `video_multi_ref`（P-primary，#569 核心路径；`wan-3-ref-wire-design.md:140`） |
| 关键参数面 | 计费 $0.038/秒、sell $0.038/秒（`clamped_to_cost: true`）；来源 `GW/scripts/ops/pricing-ledger/models/evolink.json`。参考图上限：**文档未写 → 缺证据** |
| 证据 | `DOCS/zh/api-reference/video-series/models/wan-3.0-ref.mdx:1-43`；`DOCS/docs.json` navigation `groups[2]/pages[9]/pages[3]`；网关：`GW/docs/ops/channel-catalog-matrix-data.js` ch34（`upstream_id=wan3.0-reference-video`）；`omnimux-dsh/docs/specs/2026-09-05-wan-3-ref-wire-design.md:82,114,140`（产品附录 C2 锁定四 ID，`wan-3.0-ref` wire 必须写完整 id） |
| 与现有契约的关系 | **应新建独立模型行**（与 `wan-3.0#video_multi_ref` 的差异见第二节） |
| 优先级 | **P1** — 网关在售（E-A）；wire 冲突未解 |

## B. 图像系列（3）

### B1. `qwen-image-3-0`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `qwen-image-3-0` |
| 系列 / 中文名 | 图像系列 / **Qwen Image 3.0 生图** |
| 文档声明的接口 | `POST /v1/images/generations`；文档明写「同步或异步以线上响应为准；若返回 task id，请用任务查询接口轮询」；「公开文档不提供独立图像 query 路径」。请求字段：`model`(必)、`prompt`(必)、`n`、`size`、`quality` |
| 文档正文硬约束 | **未写**（唯一"约束"表述为"受网关上限约束"、"模型相关"，无数值；**同步/异步未定**是硬缺口） |
| 建议契约 operation | `text_to_image`（主）；`image_to_image` / `multi_reference` **未证** |
| 关键参数面 | 分档：**1K / 2K**（上游三档 default/1K/2K 同价 $0.025714）；来源 `GW/scripts/ops/pricing-ledger/official-apimart-prices.json`（id `qwen-image-3.0`）。Evolink 账本 tier_table `{"default":0.0331,"1k":0.0331}` |
| 证据 | `DOCS/zh/api-reference/image-series/models/qwen-image-3-0.mdx:1-54`；`DOCS/docs.json` navigation `groups[1]/pages[4]/pages[0]` + redirects[15-16]（`qwen-image-3.0` → `qwen-image-3-0`，永久重定向）；网关：`GW/scripts/ops/pricing-ledger/models/evolink.json`（`public_id=qwen-image-3.0`，**点号形**，`status=active`，notes「qwen-image-3.0-pro is a separate SKU」）、`GW/scripts/ops/pricing-ledger/models/apimart.json`（`public_id=qwen-image-3-0`，`upstream_id=qwen-image-3.0`，`status=deprecated`——2026-09-12 下架 APIMart 线并改由 ch37 Evolink 供货）、`GW/docs/ops/channel-catalog-onboard-zh.md:10`（公开 ID 写 `qwen-image-3.0`，NotePrice 0.047233/张） |
| 与现有契约的关系 | **需新建独立行**（契约层零命中） |
| 优先级 | **P1** — 网关在售（E-B），文档页已开；拼写需裁决（见第三节） |

### B2. `zimage-makeup`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `zimage-makeup` |
| 系列 / 中文名 | 图像系列 / **Z Image 生图**（品牌 Z Image / GxgenAI） |
| 文档声明的接口 | **`POST /v1/video/generations`**（图像模型走**视频**端点！）+ `GET /v1/video/generations/{task_id}`；异步。请求字段：`model`(必)、`prompt`(必)、`metadata.nodeInfoList`(否，"需要自定义节点时传入；多数情况 prompt-only 即可") |
| 文档正文硬约束 | 逐条原文：①「轮询：`GET /v1/video/generations/{task_id}`（**不要**使用 `*-async` / `*-query` 模型名）」；②「媒体任务默认异步；公开 model ID **不带** `-async` 后缀」；③「需要自定义节点时传入；多数情况 prompt-only 即可」；④「查询完成后再取产物 URL；链接可能有时效，请及时落盘」。**无数量/时长/分辨率数值** |
| 建议契约 operation | `text_to_image`（prompt-only 主路径）；`multi_reference` 未证 |
| 关键参数面 | 文档缺项。Go 真源给出默认节点：`{"59": "value"}`（`GW/relay/channel/task/gxgenai/parse.go:40-47` `defaultPromptNodes`）。分辨率/画幅枚举：**缺证据** |
| 证据 | `DOCS/zh/api-reference/image-series/models/zimage-makeup.mdx:1-84`（含 200 响应示例 `{"id":"task_xxx","status":"in_progress","model":"zimage-makeup"}`）；`DOCS/docs.json` navigation `groups[1]/pages[2]/pages[0]`；网关：`GW/relay/channel/task/gxgenai/parse.go:40-47`、`GW/relay/channel/task/gxgenai/adaptor.go:306`（`GetModelList()` 返回 `zimage-makeup`, `zimage-makeup-async`, `ltx2.3-kj`, `ltx2.3-kj-async`）、`GW/relay/channel/task/gxgenai/adaptor_test.go:88,141`、`GW/scripts/ops/pricing-ledger/naming/apply-prod-rename.js:235,237`（App ID `2003681895185563650`） |
| 与现有契约的关系 | **需新建独立行**。注意：output.type=image 但 seam 走 task 视频端点 → 需确认契约 schema 是否允许"输出类型 ≠ 端点族"（见不确定项 U12） |
| 优先级 | **P1** — 网关在售（E-C，Go 适配器有具名默认节点，证据强度高于其它 E-C 项） |

### B3. `seedream-5-0-pro`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `seedream-5-0-pro` |
| 系列 / 中文名 | 图像系列 / **Seedream 5.0 Pro 生图** |
| 文档声明的接口 | `POST /v1/images/generations`；同步/异步同 B1 表述。字段：`model`(必)、`prompt`(必)、`n`、`size`、`quality` |
| 文档正文硬约束 | **未写** |
| 建议契约 operation | `text_to_image` + `multi_reference`（**契约层现成行已有这两项**，`CT/specs/image-models.yaml:866,877`） |
| 关键参数面 | 契约现成行：aspectRatio auto/1:1/4:3/3:4/16:9/9:16/21:9/3:2/2:3（默认 16:9）；resolution 2K/1K（默认 2K）；参考图 `max: 8`、MIME png/jpeg/webp、`maxSizeMb: 15`，但 `limitSource.kind = policy_conservative`（"继承 runtime 表行 max8；官方审计前保守"）→ **参考图上限官方缺证据**。上游分档：1K/1K-layer/2K/2K-layer（`official-apimart-prices.json` id `seedream-5-0-pro`） |
| 证据 | `DOCS/zh/api-reference/image-series/models/seedream-5-0-pro.mdx:1-54`；`DOCS/docs.json` navigation `groups[1]/pages[3]/pages[0]` + redirects[13-14]（`seedream-5.0-pro` → `seedream-5-0-pro`）；网关：`GW/docs/ops/channel-catalog-matrix-data.js` ch33（`seedream-5-0-pro`｜upstream `seedream-5-0-pro`）与 ch37（`seedream-5-0-pro`｜upstream `doubao-seedream-5.0-pro`）、`GW/scripts/ops/pricing-ledger/models/evolink.json`（`public_id=seedream-5.0-pro`，**点号形**，notes「APIMart alias seedream-5-0-pro ... is cheaper」）、`GW/scripts/ops/pricing-ledger/reports/naming-lint-latest.json`（`seedream-5.0-pro` 触发 `MEDIA_DOT_VERSION` error + `ALIAS_RETIRED_STILL_PRESENT` error，suggest `seedream-5-0-pro`）；**产品界面引用**：`omnimux-dsh/plugins/omnimux-market/src/client/model-picker.js:112,227`（用连字符形 `seedream-5-0-pro`） |
| 与现有契约的关系 | **并入现有模型行**：`CT/specs/image-models.yaml:861` 已有 `seedream-5.0-pro` 行（disposition = draft，`CT/contract/dispositions.json:390-393`）。缺的是 id 拼写收敛，不是新建行 |
| 优先级 | **P0** — 产品界面已引用（`model-picker.js`），契约层 canonical 拼写与界面/文档不一致，属现有链路一致性缺口 |

## C. 音频系列（1）

### C1. `index-tts`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `index-tts` |
| 系列 / 中文名 | 音频系列 / **Index TTS 声音克隆**（品牌 Index TTS / GxgenAI） |
| 文档声明的接口 | **`POST /v1/video/generations`**（音频走视频端点）+ `GET /v1/video/generations/{task_id}`；异步。字段：`model`(必)、`prompt`(否，"仅作标签；文稿写在节点 `7`")、`metadata.nodeInfoList`(必，"参考音 + 文稿") |
| 文档正文硬约束（逐条摘原文） | ①「GxgenAI 任务共用这条路径，即使产物是音频」；②「参考音先用公网 URL 或上游 fileName；**不要传 `data:` URI**」；③ 必填节点 `4`/`audio` = 克隆参考音（**自动截取前约 15 秒**）；④ 必填节点 `7`/`text` = 要朗读的文字；⑤「轮询：`GET /v1/video/generations/{task_id}`（**不要**使用 `*-async` / `*-query` 模型名）」 |
| 建议契约 operation | `voice_clone`（registry 第 19 项，已有）；**但存在表达张力**：registry 规定 `voice_clone.promptPolicy = "required"`，而文档明写 `prompt` 为**否**必填（"仅作标签"）→ 登记时需按 `digital_human`/`speech_to_text` 的先例处理（后者的 registry notes 明确写了"不得强制 prompt"），或提请扩 registry 语义 |
| 关键参数面 | 参考音：**自动截取前约 15 秒**（文档，硬约束）；输出格式/采样率：**未写**；参考音数量上限：**未写**（文档只给单节点 `4`） |
| 证据 | `DOCS/zh/api-reference/audio-series/models/index-tts.mdx:8-51`、`DOCS/en/api-reference/audio-series/models/index-tts.mdx:8-51`（中英同构）；`DOCS/docs.json` navigation `groups[3]/pages[3]/pages[0]`；网关：`GW/scripts/ops/pricing-ledger/naming/apply-prod-rename.js:235,243`（App ID `1963897259823960066`） |
| 与现有契约的关系 | **需新建独立行**（契约层零命中；`CT/specs/audio-models.yaml` 现有 5 行：doubao-asr-bigmodel / seed-audio-1.0 / suno / gpt-4o-mini-tts / whisper-1） |
| 优先级 | **P1** — 网关在售（E-C），文档约束完整；但 registry 的 `promptPolicy` 与文档冲突需一并裁决 |

## D. 阅读系列（1）

### D1. `jina-reader-v1`

| 字段 | 内容 |
| --- | --- |
| 文档 model id | `jina-reader-v1` |
| 系列 / 中文名 | 阅读系列 / **Jina Reader 网页提取** |
| 文档声明的接口 | **独立端点 `POST /v1/reader`**（不是 video/image 端点）；文档未声明异步，"直接返回干净清洗后的纯文本 Markdown 正文" + JSON 形态二选一。字段：`model`(必)、`url`(必，http/https)、`return_format`(markdown 默认 / json)、`remove_selector`、`target_selector`、`wait_for_selector`、`timeout`、`retain_images`(`none` 可移除所有图片标记)、`with_links_summary`、`with_images_summary`、`with_generated_alt`、`no_cache`、`respond_with`(如 `readerlm-v2`) |
| 文档正文硬约束 | ①「计费方式：**按输出 Token 结算**（根据实际返回的 Markdown/JSON 内容 Token 数扣费）」；② JSON 返回含 `data.usage.tokens`（输出消耗 Token 总量）；③ `url` 必须 http:// 或 https://。**字数/超时/选择器数量等数值约束：未写** |
| 建议契约 operation | **registry 缺表达**。21 个 id 中无"网页/URL 提取"类：`document_analyze` 是"文档解析（document 输入）"、group=text、defaultOutputType=text，语义不符（本文档的输入是 URL、输出是 Markdown 文本，且是独立端点）。需扩 registry（schema 17→18 的先例见 `omnimux-dsh/docs/specs/2026-09-05-minimax-h3-end-frame-design.md`），或明确以 `document_analyze` 承载并写清限缩依据 |
| 关键参数面 | 输出格式枚举：`markdown` / `json`（默认 markdown）；`retain_images`: `none`；`respond_with`: `readerlm-v2`；超时：字段存在但**无范围** |
| 证据 | `DOCS/zh/api-reference/reader-series/models/jina-reader-v1.mdx:8-70`；`DOCS/docs.json` navigation `groups[4]/pages[0]/pages[0]`；网关：`GW/docs/ops/channel-catalog-matrix-data.js` ch35（`[个人中转-Jina] Reader 网页抓取`，`public_id=jina-reader-v1`，`modality=other`）、`GW/scripts/ops/pricing-ledger/models/jina.json`；**产品已实装**：`omnimux-dsh/plugins/omnimux/src/reader/client.js:3`（`export const READER_MODEL = 'jina-reader-v1'`）、`plugins/omnimux/src/reader/mount.js:30`（工具描述写明 `POST /v1/reader, model jina-reader-v1`）、`plugins/omnimux/src/reader/fetch.test.js:81,86` |
| 与现有契约的关系 | **需新建独立行**（契约层 4 个 spec 文件与 dispositions 全零命中 `jina-reader`） |
| 优先级 | **P0** — 产品已实装 reader 工具并硬编码该 model id，契约层无行；按仓库「跨插件模型同步必须原子闭合」的约定，这是当前链路的一致性缺口 |

---

# 二、家族归并分析

## 2.1 `minimax-h3-t2v` / `-flf` / `-endframe` / `-fl2va` 与现有 `minimax-h3`

**结论：应作为现有 `minimax-h3` 模型行的 operation 入口 / 文档别名，不应新建 4 个独立模型行。**

依据（按强度排序）：

1. **契约层已显式否决独立行**：`CT/contract/dispositions.json:271-274` —— `minimax-h3` 为 canonical，notes 原文「单一产品 id 精确映射 MiniMax-H3；**不保留 minimax-h3-endframe 伪型号**」。
2. **网关 wire 只认一个 id**：`GW/relay/channel/task/apimart/video_contract.go:31` `phaseOneWireModels` 中 `"minimax-h3" → "MiniMax-H3"`，`canonicalPhaseOneVideoModel`（`:47-48`）只对 `minimax-h3` 返回 canonical；`operationAllowed`（`:36-38`）在**同一个 modelID 下**同时允许 `text_to_video / first_frame / end_frame / first_last_frame / video_multi_ref` 五个 op。
3. **四个后缀对应的 op 全在 `minimax-h3` 行内已存在**：`CT/specs/video-models.yaml:2802`(text_to_video) / `:2832`(first_frame) / `:2868`(end_frame) / `:2904`(first_last_frame) / `:2956`(video_multi_ref)。唯一未定的是 `fl2va`。
4. **仓内设计文档同口径**：`omnimux-dsh/docs/specs/2026-09-05-model-evidence-backfill-video-design-addendum.md:55`「**bare / 粗粒度 ID 策略未写 H3** → `minimax-h3`（无后缀）只作『不接』结论，禁止 generation listed；合法 wire 仅 `minimax-h3-t2v` / `flf` / `fl2va` / `endframe` 四个」——注意这条是 **#530 阶段的旧口径**，已被 `docs/specs/2026-09-05-model-contract-docs-first.md` 取代（见 `2026-09-05-wan-3-ref-wire-design.md:40-41,45` 的 superseded 声明），**不得当当前输入合同**。

**但必须并列的反向证据（这是本条的真正风险点）**：

- `GW/scripts/ops/pricing-ledger/naming/apply-prod-rename.js:230-249` 把 `minimax-h3-fl2va` / `minimax-h3-t2v` / `minimax-h3-endframe` / `minimax-h3-flf` 作为 **ch23/24（gxgenai-cn / gxgenai-ai）的 channel `models` 列表成员**写入，并为每个绑定 RunningHub **App ID**。
- `GW/docs/ops/dual-rotate-gaps-zh.md:13`：「`minimax-h3-t2v`（GxGenAI App）不按此规则双挂」——**明确把 `minimax-h3-t2v` 称作一个生产中的独立 GxGenAI App**。

⟹ 冲突实质：这 4 个 id 在网关侧是**渠道层 App 别名 / 上游 SKU 名**，在文档站是**公开 model 值**。按 SOP 铁律 1「单一公共模型 ID；严禁自造简写、省略版本号或丢弃官方后缀」（`GW/docs/ops/model-integrity-and-governance-sop-zh.md:9-15`），公开面应收敛为一个 id。
**建议处置**：契约层只保留 `minimax-h3` 一行（不新增）；把 4 个文档页 id 登记进 dispositions 的 alias 条目（`disposition: "alias"`, `target: "minimax-h3"`），并在文档侧整改项里标注「该页 id 仅作文档入口，非 wire model；实际 wire model = `minimax-h3`」。

**`fl2va` 单独例外**：语义未定（是否为单首帧 I2V），在语义裁决前不得映射到 `first_frame`（`video-design-addendum.md:374` BI-5：错 op 上架）。若最终确认含音频/多帧超出现有 slots → 记 **registry 缺表达**。

## 2.2 `wan-3.0-ref` / `-prime` / `-prime-ref` 与现有 `wan-3.0`

**结论：应新建 3 个独立模型行，不得并入 `wan-3.0`。**

依据：

1. **上游 wire model 不同且被产品附录锁死**：`omnimux-dsh/docs/specs/2026-09-05-wan-3-ref-wire-design.md:112-115` 逐条要求 `POST body.model` 必须写完整 id（`wan-3.0` / `wan-3.0-prime` / `wan-3.0-ref` / `wan-3.0-prime-ref`），并有「短名零残留铁律」；`:82` 记产品附录 C2 已锁四 ID。
2. **计费与上游 SKU 完全独立**：`GW/scripts/ops/pricing-ledger/models/evolink.json` 四条记录各有独立 `public_id` + `upstream_id`：`wan-3.0`→`wan3.0-text-to-video`（$0.0375/秒）、`wan-3.0-prime`→`wan3.0-prime-text-to-video`（$0.0578/秒）、`wan-3.0-prime-ref`→`wan3.0-prime-reference-video`（$0.038/秒）、`wan-3.0-ref`→`wan3.0-reference-video`（$0.038/秒）。
3. **生产快照逐条独立**：`GW/docs/ops/channel-catalog-matrix-data.js` ch34 `[优选中转-Evolink] 视频生成专线` 的 14 行里，四个 id 各占一行、各有独立 `public_id` / `upstream_id` / `sell_price`。
4. **现有 `wan-3.0` 行只声明一个 wire model**：`CT/specs/video-models.yaml:2185,2188`（alias `wan3.0-video`、`wireModel: wan3.0-video`），与 prime/ref 系列的上游 id 不同源。

**operation 归属**（依据上述 wire 设计 + registry）：

| 目标 id | 建议 operation | 依据 |
| --- | --- | --- |
| `wan-3.0-prime` | `text_to_video`（主）+ `first_frame`（次） | `wan-3-ref-wire-design.md:138-139`（P-primary / P-secondary） |
| `wan-3.0-ref` | `video_multi_ref` | `wan-3-ref-wire-design.md:140`（P-primary，#569 核心） |
| `wan-3.0-prime-ref` | `video_multi_ref` | 同 ref 语义（产品名 Reference） |

**必须同时解决的去重问题**：现有 `wan-3.0` 行**已**含 `video_multi_ref`（`CT/specs/video-models.yaml:2291`）与 `document_to_video`/`webpage_to_video`（`:2366`/`:2404`），且网关 `operationAllowed`（`GW/relay/channel/task/apimart/video_contract.go:32-35`）给 `wan-3.0` 开的是 t2v / first_frame / first_last_frame / video_multi_ref / document_to_video / webpage_to_video。四页文档请求体逐字相同 → **文档无法区分 `wan-3.0#video_multi_ref` 与 `wan-3.0-ref`**。这是必须在排期里单列的裁决项（见第三节「命名冲突」与 U4）。

## 2.3 其它家族判定（附带）

| 家族 | 判定 | 依据 |
| --- | --- | --- |
| `gemini-omni-1.1` / `gemini-omni-flash` / `gemini-omni-1.1-flash` | **收敛为一行 `gemini-omni-1.1-flash`**；另两个不登记为模型 | `GW/docs/ops/model-integrity-and-governance-sop-zh.md:11`；`GW/scripts/ops/fix-catalog-integrity.js:28-34,47-53` |
| `qwen-image-3-0` / `qwen-image-3.0` | **一个模型，两套拼写**；canonical 取连字符形，点号形作 alias | 文档 redirects[15-16]；`naming-lint-latest.json` 判 `qwen-image-3.0` 为 `MEDIA_DOT_VERSION` error |
| `seedream-5-0-pro` / `seedream-5.0-pro` | **一个模型，两套拼写**；canonical 取连字符形 | 文档 redirects[13-14]；`naming-lint-latest.json` 判 `seedream-5.0-pro` 为 `MEDIA_DOT_VERSION` + `ALIAS_RETIRED_STILL_PRESENT` error |
| `minimax-h3-max` / `-max-turbo` | 已各有独立行（`CT/specs/video-models.yaml:1648`/`:1949`），**不在本单 19 个目标内**，本次不动 | — |

---

# 三、命名冲突清单

## 3.1 已点名三项

| # | 冲突 | 文档 id | 契约 canonical | 网关口径 | 建议登记方式 |
| --- | --- | --- | --- | --- | --- |
| N1 | **seedream 版本号点号** | `seedream-5-0-pro`（`DOCS/zh/.../seedream-5-0-pro.mdx:4,18`；products `model-picker.js:112,227`） | `seedream-5.0-pro`（`CT/specs/image-models.yaml:861`） | ch33/ch37 公开 id = `seedream-5-0-pro`；账本 evolink `public_id=seedream-5.0-pro`；lint 判 `seedream-5.0-pro` 为 error 并 suggest `seedream-5-0-pro` | **契约 canonical 改为 `seedream-5-0-pro`**；`seedream-5.0-pro` 写入 dispositions `disposition:"alias", target:"seedream-5-0-pro"`；gateway wire 保持 `doubao-seedream-5.0-pro`（Evolink）/ `seedream-5-0-pro`（APIMart）写进 `routing.wireModel` |
| N2 | **qwen-image 版本号点号** | `qwen-image-3-0`（`DOCS/zh/.../qwen-image-3-0.mdx:4,18`） | **契约无行** | ch37 账本 `public_id=qwen-image-3.0`（点号形，active）；上游 wire `qwen-image-3.0`；lint 判 `qwen-image-3.0` 为 error 并 suggest `qwen-image-3-0` | 新建行时 canonical 用 **`qwen-image-3-0`**；别名表登记 `qwen-image-3.0`（渠道 wire 形）；`routing.wireModel: qwen-image-3.0` |
| N3 | **nano-banana 拼写三套** | `nano-banana-2` / `nano-banana-pro`（`DOCS/zh/api-reference/image-series/models/nano-banana-2.mdx`、`nano-banana-pro.mdx`） | `nano_banana_2` / `nano_banana_pro`（**underscore**，`CT/specs/image-models.yaml:733,797`；dispositions `canonical`，`CT/contract/dispositions.json:383-388`） | 生产公开 id = `nano-banana-2` / `nano-banana-pro`（matrix ch33/37/46/54/57）；`apply-prod-rename.js:270-273` 把 `nano_banana_2 → nano-banana-2` 写入 ModelPrice；prod-audit 判 `nano_banana_2` 为 L1 error | **契约 canonical 改为连字符形 `nano-banana-2` / `nano-banana-pro`**（与生产、文档、prod-audit 三方一致）；`nano_banana_2` / `nano_banana_pro` / `nanobanana-2` / `nanobanana-pro` 全部登记为 alias。**关键缺口**：契约现有 alias 只有 `nanobanana-*`（无第一个连字符），**缺文档形 `nano-banana-*`**，必须补 |

> N3 的额外证据：`CT/contract/dispositions.json:410-420` 现有 alias 只登记了 `nanobanana-2 → nano_banana_2` 与 `nanobanana-pro → nano_banana_pro`，**没有任何一条**把 `nano-banana-2` / `nano-banana-pro` 收敛进来；而 prod-audit（`GW/scripts/ops/pricing-ledger/reports/naming-prod-audit.md:16-17`）的 suggested target 恰恰是 `nano-banana-2` / `nano-banana-pro`。另：`official-dot-allowlist.json` 把 `nano-banana` 明确列入 `media_families_ban_dot`（媒体家族禁用点号），与文档/生产的连字符形一致。

## 3.2 本单新增发现的冲突

| # | 冲突 | 事实 | 建议登记方式 |
| --- | --- | --- | --- |
| N4 | **`gemini-omni-1.1` / `gemini-omni-flash`（文档）vs `gemini-omni-1.1-flash`（网关唯一 canonical）** | 文档站有两个独立页并各自声明 model 值；网关 SOP 明令禁止这两种简写，且 `fix-catalog-integrity.js:28` 已**物理删除** id 117（原 `gemini-omni-flash`）与 id 125（原 `gemini-omni-1.1`） | 契约层**不得**登记这两个 id。若要承接文档入口，登记为 `gemini-omni-1.1-flash` 的**文档页别名**，并在 notes 写「仅文档入口，非 wire model」。另：契约现存 `omni_flash`（`CT/specs/video-models.yaml:2724`，quarantine、`research.status=draft`、`implementation.status=none`、`execution.status=none`）建议裁决为删除或 alias → `gemini-omni-1.1-flash` |
| N5 | **`wan-3.0*` 点号形 vs 命名 lint 建议的连字符形** | `naming-lint-latest.json` 对 `wan-3.0` / `wan-3.0-ref` / `wan-3.0-prime` / `wan-3.0-prime-ref` 四条各报 `MEDIA_DOT_GRAY`(warn) + `DOT_NOT_ALLOWLISTED`(warn)，suggest `wan-3-0*` | **建议保持点号形，无需动作**：`GW/scripts/ops/pricing-ledger/naming/official-dot-allowlist.json` 的 `gray_zone_families` 已显式登记 wan —— notes 原文「wan-3.0* existing may keep dots; new media names should prefer wan-3-0*」。故上述两条 warn 属已预期的信息性告警，**不是待整改项**。不建议按 suggest 改名：文档页 URL、网关 matrix、契约 canonical、wire 映射四方一致都用点号形，改名会同时打断四处 |
| N6 | **`grok-imagine-video`（文档）vs `grok-imagine-video-1-5`（契约 canonical）** | 契约行存在（`CT/specs/video-models.yaml:1540`），alias 表只有点号形 `grok-imagine-video-1.5`（`CT/contract/dispositions.json:458-461`），**没有无版本号形**；但上游 APIMart 同时存在两个 SKU（`grok-imagine-video` 480P/720P、`grok-imagine-video-1.5` 480P/720P/1080P，价目不同）；且 ch32 的映射是 `model_id=grok-imagine-video-1-5` → `upstream_id=grok-imagine-video` | **先裁决**：若确认 base 与 1.5 是同一能力的不同档 → 把 `grok-imagine-video` 登记为 alias；若确认是两代 SKU → 新建独立行。裁决前**不要**静默合并 |
| N7 | **`ltx-2-3-kj`（文档 + 网关 canonical）vs `ltx2.3-kj`（Go 遗留 + 旧 ModelRatio 键）** | 已做改名：`apply-prod-rename.js:224-229` 把 model meta 从 `ltx2.3-kj` 改为 `ltx-2-3-kj`、`:285` 把 ModelRatio 键改名；但 `GW/relay/channel/task/gxgenai/adaptor.go:306` 的 `GetModelList()` **仍返回旧名** `ltx2.3-kj` / `ltx2.3-kj-async`；prod-audit 判 `ltx2.3-kj` 为 L2 error | 契约 canonical 用 **`ltx-2-3-kj`**；`ltx2.3-kj` / `ltx2.3-kj-async` 作渠道别名登记。文档侧 redirects[21-22] 已就位 |

---

# 四、不确定项清单（逐条写明缺什么证据）

| # | 事项 | 缺什么证据 |
| --- | --- | --- |
| **U1** | **19 个目标页里 15 个是模板生成**：14 个视频目标页中 **13 个恰为 124 行**、逐字同构（除 title/brand/model 三行），仅 `ltx-2-3-kj` 为 138 行含真实约束；图像目标页中 `qwen-image-3-0`（127 行）与 `seedream-5-0-pro`（127 行）同构，`zimage-makeup`（92 行）另有真实段落。这 15 页正文**无任何数量/时长/分辨率/互斥约束** | 缺**各模型官方页 / OpenAPI 精确字段表**。本轮只能确认"文档未写"，不能推定"该模型无约束"。 |
| **U2** | **文档 OpenAPI 与网关真源不一致** | `DOCS/openapi/relay.json` 的 `VideoRequest` 只有 `model,prompt,image,duration,width,height,fps,seed,n,response_format,user,metadata`，**没有** `reference_images` / `aspect_ratio` / `image_with_roles` / `file_url` / `link_url`；而 `GW/relay/channel/task/apimart/video_contract.go:190-210,270-308` 实际接受并校验这些字段。缺证据：**哪一侧是最新真源**（`omnimux-dsh/docs/specs/2026-09-05-wan-3-ref-wire-design.md:85,101` 已把此冲突记为"OpenAPI 过时可能"，但未裁决）。 |
| **U3** | **所有"参考素材上限"缺官方证据** | 文档页一律未写上限；契约现有值（如 `CT/specs/image-models.yaml:893` seedream `max: 8`）标注为 `limitSource.kind = policy_conservative`（"继承 runtime 表行 max8；官方审计前保守"），非官方来源。缺证据：各模型的官方参考图/参考视频数量上限表。 |
| **U4** | **wan 家族 wire 字段冲突未解** | 四个文档页请求体逐字相同，无法区分 `wan-3.0` 与 `-ref`/`-prime`/`-prime-ref` 的字段差异。仓内 `omnimux-dsh/docs/specs/2026-09-05-wan-3-ref-wire-design.md:51-59` 自述 status=draft、已被 `2026-09-05-model-contract-docs-first.md` superseded，且 §1.3 明列三条未解冲突：文档写 `image`/`images` vs hub #429 只认 `reference_images` vs OpenAPI 两者都无。缺证据：**dated live multi-ref 成功记录或官方精确字段表**。 |
| **U5** | **`minimax-h3-fl2va` 语义未定** | 决定它落入 `first_frame`（已有）还是 **registry 缺表达**。缺证据：官方页未写请求体差异（`video-prd-addendum.md:295` Q2 原文列为未决问题）。 |
| **U6** | **`minimax-h3-endframe` 的 end-frame-only 客户 wire 未钉死** | `omnimux-dsh/docs/specs/2026-09-05-minimax-h3-end-frame-design.md:47` 自述 draft：「end-frame-only 客户 wire 尚未被 `minimax-h3-endframe` dated probe 钉死」；`:49` 记「#566 `image_tail` ≠ end-only 自动真源」。缺证据：end-only wire 的最小成功记录。 |
| **U7** | **E-C 组 8 个模型缺生产快照** | `GW/docs/ops/channel-catalog-matrix-data.js`（2026-09-12，37 渠道 / 121 公开模型）**不含 ch23 / ch24（gxgenai-cn / gxgenai-ai）**。因此 `depth-video` / `ltx-2-3-kj` / `index-tts` / `zimage-makeup` / `minimax-h3-{t2v,flf,endframe,fl2va}` 的"在售"证据只有两处：一个会直接 mutate 生产 DB 的 ops 脚本（`apply-prod-rename.js:230-249`）与一行 ops 说明（`dual-rotate-gaps-zh.md:13`）。缺证据：**包含 gxgenai 渠道的现状快照**。 |
| **U8** | **证据日期异常（未来日期）** | `GW/docs/ops/channel-catalog-onboard-zh.md` 标题写 "2026-09-30 媒体目录入库"；`GW/scripts/ops/pricing-ledger/models/{apimart,evolink}.json` 中 `pixverse-v6` / `vidu-q3` / `qwen-image-3.0` / `seedream-5.0-pro` 的 `captured_at` 均为 `2026-09-30T00:00:00.000Z`，晚于本次取证日 2026-09-14。缺证据：**这批是"预排批次"还是日期字段写错**。不影响"该批次已排定"的结论，但影响"当前是否已实际在售"的判定。 |
| **U9** | **文档页 id 是否具有 wire 意义，无治理规则** | SOP 铁律 1 要求"单一公共模型 ID"，但文档站仍以 19 个不同 id 开页（含被网关删除的 `gemini-omni-1.1` / `gemini-omni-flash`）。缺证据：**文档侧是否有独立的 id 治理规则**、以及这些页面的 `model` 值是否声明为可直接调用。 |
| **U10** | **registry 是否允许扩 operation，无现行裁决** | `jina-reader-v1` 的"网页/URL 提取"在 21 个 op 中无对应项；`document_analyze` 语义不符（输入是 document、group=text）。缺证据：**产品是否授权扩 registry**（仅有的前例是 #567 把 registry 从 17 扩到 18，且该设计至今 status=draft）。 |
| **U11** | **产品侧孤儿 UI 条目** | `omnimux-dsh/plugins/omnimux-market/src/client/model-picker.js:119,237` 引用 `seedream-5-0-lite`，但**文档仓无该页、契约层无该行、网关账本无该 id**。缺证据：该条目的来源与归宿。（不在本单 19 个目标内，但同批需处置。） |
| **U12** | **"输出类型 ≠ 端点族"的契约表达力未验证** | `zimage-makeup`（图像）与 `index-tts`（音频）的文档声明的端点都是 `POST /v1/video/generations`；registry 的 `defaultOutputType` 是 image / audio，而网关 seam 是 task 视频路径。缺证据：**契约 schema 是否允许并如何在 operation 上表达"模型走视频端点但产物是图/音"**。 |
| **U13** | **`gxgenai` 适配器的双轨形态未落到契约** | `GW/relay/channel/task/gxgenai/adaptor.go:103-113` 是双轨：数字 App ID → `/openapi/v2/run/ai-app/{appId}`；含 `/` 的 slug → `/openapi/v2/{endpoint}`。E-C 组 8 个模型走的是**App ID 轨**。缺证据：契约 `routing` 是否表达 App ID 轨（现有字段只有 `channel` / `wireModel` / `endpoint` / `automaticFallback`）。 |
| **U14** | **`index-tts` 的 registry 语义张力** | `voice_clone` 在 registry 中规定 `promptPolicy: "required"`，但文档明写 `prompt` 为**否**必填（"仅作标签"）。缺证据：是改 registry 语义、还是按 `speech_to_text` 先例（其 notes 写了"不得强制 prompt"）在模型行内覆盖。 |

---

# 五、排期建议汇总（按优先级）

| 优先级 | 模型 | 建议动作 | 阻塞点 |
| --- | --- | --- | --- |
| **P0** | `seedream-5-0-pro` | 契约 canonical 改连字符形（或补 alias），与 `model-picker.js` 对齐 | 无（裁决已由 lint + 文档 redirect 给出方向） |
| **P0** | `jina-reader-v1` | 新建音频/阅读族契约行；同时裁决 registry 是否扩"网页提取"op | U10 |
| **P1** | `wan-3.0-prime` / `-prime-ref` / `-ref` | **已完成架构收敛**：上游网关已统合为单一公开 ID `wan-3.0`，三款衍生型号降级为过渡别名（Issue #1696） | 已收敛 |
| **P1** | `pixverse-v6` / `vidu-q3` / `qwen-image-3-0` | 各新建独立行（text_to_video / text_to_video / text_to_image） | U8（日期口径）；qwen 还有 N2 拼写 |
| **P1** | `ltx-2-3-kj` / `index-tts` / `zimage-makeup` | 各新建独立行（digital_human / voice_clone / text_to_image） | U12（端点族表达）、U14（promptPolicy）、U7（快照） |
| **P1** | `grok-imagine-video` | 裁决后补 alias 或新建行 | N6 |
| **P2** | `gemini-omni-1.1` / `gemini-omni-flash` | 先做文档 id 治理裁决，再决定是否登记（很可能只登记 `gemini-omni-1.1-flash`） | N4 / U9 |
| **P2** | `minimax-h3-{t2v,flf,endframe,fl2va}` | 不新建行；补 dispositions alias 条目 + 文档侧整改说明 | U5（fl2va）、U6（endframe wire） |
| **P2** | `depth-video` | 待补在售快照与参数证据后再排 | U7、U1 |

---

# 附录 A：本轮未修改任何文件

本单为只读产出。核查过的三个源目录的 mtime 与内容均未变动；未向任何端点发起请求。

# 附录 B：主要证据文件索引

| 类别 | 路径 |
| --- | --- |
| 文档页（zh） | `DOCS/zh/api-reference/{video,image,audio,reader}-series/models/*.mdx` |
| 文档页（en 对照） | `DOCS/en/api-reference/...`（与 zh 同构，逐行对应） |
| 文档导航与重定向 | `DOCS/docs.json`（`navigation.languages[1].tabs[0].groups[*]`、`redirects[*]`） |
| 文档 OpenAPI | `DOCS/openapi/relay.json` |
| 网关生产快照 | `GW/docs/ops/channel-catalog-matrix-data.js`（2026-09-12） |
| 网关上架批次 | `GW/docs/ops/channel-catalog-onboard-zh.md` |
| 网关治理 SOP | `GW/docs/ops/model-integrity-and-governance-sop-zh.md` |
| 网关账本 | `GW/scripts/ops/pricing-ledger/models/{apimart,evolink,jina}.json`、`official-apimart-prices.json`、`official-evolink-prices.json`、`id-map-evolink.json`、`official-pricing-sources.json` |
| 网关命名审计 | `GW/scripts/ops/pricing-ledger/reports/naming-lint-latest.json`、`naming-prod-audit.md`（+ `.json`）、`naming/model_aliases.json`、`naming/official-dot-allowlist.json`、`naming/forbidden-fragments.json`、`naming/lint.js`、`naming/rules/` |
| 网关目录修复脚本 | `GW/scripts/ops/fix-catalog-integrity.js`、`GW/scripts/ops/pricing-ledger/naming/apply-prod-rename.js` |
| 网关 Go 适配器 | `GW/relay/channel/task/{apimart,gxgenai,sora}/*.go`、`GW/relay/channel/{xai,jina}/*.go` |
| 桌面端契约层 | `CT/contract/operation-registry.json`、`dispositions.json`、`auto-serving-manifest.json`、`CT/specs/{video,image,audio}-models.yaml` |
| 桌面端设计文档 | `omnimux-dsh/docs/specs/2026-09-05-wan-3-ref-wire-design.md`、`2026-09-05-minimax-h3-end-frame-design.md`、`2026-09-05-model-evidence-backfill-video-{prd,design}-addendum.md`、`docs/specs/README.md` |
| 产品界面引用 | `omnimux-dsh/plugins/omnimux-market/src/client/model-picker.js`、`omnimux-dsh/plugins/omnimux/src/reader/{client,mount,fetch}.js` |
