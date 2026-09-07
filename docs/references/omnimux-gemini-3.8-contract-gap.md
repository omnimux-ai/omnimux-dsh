# Gemini 3.8 Flash：OmniMux 接入依据

确认日期：2026-09-06。关联：#651、#654。

## 型号与兼容性依据

本任务中用户明确确认：“它跟 3.7 是一样的”。据此，`gemini-3.8-flash` 复用同一 OmniMux 网关下现有 `gemini-3.7-flash` 的输入合同、参数和 mapper。这是本任务明确提供的兼容性依据，不表示官方页面已独立列出 3.8，也不继承 3.7 的历史真实执行结果。

| 项目 | 定义与来源 |
| --- | --- |
| canonical / wire ID | `gemini-3.8-flash`；OmniMux `docs/ops/model-channel-catalog.json`，版本 `b77c329093a378e88a59bc7dac3e1f4d6f21e302` |
| Provider | 已有 `omnimux`；不使用 CPA ID 或新增路由 |
| 通用端点 | `POST https://api.omnimux.ai/v1/chat/completions` |
| 继承对象 | `plugins/omnimux/src/catalog/specs/text-models.yaml` 中的 `gemini-3.7-flash`，以及 `cordis.patch.yml` 中对应参数 |
| 公开接口说明 | [Gemini 完整参数](https://docs.omnimux.ai/zh/api-reference/text-series/gemini/complete)；2026-09-06 核对时枚举未明列 3.8，适用关系由上述用户确认补充 |

## 实现范围

- 注册 `chat` 与 `vision_chat`，使用 `textComplete`。支持现有文字、多图或单视频路径；保留输入顺序与 operation。
- 继承现有 3.7 的图片 MIME、最多 10 图、20MB 和单 MP4 视频、50MB 等产品保守限制，保持 `policy_conservative`。这些值不是新确认的 3.8 官方服务上限，也不是 3.8 实测结果。
- 音频、图片与视频混合、多视频仍按现有 3.7 实现明确拒绝。通用 OpenAPI 有字段不代表现有 mapper 已完整覆盖。
- 界面参数继承 3.7 的上下文、输出 token 和思考档定义。原有 3.7 注册与显式选择保留，新的文本默认项为 3.8。
- 目录 `research.verified` 记录本任务的兼容性确认，`implementation.ready` 记录复用代码及离线验证；`execution.none` 明确未发起 3.8 真实请求。

## 验证

离线用例检查 3.7 / 3.8 的输入槽与参数一致、3.8 就绪但无 live 记录、默认选择、全部图片与单视频的 wire ID、拒绝不支持组合以及界面白名单投影。不调用模型 API 探测支持范围；目录与代码通过不替代[ego-browser 共享探针验收](../contracts/plugin-qa.md)。
