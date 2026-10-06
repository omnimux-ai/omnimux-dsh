# 任务规格 · #3225 502 错误归因透传

## 现象
分镜表/内容拆解接口的 502 把上游真实失败原因（通道拒绝、模型未启用、配置缺失）归一成「视频文件不满足理解要求」，排查必须翻服务端日志。

## 目标
路由失败响应体新增可选 `upstream` 字段：`{code: string, detail: string}`。code 为上游真实错误码；detail 为脱敏摘要（剔除绝对路径、URL、Bearer/sk- 密文，≤200 字符）。用户层中文友好文案不变。

## 改动
- `workflow/videoAnalyzeFailure.ts`：`VideoAnalyzeFailure` 增 `upstream?`；`describeVideoAnalyzeFailure` 透传原始 code 与脱敏 message。
- `videoDeconstruct/errors.ts` + `videoStoryboard/errors.ts`：错误类 + failure 序列化支持 `upstream`。
- `videoDeconstruct/service.ts` + `videoStoryboard/service.ts`：把 `failure.upstream` 传入错误对象。

## 验收
1. 上游携带原始 message 的错误 → 响应体含 `upstream.code`（真实码）与 `upstream.detail`（脱敏摘要）。
2. detail 不含 `/Users/`、`http(s)://`、`sk-`、`Bearer`。
3. 无上游错误 → `upstream` 字段缺省。
4. `pnpm --filter omnimux-workflow test` 全绿。
