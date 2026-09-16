# Gemini 3.8 Flash 全模态契约更新与本地适配规范 (Issue #2071)

## 1. 背景与业务价值
上游 OmniMux（commit `5e61dc3ce`）已正式丰富了 `gemini-3.8-flash` 的多模态契约格式，明确支持了全模态输入能力：
- 图片扩展格式：增加支持 HEIC、HEIF（原有 PNG, JPEG, WEBP 保持兼容）；
- 视频多格式：增加支持 MOV, MPEG, AVI, WMV, FLV（原有 MP4 保持兼容）；
- 音频输入直传：正式开放 MP3, WAV, MPEG 输入；
- 通用文档解析：正式开放标准 PDF 文件输入；
- 专线保障：多模态复杂文件建议路由至官方 Vertex 直连专线（渠道 68）。

此前，本地中枢仅暴露了 `chat` 与 `vision_chat`，且多模态操作仅配置了基础图片与单 MP4 视频，代码中硬编码拦截音频与文档，界面操作名称沿用“图文对话”，导致用户误以为不支持音视频与其他文件。
本规范旨在同步上游契约，打通本地多模态发送管道，并对齐创作画布卡槽派生与连线装填，实现全模态端到端闭环。

## 2. 术语与业务实体
- **Gemini 3.8 Flash (`gemini-3.8-flash`)**：Google 最新旗舰长上下文多模态模型，支持文本、图像、视频、音频、PDF 综合理解。
- **多模态对话 (`vision_chat`)**：操作标识保留 `vision_chat`（契约全局枚举），显示名称升级为「多模态对话」，覆盖图、视、音、文四大模态。
- **素材插槽 (Slot)**：
  - `reference_images`：图片槽位（0~10 张，支持 PNG/JPEG/WEBP/HEIC/HEIF，单张上限 20MB）；
  - `reference_videos`：视频槽位（0~1 条，支持 MP4/MOV/MPEG/AVI/WMV/FLV，单视频上限 50MB）；
  - `reference_audios`：音频槽位（0~1 条，支持 MP3/WAV/MPEG，单音频上限 25MB）；
  - `reference_documents`：文档槽位（0~1 份，支持 PDF，单文件上限 50MB）。

## 3. 用户关键旅程与操作路径
1. **模型控制台浏览**：用户打开中枢模型控制台，查看 `gemini-3.8-flash`，生成操作显示为「多模态对话」，清晰标明具备图、视、音、文多模态输入能力。
2. **创作画布连线装填**：
   - 文本生成节点选中 `gemini-3.8-flash` 时，卡槽区域自动派生出图片、视频、音频、文档 4 类卡槽；
   - 用户可将上游的录音文件（MP3/WAV）、视频片段（MP4/MOV）或说明书（PDF）连入文本节点，卡槽自动装填呈现；
   - 节点点击生成时，本地发送管道自动将各媒体转为上游网关规范的请求载荷并顺利获得模型回复，零拦截零报错。

## 4. 验收条件 (Acceptance Criteria)

### AC-1: 契约真源规格同步与对齐
- 更新 `plugins/omnimux/src/catalog/specs/text-models.yaml`：
  - `gemini-3.8-flash` 的 `vision_chat` 操作：
    - 显示名称更新为 `多模态对话`；
    - `reference_images` 格式白名单扩展为 `["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]`；
    - `reference_videos` 格式白名单扩展为 `["video/mp4", "video/mov", "video/mpeg", "video/avi", "video/wmv", "video/flv"]`；
    - 新增 `reference_audios` 槽位，`type: "audio"`, `role: "reference"`, `min: 0`, `max: 1`, `allowedMimes: ["audio/mp3", "audio/wav", "audio/mpeg"]`, `maxSizeMb: 25`；
    - 新增 `reference_documents` 槽位，`type: "document"`, `role: "reference"`, `min: 0`, `max: 1`, `allowedMimes: ["application/pdf"]`, `maxSizeMb: 50`；
  - 调研与依据更新为上游 `5e61dc3ce` 及最新事实证据；
  - 执行严格契约门禁 `node scripts/verify-model-contracts.mjs --strict` 确保 0 errors, 0 warnings。

### AC-2: 本地发送层多模态管道全通
- 扩展 `plugins/omnimux/src/text/references.js` 与 `execute.js`：
  - 解除针对音频与文档输入的拦截；
  - 增加音频探测器与加载器（支持 MP3/WAV/MPEG，生成 `data:audio/...` 数据 URI）；
  - 增加文档探测器与加载器（支持 PDF，生成 `data:application/pdf` 数据 URI）；
  - 在 `completeTextViaChat` (`chat.js`) 中，放行 `data:audio/` 与 `data:application/pdf` 的媒体打包，支持将其作为多模态输入正常 POST 至上游端点。

### AC-3: 画布卡槽布局与装填对齐
- 检查并更新 `plugins/omnimux-workflow/src/shared/graph/feedSlot/slotLayoutTable.ts`：
  - `vision_chat` 的 slots 列表增加 `reference_audios`, `reference_documents`；
  - `SLOT_NAME_ALIASES` 补充 `reference_documents` 与 `reference_audios` 的别名映射；
  - 当文本节点选中 `gemini-3.8-flash` 时，`deriveSlotLayout` 能够正确产出包含图片、视频、音频、文档的卡槽定义。

### AC-4: 质量门禁与回归全绿
- 现有单元测试全部通过（包含 `omnimux` 与 `omnimux-workflow` 的所有既有测试）；
- 补充针对 Gemini 3.8 Flash 音频与 PDF 输入的端到端单测用例。

## 5. 边界防御与异常处理
- **非法格式防御**：上传不支持的格式（如 exe、zip、非 pdf 文档）时，在本地提交前拦截并给出明确提示，不向外部发送废包；
- **体积超限防御**：音频超过 25MB、文档/视频超过 50MB 时，SubmitGuard 严格校验并拦截；
- **通道兼容回退**：对音频与文档多模态请求，优先路由至 Vertex 直连通道（渠道 68）以确保完整多模态支持。

## 6. 验证计划与测试矩阵
- **静态门禁**：`node scripts/verify-model-contracts.mjs --strict`
- **中枢单测**：`pnpm --filter omnimux test`
- **工作流与画布单测**：`pnpm --filter omnimux-workflow test`
- **端到端多模态打包验证**：模拟图片、视频、音频、PDF 输入执行本地装配与提交，验证请求 payload 结构 100% 符合上游规范。
