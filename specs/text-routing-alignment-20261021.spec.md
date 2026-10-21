# 文本路由声明对齐网关现役（cordis.patch / CHAT_MODELS）

- Issue: #3527
- 日期: 2026-10-21
- 前置: #3516（中枢模型目录对齐，已合入 `9fa8a4c5c`）

## 1. 问题

2026-10-21 网关对账后，网关文本模型仅 `gemini-3.8-flash` 可达（`gemini-4-argon` 仅原生 Gemini 端点，OpenAI Chat Completions 不适用）。但中枢：

1. `plugins/omnimux/cordis.patch.yml` 仍声明 13 个文本模型，其中 12 个网关已不提供（`verify-models` 报 `not on gateway`）。
2. `plugins/omnimux/src/text/catalog.js` 的 `CHAT_MODELS` 仍投影全部 13 个契约文本模型（含 `deepseek-v4-flash` 这类未在 patch 中的行），使专家白名单与路由声明脱节（`verify-models` 报 `whitelist not on patch`）。

## 2. 方案

1. `cordis.patch.yml` 只保留网关现役且 OpenAI 兼容的 `gemini-3.8-flash`；删除 12 个不可路由模型行（契约、research、execution 证据仍在 catalog/dispositions 中登记，恢复渠道后可回填）。
2. `projectChatRows(index)` 只投影**已上架（listed）**且输出为文本的 text 管理组模型，使 `CHAT_MODELS`、`CHAT_MODEL_IDS`、`DEFAULT_TEXT.models` 与「真正可调用」的集合一致；未上架契约仍可被目录/处置表读取，但不进入 chat/专家白名单。
3. `verify-modality-matrix` 基线删除随 `gemini-3.7-flash` 路由行消失的缺口条目，保留 `gemini-3.8-flash` 的已知缺口。
4. 同步受影响测试，并补 `docs/evidence/2026-10-21-text-routing-alignment.md`。

## 3. 验收

- `pnpm verify:models` 退出 0（patch ⊆ 网关、CHAT_MODELS ⊆ patch、reasoning max）。
- `pnpm verify:model-contracts --strict`、`pnpm verify:modality-matrix`、`pnpm verify:cross-plugin-models` 通过。
- `pnpm --filter omnimux test`、`pnpm --filter omnimux-workflow test` 通过。

## 假设

- 网关 `/v1/models`（`api.omnimux.ai`）是当前公开可用文本模型的权威清单；`gemini-4-argon` 只提供原生 generateContent 端点，不能由 `openai-completions` 适配器调用，故不写入 patch 路由声明。
- 已上架（listed）是「可调用」的产品判据；未上架契约仅用于登记与恢复，不应进入专家/chat 白名单。

## 证伪方式

- 若 `pnpm verify:models` 仍报 `not on gateway` 或 `whitelist not on patch`，说明 patch 或 CHAT_MODELS 过滤未对齐，按报错 id 修正。
- 若删除 patch 行后 app 侧仍能选择已下架文本模型（composer/专家工具），说明目录投影或 gate 过滤仍有第二处真源，需按实际输出定位。
- 若 modality 门禁报「基线条目不再复现」或出现新缺口，说明基线删减不完整，按门禁报告增删对应条目。
