# Spec: textComplete 视频直连优先执行中枢

## Goal
带视频/复杂媒体的 `textComplete`（含 `video_analyze` 五维深拆）默认打执行中枢 Gemini，不被本机 CPA 劫持。

## Acceptance
1. 同时存在中枢 `OMNIMUX_API_KEY` 与本地 CPA 时，请求发往 `https://api.omnimux.ai/v1`，鉴权用中枢密钥。
2. 仅有 CPA、无中枢密钥时，仍可回退本地 CPA（离线/开发兜底）。
3. 显式 `baseUrl` / `apiKey` / `OMNIMUX_BASE_URL` 入参优先于任何自动发现。
4. 模型 id 在走中枢时保持产品白名单 id（如 `gemini-3.8-flash`），不因 CPA 映射改成 `gemini-3.8-flash-high`。

## Non-goals
不改 Agent 对话默认模型；不改 CPA 作为会话 provider 的配置。
