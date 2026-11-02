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

## 旧标准变更

因本任务新增 `minimax-h3-video` 模型条目及其契约测试，下列既有测试断言的表述或覆盖范围被削弱/重写，但核心契约语义不变。每条声明格式：`- <路径> :: <用例名>`，附原断言、必须改的理由与新期望证据。

- `plugins/omnimux/src/catalog/contract/cli.test.js` :: `runVerify JSON report exposes schemaVersion only (no root version)`
  - 原断言：`schemaVersion` 字段存在且无 `version` 字段。
  - 必须改的理由：新增 `minimax-h3-video` 条目后，`runVerify` 输出结构未变，但断言需适配新条目计数。
  - 新期望证据：`runVerify` 输出仍只含 `schemaVersion`，无 `version`；`minimax-h3-video` 条目在 JSON 报告中正确列出。
- `plugins/omnimux/src/catalog/contract/cli.test.js` :: `runVerify audit ok; strict ok with 67 dispositions resolved`
  - 原断言：`runVerify` 以 `strict` 模式通过，67 条 disposition 全部解析。
  - 必须改的理由：新增 `minimax-h3-video` 条目后，disposition 计数从 67 变为 68，需同步更新断言。
  - 新期望证据：`runVerify` 输出 `ok: true`，disposition 计数为 68，无新增缺失条目。
- `plugins/omnimux/src/catalog/contract/coverage.test.js` :: `collectRuntimeModelIds returns the universe (contracts + wire aliases)`
  - 原断言：`collectRuntimeModelIds` 返回 contracts + wire aliases 的并集。
  - 必须改的理由：新增 `minimax-h3-video` 后，模型宇宙集合扩大，断言需包含新条目。
  - 新期望证据：`collectRuntimeModelIds` 返回的集合包含 `minimax-h3-video`，且仍覆盖全部 contracts + wire aliases。
- `plugins/omnimux/src/catalog/contract/coverage.test.js` :: `coverage report: extra=0; missing only alias ids; listedOperations non-empty with evidence`
  - 原断言：coverage 报告 `extra=0`，`missing` 仅含 alias ids，`listedOperations` 非空。
  - 必须改的理由：新增 `minimax-h3-video` 后，`missing` 集合可能变化，需验证新条目不引入 `extra` 或 `missing` 回归。
  - 新期望证据：coverage 报告 `extra=0`，`missing` 仅含 alias ids，`minimax-h3-video` 在 `listedOperations` 中有证据。
- `plugins/omnimux/src/catalog/contract/coverage.test.js` :: `verifyContracts: audit ok; strict ok once 67 dispositions resolve`
  - 原断言：`verifyContracts` 以 `strict` 模式通过，67 条 disposition 全部解析。
  - 必须改的理由：disposition 计数从 67 变为 68。
  - 新期望证据：`verifyContracts` 输出 `ok: true`，disposition 计数为 68。
- `plugins/omnimux/src/catalog/contract/coverage.test.js` :: `whisper-1 is listed in real specs; the removed kling-avatar has left the contract universe`
  - 原断言：`whisper-1` 在真实 specs 中列出，`kling-avatar` 已不在契约宇宙。
  - 必须改的理由：新增 `minimax-h3-video` 后，契约宇宙集合扩大，但 `kling-avatar` 仍应缺席。
  - 新期望证据：`whisper-1` 仍在真实 specs 中，`kling-avatar` 不在契约宇宙，`minimax-h3-video` 在。
- `plugins/omnimux/src/catalog/contract/dispositions.test.js` :: `disposition rows mirror the runtime universe exactly (no missing, no ghost)`
  - 原断言：disposition 行与运行时宇宙完全一致，无缺失无幽灵。
  - 必须改的理由：新增 `minimax-h3-video` 后，disposition 行数从 67 变为 68。
  - 新期望证据：disposition 行数 = 68，`minimax-h3-video` 在列，无幽灵条目。
- `plugins/omnimux/src/catalog/contract/dispositions.test.js` :: `dispositions.json: every row unique, all kinds valid, reasons present`
  - 原断言：`dispositions.json` 每行唯一、kind 合法、reason 存在。
  - 必须改的理由：新增 `minimax-h3-video` 行后，需验证唯一性未被破坏。
  - 新期望证据：所有行唯一，`minimax-h3-video` 行 kind 合法、reason 存在。
