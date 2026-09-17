# Spec: index-tts 声音克隆接入（voice_clone）

- Issue: #2256
- 风险：R1（模型边界 + 跨插件闭环）
- 准据：`OmniMux-docs/zh/api-reference/audio-series/models/index-tts.mdx`（渠道官方文档，离线核对，遵守 `docs/contracts/model-api-authority.md`）

## 1. 目标与用户旅程

**用户目标**：在画布「声音克隆」节点（或助手音频提交工具）给出「一段参考音 + 一段文稿」，产出一段用参考音音色朗读该文稿的音频文件。

**关键用户旅程（可观察）**：

1. 用户在画布放置「声音克隆」节点，连入一个音频素材（参考音）并填写文稿文本。
2. 用户点击执行，节点提交成功并进入异步任务状态（不报「operation required」类错误）。
3. 任务完成后，产物音频落盘并可播放；音频时长/内容与文稿对应，音色接近参考音。

**当前失败基线（已实测）**：带参考音频提交时，提交闸门报 `operation required; no listed operation uniquely accepts current inputs on seed-audio-1.0`；显式 `operation: "voice_clone"` 报 `operation "voice_clone" not declared on model "seed-audio-1.0"`。全目录无任何 listed `voice_clone`。

## 2. 渠道接口事实（准据，不得偏离）

| 项 | 值 |
| --- | --- |
| model | `index-tts` |
| 创建 | `POST /v1/video/generations`（异步） |
| 轮询 | `GET /v1/video/generations/{task_id}`（不得使用 `*-async` / `*-query` 模型名） |
| 必填 | `metadata.nodeInfoList` |
| 节点 4 | `fieldName: "audio"` = 克隆参考音（服务端自动截取前约 15 秒） |
| 节点 7 | `fieldName: "text"` = 要朗读的文字 |
| `prompt` | 非必填，仅作标签 |
| 参考音形态 | 公网 URL 或上游 fileName；**禁止 `data:` URI** |
| 产物 | 音频（走视频任务通道） |

## 3. 验收标准（AC）

- **AC-1 契约登记**：`index-tts` 在契约索引中存在，且 `index-tts#voice_clone` 判定为 `listed: true`（`research.status=verified`、`implementation.status=ready`、profile 相容、gate 放行）。
- **AC-2 提交闸门**：以「参考音 + 文稿」提交 `voice_clone` 通过 SubmitGuard，产出 vendor 载荷满足：`model = "index-tts"`、含 `metadata.nodeInfoList`，其中节点 `4`/`audio` 与节点 `7`/`text` 齐备，且**载荷中不含 `data:` URI**。
- **AC-3 闸门拒绝面**：缺文稿、缺参考音、参考音为 `data:` URI、非法参数时在发出 HTTP 前被拒，错误码为既有 guard 码族，不得伪报成功。
- **AC-4 异步闭环**：`POST /v1/video/generations` 创建 → 轮询 `GET /v1/video/generations/{task_id}` → 下载产物 → 写入 `dest`；`wait:false` 返回 `mode: submitted` + `taskId`；产物为空体或非音频 MIME 时不写文件、不伪报成功。
- **AC-5 画布准入**：「声音克隆」节点能够列出 `index-tts` 作为候选模型（准入判定链真实命中），不再出现「无兼容模型」。
- **AC-6 既有链路不回归**：`seed-audio-1.0` 的 `text_to_speech`（同步 `/v1/audio/speech`）、`suno` 的音乐任务、语音识别链路行为不变。
- **AC-7 跨插件闭环**：`pnpm verify:model-contracts` 严格通过；`omnimux` 与 `omnimux-workflow` 相关测试全绿。
- **AC-8 新用户基线**：全新用户安装并登录后即可用（能力只依赖网关凭据与公网参考音），不依赖开发机私有状态；缺凭据时报既有 `needs-omnimux` 可读错误，而非静默回退。

## 4. 非目标

- 不改动 `seed-audio-1.0` 的 `text_to_speech` 行为，不为它新增 `voice_clone`。
- 不新增本 Issue 之外的模型行；不做生产发布、`--prod` / `--all` 物化或凭据引导。
- 不为参考音引入新的存储体系；复用既有上传转公网 URL 通道。

## 5. 设计约束与已知张力

1. **registry 张力**：`operation-registry.json` 的 `voice_clone.promptPolicy` 为 `required`，而渠道文档写明 `prompt` 非必填（「仅作标签」，文稿写在节点 7）。裁决：沿用仓内 `digital_human` / `speech_to_text` 先例，在模型行内表达「文稿必填、prompt 非必填」，并在 notes 写清依据，不修改 registry 语义。
2. **端点归属**：产物是音频但端点是视频任务通道。契约 operation 仍为 `voice_clone`（`audioGenerate` profile 的 operations 已含该操作），执行层必须走视频任务协议；不得把它压成 `text_to_speech`。
3. **白名单策略**：`audioGenerate` profile 的 `unknownFieldPolicy` 为 `reject`，必须为 `voice_clone` 补 `operationVendorShapes` 条目，否则合法载荷会被白名单拦掉。
4. **参考音本地文件**：本地路径必须先经既有上传通道转公网 URL；转换失败即失败，不得退化为 `data:` URI。

## 6. 证据要求

- 离线夹具证据：请求构造、闸门拒绝面、异步轮询与落盘、错误分支（401/402/429/5xx/空体/错 MIME）。
- 契约门禁：`pnpm verify:model-contracts` 严格输出。
- 测试：`pnpm --filter omnimux test`、`pnpm --filter omnimux-workflow test` 相关文件全绿。
- 画布准入：以契约投影为准的准入判定测试（不得以截图代替判定链证据）。
- 真实浏览器验收：若改动触及画布可见行为，按 `docs/contracts/plugin-qa.md` 在本工作树内取真实浏览器证据；Dev 45120 真机验收归人工，不作为本任务卡点。
