# MiniMax-H3 AutoDL 视频泳道接入契约规格 (Issue: minimax-h3-video-autodl-contract)

## 1. 业务问题与背景

网关已为 AutoDL ComfyUI 泳道（渠道 70/71/72，上游 `minimax_h3_image_audio_to_video`）开通视频生成，并已用真实对口型任务（`8fed5047-9d01-4147-9dcf-bf001e964a55`，¥0.04）验证可售。但插件仓（本地合同侧）尚未把该泳道接入，导致：

- 画布/中枢无法以 `minimax-h3-video` 选型提交 AutoDL 泳道请求（模型未登记、提交路径未知、素材槽无映射）。
- `indextts-2` 声音克隆因 2026-10-21 网关对账 #3516 被误登记为「上游全停仅登记不开放」（`implementation.status:"none"`），实际渠道 70 在架可售。
- 既有 `minimax-h3`（APIMart 泳道）上游已全停，必须保持下架、不得与新泳道混淆。

**目标**：让 `minimax-h3-video` 在本地合同成为可售条目——登记、提交、素材透传、轮询全链路符合 AutoDL `/v1/tasks/autodl` 契约；同时把 `indextts-2` 恢复为可售。

## 假设

- 假设网关 `collectSlots` 的 `sources` 确实包含 `metadata`，且 `metadata` 顶层对象里 `ref_image_<N>`/`ref_audio_<N>`/`first_frame`/`last_frame`/`audio_duration` 会被按位收进素材槽——此判断基于网关源码走查与真实对口型任务 `8fed5047` 成功跑通（该任务即经 metadata 携带 ref_image_0 + ref_audio_0 + audio_duration 提交）。
- 假设网关对 AutoDL 泳道把 `audio_urls` 视为 RESERVED（接收但不参与槽收集、不报错），因此为满足本地 digital_human 形状 `require:["audio_urls"]` 而额外顶层外发该字段是安全的。
- 假设 `minimax-h3-video` 不需要进 `auto-serving-manifest.json` 之外的 alias 行——`PRODUCT_ID_ALIASES` 只在本任务另行登记 `-task` 变体时才需要，本任务只登记 canonical id。
- 假设 `guard.js` 既有 `modelId.startsWith('minimax-h3')` 的 `720p` 分辨率拦截应同样作用于 `minimax-h3-video`（新泳道官方档为 480p/736p/768p/1088p/1440p，本就不含 720p），属预期行为而非回归。

## 2. 关键契约事实（网关侧已验证）

- 提交 `POST /v1/tasks/autodl`，必须带非空顶层 `model`；轮询 `GET /v1/tasks/{id}`；产物 `GET /v1/tasks/{id}/artifacts`。
- 素材槽统一经顶层 `metadata` 透传：网关 `collectSlots` 读 `ref_image_<N>` / `ref_audio_<N>` / `first_frame` / `last_frame` / `audio_duration`（`sources=[req,metadata]`）。
- `detectShape` 优先级硬约束：`prompt_text` 出现即归 `text-to-speech`——本模型 prompt 必须走 `prompt` 字段，绝不写 `prompt_text`。`audios+images+无prompt` → `lip-sync`；`firstFrame+lastFrame` → `first-last-frame`；`audios` → `image-audio`；`images` → `image-reference`。
- `OFFERED_RESOLUTIONS` 无 1080p；`minimax-h3*` 前缀模型禁止 `/^720p?$/i` 分辨率（guard.js 既有断言自动覆盖新条目，属预期）。
- `operation` 字段可发（网关丢弃）；`image_with_roles / image_urls / audio_urls / video_urls / file_url / link_url` 对本泳道属禁发字段族（除为满足 digital_human 形状 require 而外发的 `audio_urls`，网关侧为 RESERVED 无害）。
- 计费：$0.025/s；1 USD = 10 积分。

## 证伪方式

下列任一可观测结果出现，即证明上述假设错误、需回炉设计而非放行实现：

- 对 `minimax-h3-video` 任一操作跑 `guardSubmit`（`requireListed:false`），若返回 `ok:false` 且 code 为 `MAPPER_INCOMPLETE` / `VENDOR_FIELD_FORBIDDEN`，说明 metadata 槽未如假设被收进、或 `audio_urls` 并非 RESERVED 无害字段——用 `pnpm --filter omnimux exec vitest run src/catalog/contract/submit-guard/h3-contract.test.js` 可复现。
- 调用 `taskPathFor('video','minimax-h3-video')` 若返回 `video/generations` 而非 `tasks/autodl`，说明路由扩展未生效——用 omnimux 包内 vendors 单测断言返回值证伪。
- 若 `indextts-2` 经 `admitOperation(..., 'voice_clone', ..., {requireListed:true})` 仍报 `IMPLEMENTATION_UNAVAILABLE`，说明 status 未翻成 `ready`——跑 `gateway-truth-reconciliation.test.js` 证伪。
- 若 `minimax-h3`（APIMart 旧条目）在 `h3-contract.test.js` 中由「下架」断言翻绿为「可提交」，说明误动了既有下架语义——该测试本身即回归证伪。
- 全量 `pnpm --filter omnimux test` 任一红即视为实现未达标。

