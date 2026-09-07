---
title: "Seed Audio 1.0 文本转语音接口与离线实现证据"
id: "evidence-model-seed-audio-1-0-text-to-speech"
type: "evidence"
status: "living"
date: "2026-09-07"
authors: ["Bei"]
subsystem: "omnimux/media"
---

# Seed Audio 1.0 — text_to_speech

## 来源与证明范围

- 渠道：OmniMux 网关的 OpenAI 兼容语音接口；不是直接向火山原厂发送 OpenAI 请求。
- 接口准据：Issue #715 实施任务提供的完整网关请求/响应契约（2026-09-07）。任务提供方声明“火山引擎 HTTP v3 语音合成接口已在网关验证”。catalog 的 verified/live 状态按该提供方结论登记。
- 原厂接口标识：`POST https://openspeech.bytedance.com/api/v3/tts/unidirectional`。原厂协议转换由网关负责；中枢不持有火山凭据，不发送原厂协议字段。
- 本记录未取得网关实测的原始日志、request ID、真实时长或音频文件，也未独立核验官方参数页。本轮仅使用离线 fixture，不把 mock、HTTP 构造检查或本地文件写入冒充真实模型生成。
- 验证边界遵循 [模型接口准据](../contracts/model-api-authority.md) 与 [节点输入提交合同](../contracts/node-input-submission.md)。

## 网关接口文档

`POST /v1/audio/speech`，`Content-Type: application/json`，鉴权由中枢现有 media auth 解析，使用 Bearer API key 或登录 token。

```json
{
  "model": "seed-audio-1.0",
  "input": "文本内容",
  "voice": "zh_male_guanggaojieshuo_uranus_bigtts",
  "speed": 1.0,
  "response_format": "mp3"
}
```

- canonical 模型：`seed-audio-1.0`；`doubao-seed-audio-1.0`、`seed-audio` 只作为产品别名，发送前归一。
- operation：`text_to_speech`；profile/seam：`audioGenerate`。
- `prompt` 是朗读正文，原样映射为 `input`；音色/语速不拼进正文，不发送 `prompt`、`metadata` 或 `operation`。
- `voice` 默认“广告解说 2.0”；产品契约枚举本任务确认的五个常用音色。标题中的 509+ 是提供方对上游音色库的描述，不表示本次已枚举全部音色。
- `speed` 默认 1.0，要求有限数值；本任务未提供可用上下限，不从其他渠道推断。
- 产品 `format` 映射到 `response_format`，支持 `mp3`、`wav`、`pcm`，默认 `mp3`。
- 200 响应体为音频二进制，非 JSON、非异步任务；`Content-Type` 对应音频格式，例如 MP3 为 `audio/mpeg`。未知/非音频 MIME 与空体不写入产物。

| Response Header | 中枢结果 | 说明 |
| --- | --- | --- |
| `x-audio-duration` | `duration` | 单位秒，转有限非负 number；缺失或非法时为 undefined，不伪造为 0 |
| `x-audio-url` | `url` | 试听直链原值透传；可缺失，不再次下载该 URL |
| `Content-Type` | 内部产物 MIME 校验 | 必须为音频类型，不把 JSON/HTML 错误页写成音频 |

成功后将响应字节保存至调用方 `dest`，返回 `{ mode: 'live', model, duration, url, dest }`。同步接口即使 `wait: false` 也返回已写盘的 live 结果，没有 taskId。既有带 `taskId` 的请求继续轮询原 `audio/generations`，不重新提交或转入 speech。

## 用例与验收

### 提供方网关实测记录

任务提供方报告上述默认音色、1.0 语速、MP3 请求已经在网关验证。未提供完整原始实测样本，本记录不填造响应 Header 值、耗时、文件路径或试听地址。

### 本轮离线回归用例

- canonical 与两个别名、默认参数和显式音色/语速/格式均捕获实际 POST JSON，核对正文完整且没有多余字段。
- `omnimux_audio_submit` 工具和 `audioGenerate` seam 使用相同 SubmitGuard，选定音色、语速、格式完整进入请求；catalog 按 operation 的 TTS 默认值与 media 路由默认值一致。
- MP3/WAV/PCM 二进制写盘与 Header 解析；无试听 URL 也可成功，不轮询、不额外下载。
- 无正文、非法音色/格式/非数值语速在 HTTP 与凭据解析前拒绝；未就绪旧模型仍拒绝首次提交。
- 401、402、携额度证据的 429、渠道不可用、普通服务失败、非 200 成功码、空体、错误 MIME、网络异常和取消均不伪报成功。
- 已有异步 taskId 仍 GET 轮询并下载；旧音乐映射仍使用其任务载荷。

验收命令（仓库根）：

```sh
pnpm --filter omnimux test
pnpm verify:model-contracts
git diff --check
```

### 2026-09-07 离线执行结果

基线：`2ad0366c549936fe4e291b4aa0b43a4b35c916c9`，任务工作树本地未提交差异。

- `pnpm --filter omnimux test`：141 个文件，网络防护 2/2，主测试 1242/1242，总计 1244/1244，无失败、跳过或取消。
- `pnpm verify:model-contracts`：strict `ok=true`，admission errors=0/warnings=0；59 个 runtime ID、45 个模型契约、14 个 alias；55 个 listed operations、22 个 listed models；dispositions unresolved=0。
- `pnpm check:boundaries`：2042 个插件源文件边界检查通过。
- `pnpm verify:tools`：0 错误、0 警告。
- 修改/新增的 24 个 JS 文件通过 `node --check`；`git diff --check` 通过。

依赖复用主检出已有 `node_modules`，未执行安装或构建。pnpm 11 默认在运行脚本前自动安装，初次命令因此触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`；验收命令通过进程变量 `pnpm_config_verify_deps_before_run=false` 关闭自动安装后执行，未关闭或放宽测试、网络防护及契约检查。

以上检查不证明当前线上可用性、音质、计费、真实浏览器交互或 Dev/Production 部署状态；未调用真实模型、提交、push、合并或部署。
