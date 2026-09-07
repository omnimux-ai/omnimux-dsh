---
title: "豆包 ASR 接口与离线实现证据"
id: "evidence-model-doubao-asr-bigmodel-speech-to-text"
type: "evidence"
status: "living"
date: "2026-09-07"
authors: ["Bei"]
subsystem: "omnimux/media"
---

# Doubao ASR — speech_to_text

## 来源与证明范围

- 接入来源：[Issue #744](https://github.com/omnimux-ai/omnimux-dsh/issues/744) 的实施任务契约，2026-09-07 提供；通过 OmniMux 云端的 OpenAI 兼容音频转写端点消费火山引擎豆包 ASR，不向原厂发送 OpenAI multipart。
- `research: verified`、`execution: live` 按本任务明确指定的 catalog 状态登记；本轮只验证本地实现，不提供独立真实模型执行结论。`implementation: ready` 对应离线覆盖。
- 本任务未提供选定渠道官方参数页、原始真实请求日志或 request ID。上述状态不补足这些证据，不能据此宣称独立核验了官方文档、线上可用性、字幕质量、音频长度/大小上限或计费。
- 未调用真实模型、上传真实素材、查询在线模型列表或探测可用参数；遵循[模型接口准据](../contracts/model-api-authority.md)。

## 输入与响应契约

`POST /v1/audio/transcriptions`，multipart/form-data；鉴权复用中枢 media auth，不在工作流保存凭据或创建 provider HTTP client。

| 字段 | 值 / 映射 |
| --- | --- |
| `model` | `doubao-asr-bigmodel`；`seedasr-auc` 提交前归一为 canonical ID |
| `file` | 中枢读取 `audio` 的实际字节；支持绝对本地路径、HTTP(S) URL、`data:audio` URI；按字节识别音频格式 |
| `response_format` | `json`（中枢默认）、`text`、`verbose_json`、`srt`、`vtt` |
| `language` | 现有可选语言提示透传，不据此推断渠道语言支持集合 |

- 内部标准 operation 为 `speech_to_text`，profile/seam 为 `speechToText`；只需一个 source audio，不额外要求 prompt，输出类型为 `text`，不进入音频生成桶。
- 字节格式识别是中枢实现约束，不伪造为上游限制；未获得的大小、时长及格式上限不填任意数值。
- 单次同步响应，无任务轮询、无下载 dest。JSON 提取 `text`（兼容已有转写 envelope）；纯文本/SRT/VTT 保留文本与换行，统一返回 `{ mode: 'live', model, text }`。
- 响应流只读一次，再解析 JSON 或保留文本；错误响应先分类，不包装成成功转写。空白/无文本响应拒绝。

## 工作流接口（T03）

`POST /omnimux-workflow/api/workspaces/:workspaceId/speech-to-text`

```json
{
  "nodeId": "audio-node-id",
  "audioPath": "/absolute/path/to/source.mp3",
  "model": "doubao-asr-bigmodel",
  "responseFormat": "srt"
}
```

- `model` / `responseFormat` 可省略，分别默认上述值；`nodeId` 与 `audioPath` 必填。
- 路由复用本地写入防护与 JSON body 限制，调用注入的 `speechToText.execute({ model, audio: audioPath, response_format: responseFormat })`。
- 文件/URL 的加载、字节识别与 provider I/O 全部在中枢；缺少 seam 返回清晰错误，不返回 mock 字幕，不触发音频再生成。
- 成功保留 `{ ok: true, text, model }` 顶层字段，并附统一 `{ code: 0, data: { text, model }, message: '' }`；错误返回 `{ ok: false, code: HTTP状态, data: null, error: 稳定错误码, message: 安全说明 }`，不含异常堆栈、凭据或供应商原始响应。
- 工作区必须存在；不要求 `nodeId` 已持久化，避免音频节点刚创建时的自动保存竞态。`nodeId` 仅作请求校验，不透传给供应商。
- 路由不修改画布、创建文本节点或启动 execution；这些归调用方的 T02/T04/T05 实现。

## 离线验收

- canonical/alias 准入、默认格式、五种格式映射；非法格式和缺少音频在 HTTP/凭据读取前拒绝。
- multipart 内容断言，原生 `Response` 的 SRT、VTT、纯文本与 JSON 提取，空白与 HTTP 错误处理。
- 工作流默认/自定义参数、缺失 seam、错误传播、非法输入、跨源请求与真实注册链路的离线测试。

在任务工作树根执行：

```sh
pnpm verify:model-contracts --strict
pnpm --filter omnimux test
pnpm --filter omnimux-workflow test
```

### 实际结果（2026-09-08，Asia/Shanghai）

基线：`f3a5bfeaf529b3b6a7a7ced04157283c84bffb73`；目标：`agent/workflow-speech-to-text-srt-node-issue-744` 的未提交任务树差异。

| 检查 | 结果 |
| --- | --- |
| `pnpm verify:model-contracts --strict` | PASS；errors=0、warnings=0、listedOperations=56；fingerprint=`4ab76ab12bd2e457` |
| `pnpm --filter omnimux test` | PASS；主套件 1284/1284，网络防护自检 2/2 |
| `pnpm --filter omnimux-workflow test` | PASS；1235/1235（含 15 项转写路由用例） |
| `pnpm --filter omnimux-workflow build` | PASS；任务树 Host/client/canvas 构建完成 |
| `pnpm --filter omnimux-workflow typecheck` | PASS；canvas 与 Host |
| `pnpm check:boundaries` | PASS；2114 个源码文件 |
| `pnpm verify:tools` | PASS；12 个插件的工具声明与文档一致 |
| `pnpm test:gates` | PASS；128/128 |
| `git diff --check` | PASS |

测试环境复用现有依赖的任务树链接；执行 pnpm 时设置 `pnpm_config_verify_deps_before_run=false`，避免重装共享依赖。额外门禁首次缺少其他插件 React 依赖，且 Electron Node shim 的相邻路径没有 corepack；补齐依赖链接并使用真实 Node/corepack 后全绿，未修改门禁代码。

运行时代码与新增/拆分测试文件均不超过 300 行。STT 音频加载/元数据助手与测试按职责拆分；原有超长 SubmitGuard 测试拆为准入、slots、mapper、execute 四文件，保留既有用例；工作流静态文件传输抽入 `serveFile.ts`，保持 Range/MIME 行为。音频 URL 鉴权匹配收窄为 `omnimux.ai` 或其子域，防止凭据发送至域名相似站点或 query 命中。

测试通过证明实现与本任务契约一致，不证明真实上游执行、性能/字幕质量或运行环境部署。无客户端实现变更，本次后端子任务不提供浏览器验收；未提交、推送、合并或物化任何 App/profile。
