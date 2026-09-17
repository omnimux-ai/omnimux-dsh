---
title: "Index TTS 声音克隆（voice_clone）接口与离线实现证据"
id: "evidence-model-index-tts-voice-clone"
type: "evidence"
status: "living"
date: "2026-09-18"
authors: ["agent"]
subsystem: "omnimux/media"
---

# Index TTS 声音克隆 — voice_clone

## 来源与证明范围

- 渠道：OmniMux 网关（`https://api.omnimux.ai/v1`），不是直接向原厂发送请求。
- 接口准据：渠道官方文档 `OmniMux-docs/zh/api-reference/audio-series/models/index-tts.mdx`（英文同构件在 `en/` 下），于 2026-09-18 离线核对；上架事实见网关 changelog `2026-08-16-index-tts-ltx-docs`（「上架 Index TTS 声音克隆」）。
- 本轮未发起真实模型调用，未取得网关实测的原始日志、request ID、真实时长或音频文件。登记结论只依据官方文档与离线夹具，不把 mock、HTTP 构造检查或本地文件写入冒充真实模型生成。
- 验证边界遵循 [模型接口准据](../contracts/model-api-authority.md) 与 [节点输入提交合同](../contracts/node-input-submission.md)。

## 渠道接口文档

创建：`POST /v1/video/generations`（异步）；轮询：`GET /v1/video/generations/{task_id}`。文档明写「GxgenAI 任务共用这条路径，即使产物是音频」，并要求轮询不得使用 `*-async` / `*-query` 模型名。

```json
{
  "model": "index-tts",
  "prompt": "index-tts-run",
  "metadata": {
    "nodeInfoList": [
      { "nodeId": "4", "fieldName": "audio", "fieldValue": "https://example.com/voice.mp3" },
      { "nodeId": "7", "fieldName": "text", "fieldValue": "你好，这是一段声音克隆测试。" }
    ]
  }
}
```

- canonical 模型：`index-tts`；operation：`voice_clone`；profile/seam：`audioGenerate`。
- 必填节点：`4`/`audio` = 克隆参考音（服务端自动截取前约 15 秒）；`7`/`text` = 要朗读的文字。
- 顶层 `prompt` 文档标注为非必填「仅作标签」；朗读内容以节点 7 为准。
- 参考音须为公网 URL 或上游 fileName，**不得传 `data:` URI**。
- 文档未写输出格式、采样率与参考音时长上限；本行不推断，也不向 vendor 发送未文档化字段（如 `format`）。

## 实现要点

| 关注点 | 实现 |
| --- | --- |
| 契约登记 | `catalog/specs/audio-models.yaml` 新增 `index-tts` 行，`voice_clone` 列为 listed，输入槽 `prompt`（文本，必填）与 `voice_sample`（音频，必填，role `audio_track`） |
| 白名单形状 | `adapter-profiles.json` 的 `audioGenerate.operationVendorShapes.voice_clone`：`allow: [model, prompt, metadata]`，`require: [metadata]` |
| 请求映射 | `submit-guard/map.js` 的 voice_clone 分支把参考音与文稿装配为 `metadata.nodeInfoList`（节点 4 / 节点 7），并把 `model` 写入 vendor 载荷 |
| 端点归属 | `vendors/omnimux.js` 的 `taskPathFor(capability, modelId)`：音频能力模型 `index-tts` 的提交与轮询都走 `video/generations`；其余模型仍用能力默认路径 |
| 轮询/对账 | 提交、运行时内部等待轮询与 `taskId` 对账三条路径都携带同一 `taskPath`，避免提交与轮询打到不同端点 |

## 用例与验收

### 本轮离线回归用例

- 契约装载：`index-tts#voice_clone` 判定为 `listed: true`，准入错误 0。
- 请求构造：POST 到 `/v1/video/generations`，正文为 `{ model, prompt, metadata.nodeInfoList }`，节点 4/7 齐备。
- 端点归属：轮询打到 `/v1/video/generations/{task_id}`；给定 `taskId` 的对账路径同样使用视频任务端点。
- 拒绝面：缺参考音（`slot voice_sample needs min 1, got 0`）、缺文稿（`prompt is required for this operation`）、`data:` URI 参考音在发出请求前被拒。
- 无未文档化字段：`format` 不进入 voice_clone 的 vendor 载荷。
- 既有链路不回归：`seed-audio-1.0` 的同步语音、`suno` 音乐任务、语音识别链路行为不变。

验收命令（仓库根）：

```sh
node --test "plugins/omnimux/src/catalog/contract/**/*.test.js" "plugins/omnimux/src/media/*.test.js"
pnpm verify:model-contracts
git diff --check
```

### 2026-09-18 离线执行结果

- 契约与媒体测试：552 个用例，552 通过，0 失败。
- `pnpm verify:model-contracts`：strict `ok=true`，admission errors=0 / warnings=0，listedOperations=24，dispositions total=79 / unresolved=0，cross-plugin offline `ok=true`。

以上检查不证明当前线上可用性、音质、计费、真实浏览器交互或 Dev/Production 部署状态；未调用真实模型、提交、push、合并或部署。上线前的真实执行证据需按 [模型接口准据](../contracts/model-api-authority.md) 另行补充。