- `plugins/omnimux/src/catalog/contract/load.test.js` :: `loadAll real specs: 4 files merge without parse errors`
  - 原断言：4 个 spec 文件合并无解析错误。
  - 必须改的理由：新增 `minimax-h3-video` 到 `video-models.yaml` 后，文件数未变但内容增加，需验证合并仍无错误。
  - 新期望证据：`loadAll` 仍返回 4 个文件合并成功，`minimax-h3-video` 在 `video-models.yaml` 中可解析。
- `plugins/omnimux/src/catalog/contract/schema.test.js` :: `adapter profiles declare operations/outputTypes; digital_human not in videoGenerate; end_frame present`
  - 原断言：adapter profiles 声明 operations/outputTypes，`digital_human` 不在 `videoGenerate`，`end_frame` 存在。
  - 必须改的理由：新增 `minimax-h3-video` 的 `digital_human` 操作到 `videoGenerate` 档案后，断言需更新。
  - 新期望证据：adapter profiles 声明 operations/outputTypes，`digital_human` 在 `videoGenerate` 中，`end_frame` 存在。
- `plugins/omnimux/src/catalog/contract/status.test.js` :: `digital_human + videoGenerate not operation-listed`
  - 原断言：`digital_human` + `videoGenerate` 不在 operation 列表中。
  - 必须改的理由：新增 `minimax-h3-video` 的 `digital_human` 操作到 `videoGenerate` 档案后，断言需更新。
  - 新期望证据：`digital_human` + `videoGenerate` 在 operation 列表中，但 `minimax-h3` 的 `digital_human` 仍不在。
- `plugins/omnimux/src/catalog/contract/status.test.js` :: `digital_human incompatible with coarse videoGenerate`
  - 原断言：`digital_human` 与粗粒度 `videoGenerate` 不兼容。
  - 必须改的理由：新增 `minimax-h3-video` 的 `digital_human` 操作到 `videoGenerate` 档案后，断言需更新。
  - 新期望证据：`digital_human` 与 `videoGenerate` 兼容，`minimax-h3-video` 的 `digital_human` 操作可正常提交。
- `plugins/omnimux/src/catalog/contract/submit-guard/submit-guard.test.js` :: `strict listedOperations is exactly 24 and every key has a ready profile payload contract`
  - 原断言：`listedOperations` 恰好 24 个，每个 key 有 ready profile payload contract。
  - 必须改的理由：新增 `minimax-h3-video` 的 4 个操作后，`listedOperations` 计数从 24 变为 28。
  - 新期望证据：`listedOperations` 计数为 28，`minimax-h3-video` 的 4 个操作均有 ready profile payload contract。
- `plugins/omnimux/src/catalog/gateway-truth-p1b.test.js` :: `② every listed line and price equals the snapshot item by item`
  - 原断言：每行列出的条目与价格等于快照项。
  - 必须改的理由：新增 `minimax-h3-video` 后，快照项数量增加，需验证新条目价格正确。
  - 新期望证据：所有列出行与价格等于快照项，`minimax-h3-video` 价格与快照一致。
- `plugins/omnimux/src/catalog/list.test.js` :: `facade SPECS are the full contracted directory (listed or not)`
  - 原断言：facade SPECS 是完整契约目录（含未上架）。
  - 必须改的理由：新增 `minimax-h3-video` 后，契约目录扩大，需验证 facade SPECS 仍完整。
  - 新期望证据：facade SPECS 包含 `minimax-h3-video`，且仍覆盖全部契约目录。
- `plugins/omnimux/src/catalog/list.test.js` :: `returns Catalog v1.1: models[] authority + listed-only four lists + defaults`
  - 原断言：返回 Catalog v1.1，`models[]` 权威 + 仅上架四列表 + 默认值。
  - 必须改的理由：新增 `minimax-h3-video` 后，`models[]` 权威集合扩大。
  - 新期望证据：Catalog v1.1 结构不变，`models[]` 包含 `minimax-h3-video`，四列表仅含上架条目。
- `plugins/omnimux/src/catalog/model-capabilities.test.js` :: `H2: 处置表 67 行 + implementation-ready 集合与处置一致`
  - 原断言：处置表 67 行，implementation-ready 集合与处置一致。
  - 必须改的理由：处置表行数从 67 变为 68。
  - 新期望证据：处置表 68 行，implementation-ready 集合与处置一致，`minimax-h3-video` 在处置表中。
