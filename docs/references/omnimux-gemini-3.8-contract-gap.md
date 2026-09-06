# Gemini 3.8 Flash：网关模型 ID 与输入合同缺口

核对日期：2026-09-06。关联：#654。

## 已确认的本地来源

| 来源 | 版本 | 结论 |
| --- | --- | --- |
| OmniMux `docs/ops/model-channel-catalog.json` | `b77c329093a378e88a59bc7dac3e1f4d6f21e302` | 公开 ID 与上游 ID 均为 `gemini-3.8-flash`；目录记录渠道 #26 APIKEY、#38 APIMart、#39 EvoLink |
| OmniMux `docs/product/text-model-id-cost-routing-study-2026-09-05.md` | 同上 | 第 154 行将三条路由的视觉等能力列为待验收；目录声明不是具体输入合同 |
| OmniMux-docs `zh/api-reference/text-series/gemini/complete.mdx`、`openapi/ops/chat/gemini.json` | `48e8b6203bb008786fbc04b445c7646286f29f9b` | 共用接口为 `POST https://api.omnimux.ai/v1/chat/completions`；模型枚举包含 3.7，未包含 3.8 |

官方发布入口：[Gemini 完整参数](https://docs.omnimux.ai/zh/api-reference/text-series/gemini/complete)。2026-09-06 读取该页面的 `.md` 版本，在线模型枚举同样仅到 3.7；没有 3.8。未查询在线模型 API 列表、上传媒体或调用真实模型。

## 接入前缺少的证据

当前共用 OpenAPI 定义了 `image_url`、`input_audio`、`video_url` 等内容类型，但不能据此宣称未列入模型枚举的 3.8 支持全部类型及任意组合。接入需要网关对应 `gemini-3.8-flash` 的正式接口合同，明确媒体编码、输入角色、数量、格式、大小/时长与混合输入约束。没有文档说明的限制应保持未知。

不使用 CPA 的 `gemini-3.8-flash-high` 替代网关 ID，不从 3.7 复制能力、历史执行或 `listed` 状态。模型 ID 已确认，3.8 的多模态合同及默认模型切换仍未完成。

## 当前 Hub 实现边界

`textComplete` 接受有序 `references`，每项为 `type`、`pathOrUrl`，并保留可选 `role`、`targetSlot` 和素材元数据。显式列表中的重复项保留，兼容字段 `image`、`video`、`audio`、`audioTrack` 只补充列表中尚未出现的同类型同路径媒体。

所有图片按顺序经过探测、现有模型/operation 合同校验，再保存附件并发送。视频依照已有合同最多一条，仍使用既有 `image_url(data:video)` 协议。音频、图视频混合输入及任何不支持的素材均明确拒绝，不能静默丢弃后继续生成。本次未扩大已有模型能力声明，也未把旧视频协议认定为 3.8 的接口规范。
