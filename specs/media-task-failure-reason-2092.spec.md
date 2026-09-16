# 媒体任务上游失败原因透传规格 (Issue #2092)

## 1. 业务问题与背景

创作画布上视频/图像节点生成失败时，界面的失败卡片只有一句 `[omnimux:omnimux-failed] video task task_xxx failed`，看不出任何可用原因。用户与支持都无法自助判断，只能回头找工程排查。

取证结论（Issue #2092 正文与 `.agent-reports/video-failure-2026-09-16/ROOT-CAUSE.md`）：

1. 上游**确实给了原因**：`GET https://api.omnimux.ai/v1/videos/{taskId}` 返回
   `error.message = "body.input.reference_image_urls: Failed to download the file. … (file_download_error)"`。
2. 本项目轮询用的是**浅层端点** `GET /v1/video/generations/{taskId}`（`vendors/omnimux.js` 的 `TASK_PATH.video`），同一任务它返回 `data.error = null`。
3. 即便响应体里有内容也会被丢掉：`protocols/openai-media.js` 终态失败分支只分流 quota / channel，其余直接抛 `omnimux-failed` 且不带响应体。

因此本次修复的目标是**可诊断性**，不是改变生成行为。

## 2. 范围

**做**：媒体层（`plugins/omnimux/src/media/`）在任务终态失败时，把上游原因取回并写进错误消息；为识别到的原因补一句可读中文与可操作建议。

**不做**：不改生成参数、不改路由/分组、不改 `omnimux-failed` 等既有错误码语义、不新增重试或自动降级、不动界面组件源码。

## 3. 接口与行为契约

### AC-1 响应体原因提取
终态失败时按以下顺序取第一个非空字符串作为上游原因：
`error.message` → `error`（字符串形态）→ `message` → `data.error.message` → `data.error`（字符串）→ `data.message` → `fail_reason` / `failure_reason` / `reason`（含 `data.*` 同名形态）。
实现落在 `vendors/omnimux.js` 的纯函数里，便于单测。

### AC-2 响应体无原因时补取详情（调用方显式开启）
- 补取**默认关闭**：`pollOpenAiMediaTask` 的一次请求契约保持不变（Issue #831：终态失败不重试、每次尝试一次 fetch）。只有 `resolveFailureReason: true` 的调用方才会多读一次任务详情。
- 开启方为两条面向用户的错误出口：`finishMediaTask`（画布轮询/对账入口）与 `createOpenAiMediaRuntime` 内部轮询（等待式生成入口）。
- 详情地址**优先由响应体自身推导**：取响应体 `url`（如 `https://omnimux.ai/v1/videos/{id}/content`）去掉结尾 `/content` 得到资源地址；无 `url` 时按能力回退到 `videos/{id}` 与当前 `baseUrl` 拼接（已实测目录：只有 `videos` 可用，`images`/`audios` 返回 `Invalid URL`）。
- 该补取是**尽力而为**：超时、网络错误、非 2xx、JSON 解析失败、结构不符，都只是拿不到原因，**绝不允许改变错误码或吞掉原始失败**。
- 响应体已带原因时**不得**发起补取请求（调用次数可断言）。

### AC-3 错误消息形态
保持 `code = 'omnimux-failed'` 不变；消息为「基础句（原样保留，便于日志检索）+ 中文结论 + 可操作建议 + 括号内的上游原文」。

- 取到原因：
  `video task task_x failed：模型方下载不到参考图，请重试或换一张参考图（上游：body.input.reference_image_urls: Failed to download the file. …）`
- 未取到原因：
  `video task task_x failed：上游未返回失败原因，请重试；若持续失败请把上方任务号反馈给支持`

### AC-4 已知原因的中文映射
按关键字识别（大小写不敏感、命中即止）：
- 参考图/参考素材下载失败（`failed to download`、`file_download_error`、`download`）→ 模型方下载不到参考图，请重试或换一张参考图
- 内容审核（`moderation`、`sensitive`、`nsfw`、`policy`、`risk`、`审核`）→ 内容未通过审核，请调整提示词或更换参考图
- 素材不可用/失效（`url is not accessible`、`invalid url`、`expired`）→ 参考素材地址已失效，请重新读取素材后再试
- 配额/余额（`insufficient`、`balance`、`quota`、`欠费`）→ 账户额度不足，请充值或更换渠道分组
- 超时（`timeout`、`timed out`）→ 上游生成超时，请重试
- 其余 → 上游生成失败，请重试；若持续失败请换一个模型或渠道分组

### AC-5 既有行为零回退
`quota-exceeded`（含 `classifyQuotaFailure` 的 channel-unavailable 分支）分流顺序与语义保持不变；成功路径（completed/success/succeeded）与截止时间语义不变。

## 4. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| V-1 | 上游 `error.message` 命中 AC-1 与 AC-3，消息含中文结论与上游原文 | 单测：伪造 poll 响应 |
| V-2 | 响应体带原因时不发起详情补取 | 单测：断言 fetcher 调用次数 |
| V-3 | 响应体无原因且调用方开启时补取详情并取到原因 | 单测：两次 fetch，第二次返回详情 |
| V-4 | 详情补取失败（500/坏 JSON/传输错误）仍抛 `omnimux-failed` 且消息退化为 AC-3 的无原因形态 | 单测：3 个分支 |
| V-5 | `quota-exceeded` 与 `CHANNEL_UNAVAILABLE` 分流不变 | 既有 `poll-lifecycle.test.js` 全绿 |
| V-6 | 目标包单测全绿（与主干基线逐条比对，无新增失败） | 工作树 vs 主检出同命令对照 |
| V-7 | #831 契约保持：未开启的轮询在终态失败上仍是 1 次 fetch，且不重试 | 既有 `h3-contract.test.js`、`poll-lifecycle.test.js` 不改动且全绿 |

## 5. 风险与回滚

- **风险**：失败路径多一次 GET，可能被上游限流。已限界：只在终态失败、且响应体无原因时触发；带超时；失败静默。可用 `resolveFailureReason: false` 开关关闭（内部选项，默认开启）。
- **回滚**：改动集中在 `media/vendors/omnimux.js` 与 `media/protocols/openai-media.js` 两个文件 + 单测，回滚即还原这两个文件。