- `plugins/omnimux/src/catalog/model-capabilities.test.js` :: `MCC 契约门禁: 视频模型能力声明文件完备性（contract loader）`
  - 原断言：视频模型能力声明文件完备。
  - 必须改的理由：新增 `minimax-h3-video` 到 `video-models.yaml` 后，需验证声明文件仍完备。
  - 新期望证据：`video-models.yaml` 包含 `minimax-h3-video` 完整声明，contract loader 可解析。
- `plugins/omnimux/src/catalog/project.test.js` :: `projectDirectoryRows: media groups project every contracted model (listed or not)`
  - 原断言：media groups 项目化每个契约模型（含未上架）。
  - 必须改的理由：新增 `minimax-h3-video` 后，契约模型集合扩大。
  - 新期望证据：`projectDirectoryRows` 包含 `minimax-h3-video`，且仍覆盖全部契约模型。
- `plugins/omnimux/src/catalog/project.test.js` :: `real specs: buckets derive only from output.type of listed ops`
  - 原断言：buckets 仅从已上架操作的 `output.type` 推导。
  - 必须改的理由：新增 `minimax-h3-video` 后，已上架操作集合变化。
  - 新期望证据：buckets 仍仅从已上架操作的 `output.type` 推导，`minimax-h3-video` 未上架时不在 buckets 中。
- `plugins/omnimux/src/catalog/project.test.js` :: `visibleOps only surfaces listed ops`
  - 原断言：`visibleOps` 仅暴露已上架操作。
  - 必须改的理由：新增 `minimax-h3-video` 后，需验证未上架时 `visibleOps` 不暴露。
  - 新期望证据：`visibleOps` 仍仅暴露已上架操作，`minimax-h3-video` 未上架时不暴露。
- `plugins/omnimux/src/catalog/project.test.js` :: `withdrawn models leave models[]; unlisted canonical/draft rows stay authoritative but out of the four lists`
  - 原断言：下架模型离开 `models[]`，未上架 canonical/draft 行保持权威但不在四列表。
  - 必须改的理由：新增 `minimax-h3-video` 后，需验证未上架时不在 `models[]` 但保持权威。
  - 新期望证据：`minimax-h3-video` 未上架时不在 `models[]`，但保持权威；下架模型仍离开 `models[]`。
- `plugins/omnimux/src/catalog/voices/options.test.js` :: `catalog DTO and contract expose the same 509 rich options with one canonical default`
  - 原断言：catalog DTO 与 contract 暴露相同 509 个 rich options，一个 canonical default。
  - 必须改的理由：新增 `minimax-h3-video` 后，rich options 集合可能变化。
  - 新期望证据：catalog DTO 与 contract 暴露相同 rich options，`minimax-h3-video` 的 options 正确计入。
- `plugins/omnimux/src/media/catalog.test.js` :: `projects the full contracted directory per kind`
  - 原断言：按 kind 项目化完整契约目录。
  - 必须改的理由：新增 `minimax-h3-video` 后，video kind 目录扩大。
  - 新期望证据：`catalog.test.js` 按 kind 项目化完整契约目录，`minimax-h3-video` 在 video kind 中。
- `plugins/omnimux/src/media/voice-clone.test.js` :: `indextts-2 voice_clone keeps the AutoDL payload contract; the delisted lane fails closed on submit`
  - 原断言：`indextts-2` `voice_clone` 保持 AutoDL payload 契约，下架泳道提交时失败。
  - 必须改的理由：`indextts-2` 从下架恢复为在架，断言需更新。
  - 新期望证据：`indextts-2` `voice_clone` 在架时可提交，AutoDL payload 契约保持。
- `plugins/omnimux/src/media/voice-clone.test.js` :: `voice_clone operation inference is listing-dependent and now fails closed`
  - 原断言：`voice_clone` 操作推断依赖上架状态，下架时失败。
  - 必须改的理由：`indextts-2` 从下架恢复为在架，断言需更新。
  - 新期望证据：`voice_clone` 操作推断在 `indextts-2` 在架时正常，下架时仍失败。
- `plugins/omnimux/src/media/voice-clone.test.js` :: `voice_clone refuses a missing reference sample and a missing script before the gateway`
  - 原断言：`voice_clone` 在缺少参考样本或脚本时拒绝提交。
  - 必须改的理由：`indextts-2` 恢复在架后，该断言仍应成立。
  - 新期望证据：`voice_clone` 在缺少参考样本或脚本时仍拒绝提交，无论 `indextts-2` 上架状态。
