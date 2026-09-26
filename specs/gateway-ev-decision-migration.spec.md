# Spec: 移除 Jev 决策模型直连接口并迁移至统一上游网关

## 1. 目标与背景
执行中枢此前接入的 TypeSafe Jev 决策模型（`omnimux_jev_decision`）走的是 OpenRouter 直连渠道（`https://openrouter.ai/api/alpha/decisions`，依赖 `OPENROUTER_API_KEY`）。
现统一上游网关已接入 Jev/EV 决策服务接口（统一暴露标准模型 ID `jev`，专有决策端点 `/v1/decisions`）。
本任务目标：
1. 将执行中枢内旧版 OpenRouter 直连接口及凭证逻辑全部移除，确保无任何代码与密钥残留。
2. 对接统一上游网关决策端点，收敛至中枢统一官方客户端与官方密钥凭据体系（`OMNIMUX_API_KEY` / `OMNIMUX_TOKEN`）。

## 2. 接口契约与重构规范
### 2.1 移除范围（清理直连接口）
- 彻底移除 `DECISIONS_API_URL = 'https://openrouter.ai/api/alpha/decisions'`。
- 彻底移除 `resolveOpenRouterApiKey` 及对 `OPENROUTER_API_KEY` 的读取、环境变量检查与文件匹配逻辑。
- 彻底移除 `plugins/omnimux/src/host/apply.js` 中的 `resolveOpenRouterApiKeyFromHub` 函数。
- 彻底移除 OpenRouter 专有 Headers（`HTTP-Referer`, `X-Title`）。

### 2.2 上游网关对接契约
- **基址解析**：通过 `resolveDecisionsBaseUrl` 解析 `env.OMNIMUX_BASE_URL`，默认 fallback 为 `https://api.omnimux.ai/v1`。
- **决策端点**：`${baseUrl}/decisions`（POST 请求）。
- **认证方式**：复用统一网关密钥 `OMNIMUX_API_KEY` / `OMNIMUX_TOKEN`，通过 `resolveGatewayApiKey` 解析，请求头带 `Authorization: Bearer <KEY>`。
- **默认模型 ID**：统一使用网关标准在售 ID `jev`（原 `~typesafe/jev-latest` 作为 fallback 映射，缺省模型统一为 `jev`）。
- **请求体契约**：保持与原生 System One 兼容的标准输入：
  ```json
  {
    "model": "jev",
    "state": "<context>",
    "questions": {
      "<question_id>": { "type": "choice|score|noul", ... }
    }
  }
  ```
- **错误分类与配额守卫**：
  - 接入 `classifyQuotaFailure`，准确识别 `quota-exceeded` 与 `needs-omnimux` 状态并抛出规范的 `OmnimuxError`。
  - 未配置网关密钥时抛出 `omnimux-unconfigured`。

## 3. 测试策略与验收用例
- **AC-1 (直连清理)**：代码中 `decisions/` 与 `host/apply.js` 零 `OPENROUTER_API_KEY` 引用，零 `openrouter.ai` 接口调用。
- **AC-2 (网关端点调用)**：单测模拟网关请求，断言请求发往 `${baseUrl}/decisions`，请求头携带 `Bearer ${OMNIMUX_API_KEY}`，请求体默认 `model: "jev"`。
- **AC-3 (鉴权缺省拦截)**：未设置 `OMNIMUX_API_KEY` / `OMNIMUX_TOKEN` 时，抛出 `omnimux-unconfigured` 错误。
- **AC-4 (配额超限分类)**：当网关返回 402/429 且符合配额不足特征时，抛出 `quota-exceeded` 错误。
- **AC-5 (单元测试全绿)**：`pnpm test plugins/omnimux/src/decisions/` 全量通过。
