# 参考素材限制对齐上游公布值（图片 / 视频 / 音频 / 视觉输入）

- Issue: #3142
- 任务工作树: `.worktrees/ref-limit-align-3142`
- 上游基准: `GET https://omnimux.ai/api/model_contract/<model>` → `data.contract`，合同版本 `4b4e2aff3500ec80`，44 个模型
- 本地取证快照: `/tmp/omx-inv/3138-upstream-contracts.json`（其 `local` 数组是**消费端投影**，只含 `op.listed === true`，不可当作 spec 全量）
- 对照报告: `.agent-reports/ref-align-3142/01-image-llm.md`、`02-video.md`、`03-audio.md`

## 1. 用户问题

用户在画布上能连的参考素材数量、能传的格式、单文件大小上限，与上游模型真正公布的能力不一致：有的地方比上游严（上游允许 16 张参考图，本仓只让 1 张），有的地方上游公布了格式/大小而本仓没声明（用户看不到可用格式，也不校验），有的地方本仓比上游宽（用户传了上游必拒的格式/体积，提交后才失败）。要求**所有能力对齐**，不只是图片。

## 2. 口径（本票的铁律）

1. **以上游公布值为准**：上游公布了数量 / 格式 / 单文件大小上限的，本地声明必须一致。
2. **上游未公布的不许自创**：本地保留的保守值必须在 `limitSource.note` 里写明「上游未公布，本仓保守值」，不得以「继承 runtime 表行」充当依据。
3. **禁止虚假声明**：把数量上限提到上游值，必须同时让发送链路真的能发出去多份，并以真机出图证明。只改声明不改实现 = 界面允许 16 张、实际只发 1 张，直接违反仓内「模型真相」硬约束。
4. **vendor 无落点的数量上限不虚提**：若 vendor 协议只支持单值字段，则保持本地值并在 `research.notes` / `limitSource.note` 写明差异与原因。

## 3. 不变量

- I1: `plugins/omnimux/src/catalog/specs/*.yaml` 是声明的唯一真源；消费端投影（`list.js`）只反映 `op.listed === true`，不得据它判断声明是否齐全。
- I2: `limitSource` 的 `kind` 枚举只有 `official_docs` / `measured` / `policy_conservative`；数量上限来自上游能力合同即用 `official_docs`，本仓保守值用 `policy_conservative`。
- I3: 声明了 `maxSizeMb`（或时长类上限）**必须**同时给 `limitSource`，否则 admission 报 `limit_source_missing`（error 级）。
- I4: 槽位白名单是**精确 MIME 串比较**；`.mp3` 素材在两条通路上分别产出 `audio/mpeg` 与 `audio/mp3`，故 mp3 必须双写。
- I5: `slots.js` 按 spec 的 `max` 抛 `SLOT_CAPACITY`——spec 的 `max` 是发多图的前置条件，但**不是充分条件**。
- I6: 图片 OpenAI 家族的多参考发送当前只落单数字段 `image = urls[0]`（`submit-guard/map.js`），且 `media/vendors/omnimux.js` 在存在 `guardPlan.vendorPayload` 时早退，legacy `images` 构造不可达。
- I7: 上游合同目录对部分模型返回 HTTP 404（`gpt-image-2.5-hd`、`grok-imagine-image-2-0`、`grok-imagine-image-quality`、`gemini-3.8-flash-tts` 等），这些模型一律按「上游未公布」处理，不得臆测。

## 4. 功能点

### F1 图片能力（`image-models.yaml`）
- `gpt-image-2.5#multi_reference`：`max` 1→16；`limitSource.kind` → `official_docs`，note 写明「数量 16 来自上游能力合同；上游未公布格式清单与单文件大小上限，mimes 与 10MB 为本仓保守值」。
- `nano-banana-2` / `nano-banana-pro`：`max` 4→14、追加 `image/heic`/`image/heif`、`maxSizeMb` 15→7、note 改写。
- `seedream-5-0-pro`：`min` 0→2、`max` 8→10、note 改写。
- `mj-v7` / `mj-v8-1`：追加 `image/gif`。
- `grok-4.6`：移除 `image/webp`（上游只公布 `[jpeg,png]`）。
- 上游 404 的模型（`gpt-image-2.5-hd`、`grok-imagine-image-2-0`、`grok-imagine-image-quality`）：note 改写为「上游未公布」。
- `mj-v7` / `mj-v8-1`：note 写明「上游只公布格式与 min，未公布数量与体积上限」。