## 3. 核心改动规范

### AC-1: `minimax-h3-video` 模型条目登记
- `plugins/omnimux/src/catalog/specs/video-models.yaml` 末尾追加 `minimax-h3-video` 条目，`routing.endpoint: /v1/tasks/autodl`、`routing.wireModel: minimax_h3_image_audio_to_video`。
- 4 个操作：`text_to_video`、`first_last_frame`、`video_multi_ref`、`digital_human`，全部 `implementation.status:"ready"`、`research.status:"verified"`、`profileId: videoGenerate`、`seam: videoGenerate`。
- 素材槽声明与 metadata 映射一致：`first_frame/last_frame/references`(image) + `driving_audio`(audio)。分辨率档取 OFFERED（无 1080p）。
- 既有 `minimax-h3`（APIMart）条目保持 `status:"none"` 下架，不改动。

### AC-2: `indextts-2` 恢复可售
- `plugins/omnimux/src/catalog/specs/audio-models.yaml` 把 `implementation.status` 从 `"none"` 改 `"ready"`，并修正 #3516「上游全停」注释——该型号渠道 70 在架，属误标。

### AC-3: AutoDL 任务路由扩展至视频
- `plugins/omnimux/src/media/vendors/omnimux.js`：新增 `AUTODL_VIDEO_TASK_MODEL_IDS = ['minimax-h3-video']`，并入 `taskPathFor`（→ `AUTODL_SUBMIT_PATH`）与 `taskPollPathFor`（→ `AUTODL_POLL_PATH`），判断先于 `AUDIO_VIDEO` 回退。`isAutodlTaskPath` 不变（精确匹配提交路径，自动覆盖）。

### AC-4: 素材槽经 metadata 映射
- `plugins/omnimux/src/catalog/contract/submit-guard/map.js` `videoGenerate` 分支：为 `modelId==='minimax-h3-video'` 新增分支——全部素材槽写入 `vendor.metadata`（`ref_image_N`/`ref_audio_N`/`first_frame`/`last_frame`/`audio_duration`），绝不 emit `image_with_roles`/`image_urls`/`video_urls`/`file_url`/`link_url`；为满足 digital_human 形状 `require:["audio_urls"]` 额外 emit `audio_urls` 顶层（网关 RESERVED 无害）。`vendor.operation` 照常 emit。

### AC-5: digital_human 形状登记
- `plugins/omnimux/src/catalog/contract/adapter-profiles.json` `videoGenerate` 档案：`operations[]` 增 `digital_human`，`operationVendorShapes.digital_human` 登记 `{require:["audio_urls"], allow:[operation,prompt,audio_urls,metadata,duration,size,aspect_ratio,resolution,generate_audio,audio,seed,watermark,output_format,tools,nsfw_check]}`。

### AC-6: 目录登记
- `dispositions.json` 加 `minimax-h3-video` canonical 行（canonical id，无需 alias）。
- `auto-serving-manifest.json` `models[]` 加 `{productId:"minimax-h3-video", kind:"video", priority, gatewayIds:[...]}`（无 `canvasExcluded`，在架可售）。

### AC-7: 测试
- `submit-guard/h3-contract.test.js`：为 `minimax-h3-video` 补 4 操作 × metadata 槽断言 + 禁发字段族断言（`requireListed:false` 因未上 manifest 快照）。
- 路由单测：`taskPathFor/taskPollPathFor` 对 `minimax-h3-video` 返回 autodl 路径。
- `gateway-truth-reconciliation.test.js` L245-268：翻 `indextts-2` 下架断言为在架。
- `pnpm --filter omnimux test` 全绿。

## 4. 边界

- **总是做**：素材槽一律走 `metadata`；prompt 走 `prompt` 非 `prompt_text`；分辨率档排除 1080p 与 720p。
- **先问**：改 `detectShape`/`collectSlots` 网关语义；`minimax-h3` APIMart 泳道恢复上架；加新 alias。
- **绝不做**：把 `minimax-h3-video` 加进 `DIGITAL_HUMAN_MODEL_IDS`（走 videoGenerate 档案，非 videoDigitalHuman）；`wan-2-2-animate`（上游 OOM，出范围）；emit `prompt_text`。

## 5. 验收

- `minimax-h3-video` 4 个操作经 guard 校验产出合法 vendor body（素材在 metadata，无禁发字段族除 `audio_urls`）。
- 提交路径 = `tasks/autodl`，轮询 = `tasks`。
- `indextts-2` 经 guard 校验可 submit（`implementation ready`）。
- 既有 `minimax-h3` 保持下架断言不破；全部测试绿。
