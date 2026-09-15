# 官方价目表在售模型接入与画布参数一致性规范 (Pricing Models & Canvas Alignment Spec)

- 任务工作树：`.worktrees/align-pricing-models-canvas`（分支 `agent/align-pricing-models-canvas`，基线 `origin/main` @ `b95b2c499`）
- 日期：2026-09-15
- 权威准据真源：`https://omnimux.ai/pricing`（`https://api.omnimux.ai/api/pricing`，共 30 款在售服务，其中 14 款核心生成式 AI 模型 + 16 款社媒数据服务）。

## 1. 背景与问题

根据官方价目表真源（`omnimux.ai/pricing`），网关正式开放供货的生成式 AI 模型为：
1. **图像生成（3 款）**：
   - `gpt-image-2.5`（官方标准版）
   - `gpt-image-2.5-flare`（极速迭代版）
   - `gpt-image-2.5-sunburst`（高清画质版）
2. **视频生成（3 款产品模型，含按次特惠任务版）**：
   - `seedance-2-5`（即梦 2.5 旗舰版，含标准专线与 `seedance-2-5-task` 特惠版）
   - `seedance-2-0`（即梦 2.0 参考版，含标准专线与 `seedance-2-0-task` 特惠版）
   - `minimax-h3`（海螺 3.0 2K 电影级运镜，含标准专线与 `minimax-h3-task` 任务版）
3. **文本与多模态对话（1 款）**：
   - `gemini-3.8-flash`（谷歌最新长上下文旗舰，含特惠、Vertex、标准三档）
4. **音频合成与语音识别（4 款）**：
   - `seed-audio-1.0`（火山语音合成与克隆）
   - `doubao-asr-bigmodel` / `seedasr-auc` / `bigasr-auc`（语音识别与字幕提取）

此前收敛治理时，创作画布白名单仅接入了 `gpt-image-2.5`（漏掉了 `flare` 与 `sunburst`），且用户明确要求：“验证下画布是否能正常发现这些模型，且模型的配置参数与配置中枢的可选参数一致”。

## 2. 目标

1. 将官方价目表上的 3 款图像模型（`gpt-image-2.5`, `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`）在中枢中全部恢复为在售开放（`listed: true`），并在创作画布白名单中开放。
2. 确保视频模型（`seedance-2-5`, `seedance-2-0`, `minimax-h3`）、文本模型（`gemini-3.8-flash`）、音频模型（`seed-audio-1.0`、ASR 识别模型）在画布中 100% 能够被正常发现。
3. 严格验证画布前端渲染的模型参数（画幅比例 aspectRatio、清晰度/分辨率 resolution、画质 quality、时长 duration、声音 sound 等）与执行中枢契约中声明的可选参数完全一致，不存在参数缺失或错配。

## 3. 验收标准（可测试）

### 3.1 契约准入与白名单对齐
- **AC-1 (生图模型准入)**：`image-models.yaml` 中 `gpt-image-2.5-flare` 与 `gpt-image-2.5-sunburst` 的 `text_to_image` 操作恢复为 `research.status: "verified"` 与 `execution.status: "live"`，模型达到 `listed: true`。
- **AC-2 (画布生成策略)**：`plugins/omnimux-workflow/src/shared/generationPolicy.ts` 的 `image.allowedModelIds` 包含 `['gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']`；`video.allowedModelIds` 包含 `['seedance-2-5', 'seedance-2-0', 'minimax-h3']`；`text` 为 `['gemini-3.8-flash']`；`audio` 为 `['seed-audio-1.0']`。
- **AC-3 (清单同步)**：`auto-serving-manifest.json` 中 `gpt-image-2.5-flare` 与 `gpt-image-2.5-sunburst` 设为 `requiredInAuto: true`，移除 `canvasExcluded: true`。

### 3.2 画布模型发现与参数一致性验证
- **AC-4 (模型正常发现)**：画布在图像节点、视频节点、文本节点、音频节点中均能正常发现上述全部对应在售模型，候选列表无缺失、无死锁。
- **AC-5 (图像参数一致性)**：画布图像参数浮层展示的画幅（1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, auto）、清晰度（1K, 2K, 4K）、质量档位（standard, hd）与 `image-models.yaml` 中的 `parameters` 枚举 100% 一致。
- **AC-6 (视频参数一致性)**：画布视频节点各模型的可选画幅、分辨率、时长范围及声音支持标志，与 `video-models.yaml` 中对应模型契约声明 100% 一致：
  - `seedance-2-5`: 画幅包含自适应及标准比例，分辨率 480p/720p/1080p，时长 4-30s 及自适应(-1)，支持声音；
  - `seedance-2-0`: 画幅 21:9/16:9/4:3/1:1/3:4/9:16，分辨率 480p/720p/1080p/4k，时长 4-30s，支持声音；
  - `minimax-h3`: 画幅 21:9/16:9/4:3/1:1/3:4/9:16 及自适应，分辨率 768P/2K，时长 4-15s，支持声音。
- **AC-7 (音频与识别一致性)**：`audio-transcription` 工具能正常发现 `doubao-asr-bigmodel` 与 `seedasr-auc`，语音合成节点能正常选定 `seed-audio-1.0`。

### 3.3 门禁与自动化测试
- **AC-8 (契约门禁严格通过)**：`node scripts/verify-model-contracts.mjs --strict` 零错误零警告通过。
- **AC-9 (跨插件对齐严格通过)**：`scripts/verify-cross-plugin-model-alignment.test.mjs` 测试通过。
- **AC-10 (画布参数集成测试通过)**：`plugins/omnimux-workflow` 单元测试与 E2E 校验全绿。
