# Gemini 3.8 Flash：OmniMux 接入依据

确认日期：2026-09-06（初版兼容性确认）；2026-09-16（上游 5e61dc3ce 全模态规格与格式丰富）。关联：#651、#654、#2071。

## 型号与兼容性依据

1. 2026-09-06 用户确认：“它跟 3.7 是一样的”，`gemini-3.8-flash` 初版复用同一 OmniMux 网关下 3.7 的文本与基础图视契约。
2. 2026-09-16 上游 OmniMux（commit `5e61dc3ce`）发布全模态媒体格式补充：
   - 官方模型文档（`ai.google.dev/gemini-api/docs/models/gemini-3.8-flash`）声明输入支持 Text, Image, Video, Audio, and PDF；
   - 渠道 68（Vertex 直连）实测验证通过：PDF、音频、多格式视频无缝解析；
   - 补充格式：图片扩充 HEIC/HEIF；视频扩充 MOV/MPEG/AVI/WMV/FLV；音频支持 MP3/WAV/MPEG；文档支持 application/pdf。

| 项目 | 定义与来源 |
| --- | --- |
| canonical / wire ID | `gemini-3.8-flash`；OmniMux `docs/ops/model-channel-catalog.json`，版本 `b77c329093a378e88a59bc7dac3e1f4d6f21e302` |
| Provider | 已有 `omnimux`；不使用 CPA ID 或新增路由 |
| 通用端点 | `POST https://api.omnimux.ai/v1/chat/completions` |
| 继承与升级对象 | `plugins/omnimux/src/catalog/specs/text-models.yaml` 中的 `gemini-3.8-flash`，升级多模态格式与音频/文档槽位 |
| 公开接口说明 | [Gemini 官方模型页](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) 与 上游 commit `5e61dc3ce` |

## 实现范围

- 注册 `chat` 与 `vision_chat`，使用 `textComplete`。
- `vision_chat` 操作标签升级为「多模态对话」，输入槽位覆盖图片、视频、音频（`reference_audios`）与 PDF 文档（`reference_documents`）。
- 规格上限：图片单张 20MB（最多 10 张）、视频单条 50MB（最多 1 条）、音频单条 25MB（最多 1 条）、文档单份 50MB（最多 1 份）。
- 本地文本执行层（`execute.js`, `references.js`, `audio.js`, `document.js`, `chat.js`）支持将图片、视频、音频和 PDF 转换为标准数据载荷并发送。
- 目录 `research.verified` 记录本任务的兼容性与上游全模态确认，`implementation.ready` 记录代码及离线验证；`execution.none` 明确未发起 3.8 真实请求。

## 验证

离线用例检查 3.7 / 3.8 的输入槽与参数一致、3.8 就绪但无 live 记录、默认选择、全部图片与单视频的 wire ID、拒绝不支持组合以及界面白名单投影。不调用模型 API 探测支持范围；目录与代码通过不替代[ego-browser 共享探针验收](../contracts/plugin-qa.md)。
