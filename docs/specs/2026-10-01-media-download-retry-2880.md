# Issue #2880 规格：增强 downloadMediaFile 轮询下载自愈与暂态重试机制

## 背景与问题陈述
在工作流画布或直接媒体生成中，异步视频生成模型（如 `minimax-h3`）提交后由任务轮询中枢轮询。当任务状态转为 `succeeded` 时，上游接口返回视频下载直链 `https://omnimux.ai/v1/videos/<taskId>/content`。
然而，上游内容服务存在 5–15 秒的转码/缓存同步窗口。在视频完全就绪前直接请求该 content URL，服务端会返回 HTTP 400，响应体为：
`{"error":{"message":"Task is not completed yet, current status: NOT_START","type":"invalid_request_error"}}`

旧实现中，`plugins/omnimux/src/media/job.js` 的 `downloadMediaFile` 仅执行单次请求，收到 HTTP 400 后立即抛出 `[omnimux:omnimux-download-failed] download failed: 400`，导致正在正常生成且实际已成功的节点被误报失败。

## 方案设计
1. **暂态判定与自愈范围** (`isDownloadRetryable`)：
   - HTTP 400 且错误信息包含 `not completed` / `not_start` / `processing` / `queued` / `pending` / `task is not`；
   - HTTP 404（资源在对象存储/CDN 边缘节点尚未传播完成）；
   - 标准暂态状态码（`RETRYABLE_STATUS`：408, 409, 429, 500, 502, 503, 504）；
   - 网络抖动 / 瞬态 fetch 异常（排除 AbortError 与 `omnimux-aborted`）。
2. **下载重试循环**：
   - 默认重试上限 `maxRetries: 30`（或传参配置）；
   - 默认重试间隔 `retryDelayMs: 1500`（或传参配置）；
   - 支持透传 `options.signal` 与 `options.sleep`（便于单测与中断取消）；
   - 任何已确认的不可重试错误（401 Unauthorized / 403 Forbidden / 额度超限 / 渠道不可用 / 外部取消）立即终止，不进行无效重试。
3. **调用方贯通**：
   - `plugins/omnimux/src/media/execute.js` 中的 `finishMediaTask` 与同步等待下载透传 `sleep` 与 `signal`。

## 验收标准
1. 单测用例验证：
   - `isDownloadRetryable` 准确识别 `Task is not completed yet`、404、5xx 等暂态错误；
   - 对 401、403、参数校验错误立即判定不可重试；
   - `downloadMediaFile` 经历前 N 次 400/404 并在第 N+1 次返回 200 时自愈成功落盘；
   - 支持 AbortSignal 协作式中断；
   - 超出重试次数后抛出携带详细错误信息的 `omnimux-download-failed`。
2. 真机/端到端验证：
   - 在 OmniMux 运行态中，对报错节点点击重新生成，完整跑通 minimax-h3 首帧视频生成与收取。
