---
title: "Seed Audio 1.0 文本转语音（TTS）真实网关执行与创作画布验收证据"
id: "evidence-model-seed-audio-1-0-text-to-speech-live"
type: "evidence"
status: "living"
date: "2026-09-18"
authors: ["齐活林", "寇豆码", "严过关"]
subsystem: "omnimux/media"
---

# Seed Audio 1.0 — 语音合成（TTS / text_to_speech）真实执行证据

## 1. 验证目标与说明

本证据记录遵循 [模型接口准据](../contracts/model-api-authority.md) 与 [节点输入提交合同](../contracts/node-input-submission.md)。
通过真实网关（`https://api.omnimux.ai/v1`）及真实凭据，对中枢音频能力 `audioGenerate`、通用别名 `tts` 调度及创作画布 `materialGatewayExecutor` 进行 100% 真实连通性测试与端到端实测验收。

## 2. 真实网关请求与响应证据

### 测试场景 1：中枢主力模型直连生成（Canonical ID: `seed-audio-1.0`）

- **请求端点**：`POST https://api.omnimux.ai/v1/audio/speech`
- **请求方法**：`POST`，`Content-Type: application/json`
- **请求载荷**：
  ```json
  {
    "model": "seed-audio-1.0",
    "input": "恭喜！OmniMux 中枢语音合成与创作画布已正式接通，这是一段真实生成的测试音频。",
    "voice": "zh_male_guanggaojieshuo_uranus_bigtts",
    "speed": 1.0,
    "response_format": "mp3"
  }
  ```
- **网关响应状态**：`HTTP 200 OK`
- **关键响应头**：
  - `Content-Type`: `audio/mpeg`
  - `x-audio-duration`: `9.586` 秒
  - `x-audio-url`: `https://lf11-speech-sign.bytednsdoc.com/volcengine-speech/cdn/20260918/f9b09a28-7134-4674-8df3-49b62ab58369?x-expires=1790301178&x-signature=...`
  - `x-oneapi-request-id`: `202609180115557562673408268d9d6utAyFtoc`
- **产物文件**：`/tmp/test-tts-canonical-live.mp3`
- **产物大小**：`77,805` 字节（MPEG Audio Layer 3 有效流）
- **耗时**：`22,463 ms`
- **结论**：网关真实连通，音频时长准确，音频文件合法有效。

---

### 测试场景 2：中枢通用别名调度（Model Alias: `tts`）

- **调度请求**：
  ```javascript
  await executeOmnimuxAudio({
    prompt: "通过 TTS 通用别名成功调度语音合成主力模型，全链路解析正常。",
    model: "tts",
    voice: "zh_female_linxiao_uranus_bigtts",
    speed: 1.1,
    dest: "/tmp/test-tts-alias-live.mp3",
    env: { OMNIMUX_API_KEY: "<REDACTED>" }
  });
  ```
- **SubmitGuard 映射**：自动归一化 `tts` 为 canonical `seed-audio-1.0`
- **网关响应状态**：`HTTP 200 OK`
- **响应头时长**：`6.512` 秒
- **产物文件**：`/tmp/test-tts-alias-live.mp3`
- **产物大小**：`53,229` 字节
- **耗时**：`34,221 ms`
- **结论**：别名机制完全就绪，智能体与业务调用传入 `model: "tts"` 零阻断。

---

### 测试场景 3：创作画布执行器端到端真实生成（Workflow Canvas Live Acceptance）

- **执行路径**：
  `Canvas Node (materialType: audio, tool: text-to-audio)`
  → `materialGatewayExecutor.execute`
  → `omnimuxGateway.submit (mode: live)`
  → `hub.audioGenerate.execute`
  → 网关同步语音合成
  → 资产存储落盘
- **节点输入**：
  ```json
  {
    "id": "canvas-audio-tts-node",
    "type": "material",
    "data": {
      "materialType": "audio",
      "prompt": "在创作画布中，您可以随意选择五百余款火山精品音色，一键生成配音。",
      "params": {
        "voice": "zh_female_shaoergushi_uranus_bigtts",
        "speed": 1.0,
        "format": "mp3"
      }
    }
  }
  ```
- **执行结果**：
  ```json
  {
    "mediaAssets": [
      {
        "type": "audio",
        "url": "/tmp/82c041bfcc83223539ea3cc7fec9467d9257f98636c917f45ac9721d4099c900-8ba9b9db-d845-4864-88ee-cbabbe08c548.mp3",
        "mimeType": "audio/mpeg",
        "sizeBytes": 61869
      }
    ]
  }
  ```
- **产物大小**：`61,869` 字节
- **执行耗时**：`26,599 ms`
- **结论**：创作画布端到端完全打通，生成物料可立即用于试听与视频混剪合成。

---

## 3. 门禁验证结论

1. `node scripts/verify-model-contracts.mjs --strict`：
   - strict 模式 `ok=true`
   - 0 error, 0 warning
   - 80 dispositions, 68 runtimeIds, 24 listedOperations 全部平账
2. `node scripts/verify-cross-plugin-model-alignment.mjs`：
   - 9 whitelist models, 4 defaults, 10 aspect ratios, 34 channel groups 100% 对齐通过
3. `node scripts/verify-plugin-boundaries.mjs`：
   - 3463 个插件源文件零跨界依赖
4. `node scripts/verify-plugin-agent-tools.mjs`：
   - 0 阻断错误
