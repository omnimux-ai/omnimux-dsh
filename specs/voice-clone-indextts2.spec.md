# Spec — 语音克隆切换到 indextts-2（Issue #3063）

## 背景
上游把 Index TTS 声音克隆从 `index-tts` 升级为 `indextts-2`，旧型号已从模型列表下线。画布语音克隆任务（mtask_ba075d1d42194c7e）以旧型号提交，被中枢判 CHANNEL_UNAVAILABLE。

## 上游新契约（OmniMux-docs zh/api-reference/audio-series/models/index-tts.mdx，2026-10-04 离线核对）
- 提交：`POST /v1/tasks/autodl`，`model: "indextts-2"`
- 必填字段：`prompt_text`（朗读文稿）、`prompt_simple`（参考音公网 URL）、`emo_control_method`（推荐 "与音色参考音频相同"）
- 可选：`emo_happy/emo_sad/emo_angry` ∈ [0,1]
- 轮询：`GET /v1/tasks/{task_id}`；产物：`GET /v1/tasks/{task_id}/artifacts`（WAV 直链）
- 新用户基线：缺失任一必填输入时界面在提交前给出必填提示；上游不可用时显示上游真实错误。

## 改动面
1. `audio-models.yaml`：`index-tts` 规格行更新为 `indextts-2` 契约（wire 名、新必填字段、autodl 通道）。
2. `adapter-profiles.json`：`voice_clone` 的 operationVendorShapes 改为新字段集。
3. `submit-guard/map.js`：voice_clone 装配改为 `prompt_text`/`prompt_simple`/`emo_control_method`，不再写 metadata.nodeInfoList。
4. `vendors/omnimux.js`：`taskPathFor` 对 `indextts-2` 返回 `tasks/autodl`；轮询/对账/`taskId` 收取路径同步指向 `tasks/{id}` 与 `artifacts`。
5. `media/protocols/openai-media.js`（如需要）：autodl 任务的产物收取经 artifacts 端点。
6. 选择器归组已有 `indextts-2` 别名，无需改；旧名 `index-tts` 保留为别名兼容既有画布数据。

## 验收
- 契约装载：`indextts-2#voice_clone` listed，准入错误 0。
- 请求构造断言：POST `tasks/autodl`，体含 model=prompt_text=prompt_simple=emo_control_method。
- 轮询打到 `tasks/{id}`，产物经 `tasks/{id}/artifacts`。
- 缺参考音/缺文稿仍在提交前被拒。
- 既有 seed-audio-1.0、suno、识别链路不回归。
- Dev 画布真实验收：TK 口播女 → 音频节点产出可播放音频。
