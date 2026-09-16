# Spec: textComplete 直连仅走执行中枢（无 CPA 兜底）

## Goal
带视频/复杂媒体的 `textComplete`（含 `video_analyze`）只打执行中枢，不发现、不回退本机 CPA。

## Acceptance
1. 有 `OMNIMUX_API_KEY`（env 或 credentials）时，请求发往 `https://api.omnimux.ai/v1`（或显式 `OMNIMUX_BASE_URL`），模型 id 保持产品白名单 id。
2. 仅有 CPA 密钥 / settings 中的 cpa provider 时，**不**改走本机；直接 `omnimux-unconfigured`。
3. 显式 `baseUrl` / `apiKey` 入参仍优先。
4. 代码中无 `discoverChatProviderFallback` / CPA_API_KEY 扫描路径。

## Non-goals
不改 Agent 对话默认 provider；不改媒体生成 `media/route`（本已默认中枢）。
