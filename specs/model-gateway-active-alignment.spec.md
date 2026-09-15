# 模型访问收敛：仅开放网关在售 12 款主流模型，其余仅登记不开放访问

- 任务：`.worktrees/catalog-align-gateway-active-issue-1927`（分支 `agent/catalog-align-gateway-active-issue-1927`，基线 `origin/main` @ `20f812996`）
- 日期：2026-09-15
- 上游：Issue #1927。用户 2026-09-15 明确指令：「把这些网关开放接入都接入 其他本地中枢中仅登记 不开放访问 避免调用失败」。

## 1. 背景与问题

上游网关已完成严格的模型准入治理与双重凭据审计，清退了供货不稳定或未实证的实验性模型。现役生产基线（`scripts/ops/config-baseline/models.json`）收敛为 12 款主流核心模型：
- 文本：`gemini-3.8-flash`（高稳 Evolink 专线与 ApiKeyFun 特惠池）
- 图片：`gpt-image-2.5`（高分档与特惠档）
- 视频：`seedance-2-5`、`seedance-2-0`、`minimax-h3`（以及对应按次特惠/任务版）
- 音频：火山引擎官方直连系列（`seed-audio-1.0` 语音合成，`doubao-asr-bigmodel` / `seedasr-auc` / `bigasr-auc` 语音识别）

现状问题：本地执行中枢此前对已在网关下架的模型（如多款 GPT、Claude、Grok、GLM、万相、可灵、Midjourney 等）仍标记了 `listed: true` 并在创作画布白名单中开放。用户或各业务插件若选中这些模型，网关会直接返回 `503 model_not_found`「无可用渠道」，严重破坏业务连续性。

## 2. 目标

将本地执行中枢及创作画布的模型开放访问范围严格收敛到网关现役在册的 12 款主流模型：
1. 网关在售主流模型全量打通开放访问（`listed: true`，画布白名单准入，双档线路可选）。
2. 其余模型在中枢契约中保留元数据登记，但操作状态调整为仅登记不开放访问（`listed: false`），从画布生成白名单中移除，彻底杜绝调用失败。

## 3. 验收标准（可测试）

### 3.1 开放访问收敛与仅登记治理

- **AC-1 (文本收敛)**：`text-models.yaml` 中仅 `gemini-3.8-flash` 的 `chat` 与 `vision_chat` 操作为 `listed: true`；其余 11 款文本模型保留契约定义，操作转为仅登记（`execution: none` / `research: draft`），不在在售列表中暴露。
- **AC-2 (图片收敛)**：`image-models.yaml` 中仅 `gpt-image-2.5` 为开放访问在售模型；其余模型保留元数据条目但操作不开放访问。
- **AC-3 (视频收敛)**：`video-models.yaml` 中仅 `seedance-2-5`、`seedance-2-0`、`minimax-h3`（含 task 变体）为开放访问；`wan-3.0`、`grok-imagine-video-1-5`、`kling` 等转为仅登记。
- **AC-4 (音频收敛)**：`audio-models.yaml` 中仅火山系列（`seed-audio-1.0` 语音合成，`doubao-asr-bigmodel` / `seedasr-auc` / `bigasr-auc` 语音识别）开放访问；`suno`、`whisper-1` 保持仅登记。

### 3.2 跨插件原子闭环与白名单同步

- **AC-5 (画布白名单同步)**：`plugins/omnimux-workflow/src/shared/generationPolicy.ts` 的 `allowedModelIds` 严格与上述开放访问清单一致：
  - `text`: `['gemini-3.8-flash']`，默认 `gemini-3.8-flash`
  - `image`: `['gpt-image-2.5']`，默认 `gpt-image-2.5`
  - `video`: `['seedance-2-5', 'seedance-2-0', 'minimax-h3']`，默认 `seedance-2-5`
  - `audio`: `['seed-audio-1.0']`，默认 `seed-audio-1.0`
- **AC-6 (线路镜像对齐)**：`channelGroups.ts` 与 `channel-groups.js` 在售模型的线路定义镜像严格一致。
- **AC-7 (默认模型一致)**：`catalog-defaults.json` 与 `route.js` 的默认模型与画布 `generationPolicy` 默认模型完全对齐。

### 3.3 门禁与自动化测试

- **AC-8 (严格契约门禁)**：`node scripts/verify-model-contracts.mjs --strict` 通过，0 错误、0 警告。
- **AC-9 (全量自动化测试)**：`plugins/omnimux` 与 `plugins/omnimux-workflow` 单元测试及回归测试全绿通过。

## 4. 不做事项

- 不删除非在售模型的契约条目（必须保留完整契约规格与历史登记，满足“仅登记不开放访问”要求）。
- 不发起新的无授权外部真实 API 请求。
