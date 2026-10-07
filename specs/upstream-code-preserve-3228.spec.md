# 任务规格 · #3228 原始错误码透传

## 现象
`mapHubError` 把中枢错误码替换为 video 域码（`omnimux-invalid-request` → `video-invalid-input`），原始码丢失；#3227 的 `upstream.code` 只能拿到替换后的码。

## 目标
码替换时保留原始码，最终响应体 `upstream.code` 为原始中枢码。

## 改动
- `omnimux-video/src/errors.js`：`VideoError` 支持 `extra.upstreamCode`。
- `omnimux-video/src/understand/hub-errors.js`：发生码替换的分支带上原始码。
- `omnimux-workflow/src/workflow/videoAnalyzeFailure.ts`：`extractUpstream` 优先取 `upstreamCode`。

## 验收
1. 真实链路（hub 抛 `omnimux-invalid-request`）→ 响应体 `upstream.code === 'omnimux-invalid-request'`，detail 为脱敏文案。
2. 未发生替换的错误行为不变。
3. omnimux-video 与 omnimux-workflow 测试全绿。