### F2 大模型视觉输入（`text-models.yaml`）
- 追加缺失格式：`claude-sonnet-4-6` / `claude-opus-4-6` / `gpt-5.6-sol` / `gpt-5.5` / `deepseek-v4-flash` 追加 `image/gif`；`kimi-k3` 追加 `gif/bmp/heic/heif`；`gemini-3.7-flash` / `gemini-3.1-pro-preview` 追加 `heic/heif`。
- 9 条视觉槽位的 note 追加「上游只公布格式清单，未公布参考图数量与单文件体积上限；max 10 与 20MB 为本仓保守值」。

### F3 视频能力（`video-models.yaml`）
- `minimax-h3` 9 处 `limitSource.note`：写明限制值取自 APIMart / fal.ai **渠道文档**，非 omnimux.ai 模型合同（该合同只公布 min/max）。
- `seedance-2-5` / `minimax-h3` / `wan-3.0` 的 `reference_audios` 槽位 `allowedMimes` 追加 `audio/mpeg`。
- `seedance-2-5` 的 `reference_images.min` 保持 0（改为 1 会让「仅源视频」路径被门禁拒收），差异登记在 note。

### F4 音频能力（`audio-models.yaml`）
- `indextts-2#voice_clone.voice_sample`：追加 `allowedMimes: ["audio/wav","audio/mp3","audio/mpeg"]`；不补 `maxSizeMb`（上游未公布 `max_bytes_each`）；`max` 保持 1；差异写进 `research.notes`。
- `seed-audio-1.0#text_to_speech.reference_audio`：追加 `allowedMimes`、`maxSizeMb: 10`（上游 `max_bytes_each=10485760`）、`limitSource{official_docs}` 含差异说明；`max` 保持 1（vendor 单值）；`maxDurationSec` 不声明（画布导入不带时长，声明会触发 `METADATA_UNKNOWN` 拒单）。

### F5 发送链路（本票核心，与 F1 数量提升同票）
- OpenAI 家族图片多参考：`guardPlan.vendorPayload` 路径下，参考图 >1 时写入适配层认可的多图字段，不得只发首图。
- `map-contract.js` 的 `imageGenerate.vendorFields` 白名单必须包含所用字段，否则抛 `VENDOR_FIELD_FORBIDDEN`。
- 同步更新把「OpenAI 只发首图」钉成断言的既有测试。
- 真机证明：用 ≥2 张参考图提交一次真实出图，证据记录请求体与产物字节。

## 5. 验收标准

- AC1: `plugins/omnimux/src/catalog/specs/` 下全部 `type: image|audio|video` 输入声明与上游公布值逐项一致；上游未公布项均有 note 说明。
- AC2: 无「声明超出实现」的数量上限：每个被提高的 `max` 都有对应发送链路改动 + 真机证据。
- AC3: `corepack pnpm verify:model-contracts` exit 0，admission errors=0。
- AC4: `corepack pnpm --filter omnimux test` 全绿；`--filter omnimux-assets test` 全绿。
- AC5: 跨插件闭环：目录指纹变化后 `plugins/omnimux-assets/cloud-catalog/voice-preview-snapshot.json` 按官方离线导出同步（除 `catalog_fingerprint` 外逐字节不变，`--check` 通过）；`docs/tools/hub-interfaces.html` 重新生成。
- AC6: `check:boundaries` 通过；`git diff --check` 干净。

## 6. 明确不在本票范围

- `gpt-image-2.5-flare` / `-sunburst` 新增 `multi_reference` 操作：属模型上架变更，须走上架五步（含真机证据与 listed 升格），另票。
- 8 个未上架视频模型（`seedance-2-0-fast/-mini`、`kling-*`、`wan-3.0`、`grok-imagine-video-1-5` 等）与上游的缺口/差异：只登记，不在本票改。
- `limitSource.kind` 枚举新增「渠道文档」档：属 schema 与门禁变更，波及全仓，另票。
- `whisper-1` 只写 `audio/mp3` 的跨票一致性：只登记。
- 生产发布（须另行授权）。

## 7. 风险与回退

- 收紧类改动（移除 webp、maxSizeMb 15→7、min 0→2）会让此前能提交的素材被门禁拒绝；这是与上游对齐的必然结果，须在 PR 描述里明示。
- 若多图字段名无法通过真机验证（上游不接受），则回退 F1 的数量提升，只保留 note 说明「上游公布 16、本仓暂限 1」，不得留下虚假声明。
