# Spec: 语音合成（TTS / text_to_speech）中枢与画布完整接入契约与真实验收

- 业务主题：语音合成（文本转语音 / 配音 / TTS）
- 风险级别：R1（模型边界 + 跨插件闭环 + 真实在线执行）
- 准据：OmniMux 网关官方语音合成接口（`POST /v1/audio/speech`，OpenAI 兼容协议），遵循 `docs/contracts/model-api-authority.md`

## 1. 目标与用户旅程

**用户目标**：
在创作画布「文本转语音」节点（或助手音频提交工具）输入文本，选择音色、语速和输出格式，能够稳定、快速生成高品质的真人朗读语音音频文件，并可立即在线试听、保存与作为视频剪辑配音素材。

**关键用户旅程（端到端可观察）**：
1. **画布操作旅程**：
   - 用户在画布放置一个「文本」节点并输入文案，拖出连线选择「文本转语音」；或者直接在画布放置「文本转语音」音频节点并在卡片内填写文案。
   - 用户在底栏展开音色选择器，可从 509+ 种火山精品音色中搜索、试听并挑选心仪声音，调整语速（默认 1.0）与音频格式（默认 mp3）。
   - 用户点击「生成」，节点显示生成中动效，中枢同步或异步返回真实音频数据；生成完成后卡片展示音频波形、时长与试听控件，可直接播放。
2. **助手智能体交互旅程**：
   - 用户在对话框对助手说“把这段话转成语音”或使用音频生成工具，传入文本及可选参数（模型支持 `seed-audio-1.0` 或通用别名 `tts`），中枢顺利完成调用并落盘音频，返回试听地址与本地路径。

## 2. 渠道接口事实（准据）

| 项 | 规范值 |
| --- | --- |
| 接口端点 | `POST /v1/audio/speech` |
| 鉴权协议 | Bearer Token（API Key 或登录 Token） |
| 请求格式 | `application/json` |
| 响应格式 | 音频二进制流（`Content-Type: audio/mpeg`、`audio/wav` 等） |
| 主力模型 | `seed-audio-1.0`（火山引擎 Seed Audio 1.0 语音合成，覆盖 509+ 音色） |
| 契约模型别名 | `doubao-seed-audio-1.0`、`seed-audio`、`tts`（便捷归一化至主力模型） |
| 关键请求参数 | `model`（字符串）、`input`（待朗读文本）、`voice`（音色标识）、`speed`（语速，默认 1.0）、`response_format`（音频格式：mp3 / wav / pcm） |
| 关键响应头 | `x-audio-duration`（音频时长秒数）、`x-audio-url`（试听直链） |

## 3. 验收标准（AC）

- **AC-1 契约登记完备性**：
  - `seed-audio-1.0` 的 `text_to_speech` 操作判定为 `listed: true`。
  - `dispositions.json`、`adapter-profiles.json` 与 `auto-serving-manifest.json` 保持严格一致。
  - 允许通用 `tts` 别名平滑映射至主力模型 `seed-audio-1.0`，杜绝 `unknown model "tts"` 阻断。
- **AC-2 提交闸门规范校验**：
  - 通过 SubmitGuard 闸门，文本正文正确映射为 `input` 字段，参数 `voice`、`speed`、`format` 正确归一化为 `response_format`。
  - 严禁非文档化字段泄漏，严禁未允许的参考素材混入同步语音接口。
  - 文本为空、非法语速或非法格式时，在发出网络请求前由防线拦截并返回规范错误。
- **AC-3 中枢执行链路闭环**：
  - `executeOmnimuxAudio` 与 `audioGenerate` seam 支持全链路执行，并正确提取响应二进制写盘。
  - 正确解析 `x-audio-duration` 时长与 `x-audio-url` 试听地址，返回规范结果 `{ mode: 'live', model, duration, url, dest }`。
- **AC-4 画布执行器协同顺畅**：
  - `materialGatewayExecutor` 与 `omnimuxGateway` 处理同步 `mode: 'live'` 返回时无缝衔接。
  - 画布节点能够正确获取默认模型 `seed-audio-1.0`，无漏配或白名单误拦；执行后产物正确登记到画布资产列表。
- **AC-5 真实在线执行验证**：
  - 使用网关真实凭据发起真实模型调用，真实返回 HTTP 200 与有效音频二进制字节（文件大小 > 0，时长 > 0）。
  - 保存真实执行日志与元数据证据至 `docs/evidence/`。
- **AC-6 离线测试与自动化回归**：
  - `pnpm verify:model-contracts` 严格模式通过（`ok=true`，0 error，0 warning）。
  - `pnpm --filter omnimux test` 与 `pnpm --filter omnimux-workflow test` 全绿。
- **AC-7 无破坏性回归**：
  - 不影响声音克隆（`index-tts` / `voice_clone`）、语音识别（`doubao-asr-bigmodel` / `seedasr-auc`）及音乐生成能力。
- **AC-8 用户界面与文案自适应**：
  - 画布连线菜单与工具提示统一采用专业、清晰的中文（如“文本转语音 / 语音合成配音”），杜绝混淆为“生成音效”。

## 4. 证据要求

1. 契约门禁严格校验输出：`pnpm verify:model-contracts`。
2. 跨插件模型对齐验证输出：`pnpm verify:cross-plugin-models`。
3. 真实网关连通性与实测日志：真实请求 ID、时长、字节大小、音频生成文件。
4. 自动化测试套件全绿结果。
