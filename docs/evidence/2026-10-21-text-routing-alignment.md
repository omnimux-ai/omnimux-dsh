# 文本路由声明对齐网关现役（2026-10-21）

- Issue: #3527
- 前置: #3516（中枢模型目录对齐，`9fa8a4c5c`）
- 方式：只读对账 + 离线门禁；未发起真实模型请求，未修改网关仓库。

## 问题

网关 `api.omnimux.ai/v1/models` 当前仅提供 `gemini-3.8-flash` 作为 OpenAI Chat Completions 文本模型（`gemini-4-argon` 仅原生 `generateContent` 端点，`openai-completions` 适配器无法调用）。中枢仍声明 13 个文本路由模型，`verify:models` 报：

- `not on gateway`：claude-opus-5、claude-opus-4-6、claude-sonnet-4-6、gpt-5.6-sol、gpt-5.5、grok-4.6、kimi-k3、deepseek-v4-pro、deepseek-v4-flash-vision-exp、gemini-3.7-flash、gemini-3.1-pro-preview、glm-5.3
- `whitelist not on patch`：deepseek-v4-flash（契约投影与路由声明脱节）

## 修改

1. `plugins/omnimux/cordis.patch.yml`：`llm-pi-ai` / `omnimux.models` 仅保留 `gemini-3.8-flash`；12 行不可路由声明删除（契约、research 与历史 execution 证据仍在 catalog/dispositions 登记，恢复渠道后可回填）。
2. `plugins/omnimux/src/catalog/project.js`：`projectChatRows()` 只投影 text 管理组中**有 listed 文本输出**的模型；`CHAT_MODELS` / `CHAT_MODEL_IDS` / `DEFAULT_TEXT.models` 因此收敛为 `['gemini-3.8-flash']`，未上架契约不再进入 chat/专家白名单。
3. `scripts/verify-modality-matrix.mjs`：删除随 `gemini-3.7-flash` 路由行消失的基线条目，保留 `gemini-3.8-flash` 的三项已知缺口（#3236）。
4. `docs/contracts/model-list-ownership.md`：补充 chat 目录 listed-only 的现行语义。

## 验证

- `node scripts/verify-models.mjs` → `verify-models: ok`（configured=1，missing=[]，whitelistMissing=[]，reasoning ok）。
- `node scripts/verify-modality-matrix.mjs` → `ok=true`（routeModels=1，knownGaps 仅 gemini-3.8-flash 三项）。
- `node scripts/verify-model-contracts.mjs --strict` → 全绿。
- `pnpm test:agent-tools` → 全绿。
- `pnpm --filter omnimux test`、`pnpm --filter omnimux-workflow test`、相关 gate 单测见 PR 记录。

## 影响

产品文本能力收敛到网关现役的 Gemini 3.8 Flash（composer、专家工具、多模态对话一致）；Claude/GPT/DeepSeek/GLM/Grok/Kimi/Gemini 3.7 等文本模型在网关恢复前不再被声明或可选，但不影响其契约与历史证据留存。
