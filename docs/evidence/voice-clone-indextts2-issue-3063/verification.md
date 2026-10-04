# Issue #3063: 语音克隆型号切换至 indextts-2 契约与离线验证报告

## 背景与根因
上游官方在 2026-09-18 升级了声音克隆能力，下线旧版借道视频通道的 `index-tts`，升级为专用 AutoDL 任务通道的 `indextts-2`。
导致本地历史任务以 `index-tts` 提交时触发 `CHANNEL_UNAVAILABLE`。

## 变更覆盖面
1. **契约层**：
   - `plugins/omnimux/src/catalog/specs/audio-models.yaml`：canonical ID 设为 `indextts-2`，更新研究与执行状态说明。
   - `plugins/omnimux/src/catalog/contract/dispositions.json`：`indextts-2` 登记为 canonical 处置项。
   - `plugins/omnimux/src/catalog/contract/auto-serving-manifest.json`：`indextts-2` 设为 requiredInAuto。
   - `plugins/omnimux/src/catalog/contract/adapter-profiles.json`：`voice_clone` operationVendorShapes 允许 `model`, `prompt_text`, `prompt_simple`, `emo_control_method`, `emo_happy`, `emo_sad`, `emo_angry`。
2. **执行中枢层**：
   - `plugins/omnimux/src/catalog/contract/submit-guard/map.js`：适配 `prompt_text`, `prompt_simple`, `emo_control_method`，跳过无格式要求的 bare prompt。
   - `plugins/omnimux/src/media/vendors/omnimux.js`：`taskPathFor` 为 `indextts-2` 返回 `tasks/autodl`，`taskPollPathFor` 返回 `tasks`；`pickMediaUrl` 增加 artifacts 阵列解析。
   - `plugins/omnimux/src/media/protocols/openai-media.js`：AutoDL 任务在 completed 后自动调 `GET /v1/tasks/{id}/artifacts` 获取音频结果直链。
3. **跨插件闭环**：
   - `plugins/omnimux-workflow/src/shared/generationPolicy.ts`：画布音频白名单同步收录 `indextts-2`。

## 本地全量测试验证结果
- `pnpm --filter omnimux test`: 3098 passed, 0 failed.
- `node scripts/verify-model-contracts.mjs --strict`: ok=true.
- `pnpm check:boundaries`: 3887 files verified.
- `pnpm verify:product-baseline`: verified ok.
