---
title: "OmniMux 全模态模型输入输出契约 + 画布兼容性与自动适配 PRD"
id: "spec-model-io-contract-compatibility-prd"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-09-04"
updated: "2026-09-06"
authors: ["xu-qingchu"]
subsystem: "omnimux/catalog"
tags:
  - "model-contract"
  - "operation"
  - "canvas-compatibility"
  - "catalog"
  - "workflow"
  - "mcc"
supersedes: []
superseded_by: null
related:
  - "docs/specs/2026-09-05-model-contract-docs-first.md"
  - "docs/contracts/model-capabilities-matrix.md"
  - "docs/contracts/hub.md"
  - "docs/contracts/model-list-ownership.md"
  - "docs/contracts/docs-governance-standard.md"
  - "docs/contracts/dev-pipeline.md"
  - "docs/contracts/plugin-git-pr.md"
---

# PRD：全模态模型输入输出契约 + 画布兼容性与自动适配

> **2026-09-05 当前方法**：[模型合同文档优先方法修订](2026-09-05-model-contract-docs-first.md) 与 [模型 API 权威](../contracts/model-api-authority.md) 取代本文关于存在性、最小生成、边界探测、样本上限、真实执行和按执行翻转 `listed` 的可执行指令。本文保留原模型范围、历史快照与已发生执行；它们不得被当作当前输入合同。具体 EvoLink/APIMart 模型 API 文档未说明的字段、角色、数量、格式、时长和模式均为未知，不得猜测、试探或跨渠道借用。

> **2026-09-06 输入与提交补充**：[节点有效输入与提交合同](../contracts/node-input-submission.md)规定上游与本地内容组合、选定输出、就绪状态及提交一致性；相关旧叙述以该合同为准。[需求补充与验收矩阵](2026-09-06-node-input-submission-prd.md)记录本次范围，接受需求不代表实现完成。

> **文档地位**：L2 已接受 PRD（Issue #463 / #464）。供架构师收敛 MCC 运行时真源、画布连线 / 列表 / 模式 UI 规则；**只写产品行为与验收，不写模块级实现**。
> **问题起源**：视频生成模式分裂（runtime 旧别名 vs MCC 标准 operation）暴露的是架构级缺口——文本 / 图片 / 视频 / 音频缺少统一 I/O 契约，且契约未在「录入模型时」闭环。
> **本仓边界**：不做定价、不做 HITL（已移交 OmniMux 主产品线）；本轮不做 ASR 真实 seam、不做 document 画布消费。
> **原则金句**：**录入即契约**；**Model capability 根 canonical = `schemaVersion: "1.1"`（No Spec No Model）**；**能连上 = 模拟后至少一个 listed 兼容模型，且 edge / model / operation 原子适配**；**Hide, Don't Grey**；**0/1 有效 operation 无 mode UI**；**acceptsCurrentInputs ≠ readyToSubmit**；**Fail-fast + typed reason**。
> **术语**：`omnimux` 一律称**执行中枢**；禁止称「网关」。
> **落盘**：`docs/specs/2026-09-04-model-io-contract-compatibility-prd.md`

---

## 1. 项目信息

| 字段 | 值 |
|---|---|
| Language | 中文 |
| Programming Language | 不规定实现栈（产品 PRD）；画布消费侧既有 `omnimux-workflow`，契约 SSOT 在 `omnimux/catalog` |
| Project Name | `model_io_contract_compatibility` |
| 主责子系统 | `omnimux/catalog`（契约 SSOT）+ `omnimux-workflow`（画布消费） |
| 上游合同 | MCC 1.0 [`docs/contracts/model-capabilities-matrix.md`](../contracts/model-capabilities-matrix.md)（L1 living） |
| 关联 Issue | #463（契约基础）、#464（画布兼容与自动适配） |
| 风险与合入 | **R1**；**单插件 PR**；**人工合并**（见 §9） |

### 1.1 原始需求复述

从视频生成模式问题延伸，要在架构层统一**全模态**模型输入输出规范；规范必须在**录入模型时**研究并配置完成，而不是画布报错后再补。录入时需明确：支持格式与类型、输入素材限制（数量 / MIME / 体积 / 时长 / 角色）、**显式产出类型**，并映射到节点交互。画布侧：上游可接文本 / 图 / 视频 / 音频；模型列表做支持检测；仅支持文本的模型在上游有图 / 视频时不可选；体积、时长、数量与格式按 slot 记录该渠道该模型 operation 的官方 API 文档；文档未说明即标为未知，不用测试样本或保守政策值填补。100MB 仅为测试 / 声明示例，不是全平台统一硬顶；只要能连上，列表里至少有一个支持模型且必须自动适配；模式 UI 已锁定（0/1 不显示，≥2 才显示有效项，隐藏不置灰）。

---

## 2. 产品目标与非目标

### 2.1 产品目标（正交 ×3）

| # | 目标 | 可度量口径 |
|---|---|---|
| G1 | **全模态统一 I/O 契约（operation 原子）** | 文本 / 图片 / 视频 / 音频模型在录入时即具备：支持 operation、输入槽位、显式 `output.type`、MIME / 数量 / 体积 / 时长 / 角色约束；运行时只读契约；**禁止**前端 / 适配器 / Workflow 私有硬编码第二套穷尽枚举 |
| G2 | **画布兼容性 Fail-fast + 自动适配** | 上游素材指纹驱动：连线拦截（类型 / 体积等）、模型列表只出兼容项；「能连上」= 模拟后 ≥1 个 listed 兼容模型，且 edge / model / operation 三者原子适配；当前模型不兼容时必须自动切到兼容模型 |
| G3 | **模式 UI 最小暴露 + 可解释拒绝** | 有效 operation：0 → 无 mode UI 且阻止生成；1 → 无 mode UI；≥2 → 只列有效项。不兼容模型 / operation 在选择 UI **隐藏**；连接 / 提交拒绝必须带 **typed reason** |

### 2.2 非目标（本轮 / 本仓明确不做）

| 非目标 | 说明 |
|---|---|
| 定价 / 计费展示 | 移交 OmniMux 主产品线，本仓 PRD 不覆盖 |
| HITL / 人工审核流 | 移交 OmniMux 主产品线 |
| **ASR 真实 seam** | `speech_to_text` 可在契约中声明；**真实 speechToText 执行缝不在本轮**。Whisper 等在 seam 未实现前**不得**进入画布可选列表 |
| **document 画布消费** | `document_analyze` 等 document 槽可在契约保留；**画布 document 连线 / 节点支持不在本轮** |
| 新模型厂商 HTTP 适配大改 | 仅要求适配层消费统一契约；具体 provider 实现不在本 PRD |
| 画布 DAG 执行引擎整体重构 | 只约束 Material 生成节点的入边兼容、列表、mode UI 与提交前校验 |
| 用户自定义「永久隐藏某 operation」偏好 | 可见性只由契约完备度 + research 验证 + 执行 live/profile 存在性 + 上游指纹决定 |
| Workflow 复制第二套 operation 穷尽枚举 | **禁止**；MCC 首批 17 项为标准 operation 目录，扩展先改 L1 MCC |
| 未合并代码物化公共 45120 / 任何 Prod 物化 | 见 §9；日常严禁 `--prod` |

---

## 3. 核心概念：operation 作为原子任务

### 3.1 一句话定义

**operation** = 改变**输入槽位结构 / 语义角色**或**任务族**的原子操作方式；是兼容性计算、连线合法性、列表过滤、模式 UI 显隐的最小任务单位。

- MCC 1.0 已声明的 **17 项**是**首批标准 operation**（可扩展，但必须先改 L1 MCC 合同，再录入 YAML）。
- **Workflow / 画布不得维护第二套穷尽枚举**；只消费执行中枢 / catalog 暴露的规范化 operation 索引。
- **参数 ≠ operation**：`aspectRatio`、`duration`、`resolution`、`cfg`、`seed`、音色、语速等不改变槽位拓扑，挂在 operation 或 model 的 `parameters` 上；不得伪装成 operation，不得因参数不支持就「置灰一个假模式」。

### 3.2 首批标准 operation（MCC 17，引用而非复制为第二真源）

| 模态族 | operation ID | 中文名 | 典型输入 | **`output.type`（必须显式）** |
|---|---|---|---|---|
| 文本 | `chat` | 纯文本对话 | 无媒体槽（仅文本） | `text` |
| 文本 | `vision_chat` | 图文多模态对话 | `reference` 图 | `text` |
| 文本 | `document_analyze` | 文档解析 | `document` | `text` |
| 图像 | `text_to_image` | 文生图 | 无图槽 | `image` |
| 图像 | `image_to_image` | 图生图 | `source` 图 | `image` |
| 图像 | `multi_reference` | 多图主体参考 | `reference` 多图 | `image` |
| 图像 | `inpaint_outpaint` | 局部重绘 | `source` + mask | `image` |
| 视频 | `text_to_video` | 文生视频 | 无媒体槽 | `video` |
| 视频 | `first_frame` | 首帧驱动 | `first_frame` 图 ×1 | `video` |
| 视频 | `first_last_frame` | 首尾帧过渡 | `first_frame` + `last_frame` | `video` |
| 视频 | `video_multi_ref` | 多图风格 / 主体参考 | `reference` 多图 | `video` |
| 视频 | `digital_human` | 数字人 / 对口型 | 图 / 视频 + 音频驱动 | `video` |
| 视频 | `video_edit` | 视频编辑 / 重绘 | `source` 视频 ± 参考 | `video` |
| 音频 | `text_to_speech` | 语音合成 | 文本 | `audio` |
| 音频 | `voice_clone` | 声音克隆 | `voice_sample` 音频 | `audio` |
| 音频 | `text_to_music` | 音乐创作 | 文本 ± 参考音频 | `audio` |
| 音频 | `speech_to_text` | 语音转文字 | `source` **音频** | **`text`（非 audio）** |

> **计数**：3 + 4 + 6 + 4 = **17**。
> **`speech_to_text` 特判**：输入模态是 audio，**产出是 text**；契约必须写显式 `output.type: text`，禁止从「音频族」推断产出为 audio。
> **禁止历史别名真源**：runtime 旧名（如 `reference` 当作 GenerationMode）只允许迁移映射层翻译为标准 operation ID；用户可见与校验一律标准 ID。

### 3.3 模型能力契约文档根形状（Contract v1.1，产品层）

**Model capability YAML / 规范化文档**的顶层 canonical 形状**必须以** `schemaVersion` **开头**（用户批准的 Contract v1.1）。产品与验收口径如下：

| 项 | 产品约束 |
|---|---|
| Canonical 根字段 | **必须**为 `schemaVersion: "1.1"`（**精确字面量** `"1.1"`）；正式 specs、normalize 输出、index / export / fingerprint / report **只认 / 只暴露** `schemaVersion` |
| **禁止**根 `version` 作 canonical | 根级 `version` **不是** model capability 合同字段；不得作为正式 specs 或规范化产物的真源字段 |
| **No Spec No Model** | 缺完整契约（含合法 `schemaVersion` + models 与下文 operation/slots/`output.type`）→ 模型**不得**上架、**不得**进入画布可选目录 |
| 非本约束文档 | `operation-registry.json`、`adapter-profiles.json` 是**不同文档**，继续使用各自文档自身的 `version` 字段；**不得**因本条机械改为 `schemaVersion`，也**不得**用本条去约束它们 |

#### 3.3.1 兼容迁移（仅 legacy 输入；canonical 输出只含 schemaVersion）

| 输入情形 | 产品行为 | 验收 |
|---|---|---|
| 仅 legacy 根 `version`（如旧 `"1.0"`） | loader **pre-normalization** 可接受并**映射**为 canonical `schemaVersion`；映射后**剥离** legacy `version` | 规范化 / index / export 输出**只含** `schemaVersion`，**不含**根 `version` |
| 同时存在根 `version` 与 `schemaVersion`（both） | **拒绝** | typed reason（如 `schema_version_conflict` / 等价） |
| 二者值冲突（conflict） | **拒绝** | 同上，可解释 |
| 二者皆缺（missing） | **拒绝** | typed reason（如 `schema_version_missing`） |
| `schemaVersion` 存在但非 `"1.1"`（wrong） | **拒绝** | typed reason（如 `schema_version_unsupported`） |
| 正式 specs（本主题迁移后） | 直接写 `schemaVersion: "1.1"`；不再以根 `version` 为正式真源 | 抽检正式 YAML 根字段仅为 `schemaVersion` |
| legacy 夹具 | 仅用于 loader 迁移 / 拒收测试；**不**作为在架正式 specs | fixture 覆盖：可迁移 / both / conflict / missing / wrong |

> **边界**：上述迁移与拒收**仅**针对 **model capability** 契约文档根。registry / adapter-profile 文档版本字段见上表「非本约束文档」，避免误改。

#### 3.3.2 Aliases 两层产品语义

| 层 | 作用域 | 产品语义 | 边界 |
|---|---|---|---|
| **Model aliases** | 模型 metadata（契约 shape 中的 model 级 `aliases`） | **runtime / wire model ID 归一**：外部或历史 model ID → 目录 canonical modelId | 用于列表、路由、指纹与兼容计算前的模型身份归一；**不是** operation 目录 |
| **Operation aliases** | operation 的 legacy 附属映射 | **仅**把 runtime 旧 operation / GenerationMode 别名翻译为 **MCC 标准 operation ID** | 用户可见与校验一律标准 ID；**禁止**把 operation alias 当成第二套穷尽枚举真源；与 model aliases **分层、不可混用** |

> 与 §3.2「禁止历史别名真源」一致：alias 只做迁移 / 归一，正式产品面与门禁只认 canonical ID + 标准 operation。

### 3.4 契约字段（录入时必须研究清楚，产品语义）

每个模型在每个 **operation** 下声明输入槽；槽是兼容性与节点交互的最小单位：

| 字段 | 含义 | 产品约束 |
|---|---|---|
| `operation` | 标准 operation ID | ∈ MCC 枚举（扩展先改 L1）；**profile.operations[] 每一项必须属于标准 registry**，未知 operation = malformed（不可上架 / audit 错误） |
| `output.type` | 产出大类 | **必须显式**：`text` / `image` / `video` / `audio`（可扩展须先合同）；不得只靠模态族默认推断 |
| `slot` | 槽位稳定名 | 如 `start_frame`、`reference_images` |
| `type` | 输入媒体大类 | `text` / `image` / `video` / `audio` / `document`（document 本轮画布不消费） |
| `role` | 语义角色 | `first_frame` / `last_frame` / `reference` / `source` / `voice_sample` / `mask` 等 |
| `min` / `max` | 数量上下限 | 决定「还能不能再连」、超额拒绝；也参与 `readyToSubmit` |
| `allowedMimes` | 允许 MIME | 不匹配则不可连 / 不可提交 |
| `maxSizeMb`（或等价体积上限） | **单素材体积上限** | **按 slot 记录该渠道、该模型、该 operation 的官方 API 文档上限及精确来源。**100MB 仅是测试或某模型声明示例，不是所有模型统一硬上限**。文档未说明则标为未知；不得以实测、拒绝或保守政策值代替渠道限制。本 PRD 不由未知项直接推断渠道不支持或变更上架状态 |
| `maxDurationSec` | 时长上限（音视频） | 若官方文档声明则用于提交前校验，并记录精确来源；未声明则为未知，不得猜测时长上限 |
| `inputs: []` | 无媒体槽 | 该 operation 仅文本提示（如纯 `chat`、`text_to_video`） |

**录入即契约**：文档根须合法 `schemaVersion: "1.1"`；模型须具备完整 operation + inputs（含限制）+ 显式 `output.type`。否则 **No Spec No Model**，**不得**进入可被画布选择的目录。

### 3.5 模型可见性（上架 / 画布列表资格）

模型（或某 operation 行）对画布**可见**，当且仅当同时满足：

1. **完整 contract**（合法 `schemaVersion: "1.1"`、operation、slots、约束、`output.type` 齐备；normalize 后无根 `version`）；
2. **research verified**（官方文档 URL / 研究依据与置信度达标）；
3. **execution live 或 profile 已存在**（对应执行中枢能力 / 路由 / profile 真实可调用，而非仅有纸面声明；**profile.operations[] ⊆ 标准 registry**）。

推论：

- **Whisper**（及同类 ASR）：在 **speechToText seam 未实现**前，即使 YAML 草稿存在，**不得**进入画布模型列表。
- 契约残缺、research 未过或执行面不存在可影响当前实现可见性；体积 / 时长的官方文档缺项只表示未知，不能由历史实测、探测失败或保守取值推断为渠道不支持。

---

## 4. 用户故事

| ID | 故事 |
|---|---|
| US-1 | 作为创作者，我希望把图片 / 视频 / 音频 / 文本接到生成节点时，系统只让我连上「真的吃得下」的线，并且自动帮我选好支持的模型，这样我不会在点生成后才发现 operation 或模型不对。 |
| US-2 | 作为创作者，当我给当前纯文本模型新接上图片时，我希望节点自动切到支持该输入的模型，而不是留下一个可选但实际不可用的模型，或弹出晦涩报错。 |
| US-3 | 作为创作者，当模型只有 0 或 1 种有效生成方式时，我不希望看到模式切换条或置灰选项；只有 ≥2 种有效方式时才出现 mode UI，且只列出有效项。 |
| US-4 | 作为创作者，我希望可以先逐步连线（哪怕某槽 `min` 尚未满足），系统仍接受「当前输入可被吸收」的中间态；但只有在必填槽 / prompt / metadata 齐备时才允许提交生成。 |
| US-5 | 作为模型录入 Agent，我必须在录入时使用 canonical `schemaVersion: "1.1"`，并根据官方文档研究并写全支持格式、槽位、数量 / MIME / 体积 / 时长 / 角色与 `output.type`，并标注上限来源；缺失、错误 schemaVersion 或无可信边界应被门禁拒绝，而不是留给画布用户背锅。 |
| US-6 | 作为平台工程师，我希望带 `schemaVersion` 的 YAML specs 成为唯一真源，runtime 双表与 BUILTIN 硬编码被收敛，CI 能挡住「无契约模型」「根 version 漂移」和「契约与列表不一致」，以便画布与执行中枢同一套规则 Fail-fast。 |
| US-7 | 作为打开旧画布的创作者，当历史图出现「当前指纹下零兼容模型」时，我希望**不静默删边**，而是进入可解释的 `configuration_error`，以便我手动调整；新的连线 / 改模 mutation 则走严格规则。 |

---

## 5. 需求池（P0 / P1 / P2）

### 5.1 P0 — Must have（本主题闭环）

| ID | 需求 | 验收要点 |
|---|---|---|
| P0-1 **I/O 契约完备（含 schemaVersion）** | 全模态统一输入输出契约：**Model capability 文档根 canonical 必须为 `schemaVersion: "1.1"`**（精确字面量）；**No Spec No Model**。operation ∈ MCC 首批 17（扩展先改 L1）；每 operation 声明 slots（type/role/min/max/MIME/size/duration）+ **显式 `output.type`**。**profile.operations[] ⊆ 标准 registry**。`operation-registry.json` / `adapter-profiles.json` 等**其他文档**继续自身 `version`，**不在**本条 schemaVersion 约束内 | 正式 specs / normalize / index / export / fingerprint / report **只含 / 只暴露** `schemaVersion`，**不含**根 `version`；抽检任意上架模型可回答「能接什么、产出什么、不能接什么」；无槽 operation 显式 `inputs: []`；`speech_to_text` 产出为 text；未知 profile operation → 拒绝（malformed） |
| P0-1a **schemaVersion 兼容迁移** | **仅** legacy 根 `version` 可在 loader pre-normalization **输入兼容**并映射为 `schemaVersion`，映射后**剥离** `version`。**both**（同时存在）/ **conflict**（值冲突）/ **missing**（皆缺）/ **wrong**（非 `"1.1"`）一律**拒绝**并给 **typed reason**。Canonical 输出**不得**回写根 `version` | 夹具：仅 legacy version → 可迁移且输出只有 schemaVersion；both/conflict/missing/wrong → 拒绝 + typed reason；正式四份 YAML 为 schemaVersion，不以根 version 为真源 |
| P0-2 **录入门禁与上限来源** | 录入 / 上架强制：合法 `schemaVersion` + 官方文档依据 + 完整 YAML + 置信度；每 slot 体积 / 时长上限有**真实或保守政策**值并**记录来源**；无可信边界 → draft/unavailable | 缺/错 schemaVersion、缺文档 URL / 缺 operation / 缺关键约束 / 无来源上限 → 录入失败或 CI 红灯；**禁止**用「全局 100MB」冒充所有模型硬顶 |
| P0-3 **可见性三元组** | 画布列表资格 = 完整 contract（含合法 schemaVersion）∧ research verified ∧ execution live/profile exists（profile ops ∈ registry） | Whisper 在 speechToText seam 前不可见；draft 模型不出现在选择 UI |
| P0-4 **上游指纹** | 生成节点计算上游素材指纹：模态集合、各边 MIME、体积、时长、数量、角色占用 | 指纹变化触发列表过滤与自动适配；与当前 operation 候选集可交叉计算 |
| P0-5 **连线规则（新 mutation）** | 连线时校验：类型是否被**任一**可达 listed 模型的某 operation 某槽接受；单文件体积 vs **该 slot 声明上限**；时长；槽容量；角色冲突；模拟后 ≥1 listed 兼容模型 | 超该 slot 上限 → **拒绝连接** + typed reason；纯文本-only 模型在仅 chat 且无视觉 operation 时，上游图 / 视频 → 不可成为合法端点 |
| P0-6 **能连上不变量** | **能连上 ⇒** 模拟后列表中至少有一个兼容模型，且存在 edge / model / operation 的原子适配方案；连接成功后当前选中必须兼容（否则立即自动切换） | 禁止「线连上了但列表为空 / 选中不兼容」 |
| P0-7 **列表过滤 Hide** | 模型下拉 / 列表**只展示**与当前上游指纹兼容且满足可见性三元组的模型 | 不兼容项 **不出现**（Hide, Don't Grey）；禁止「可见但 disabled」作主路径 |
| P0-8 **自动适配** | 若当前模型因新上游而不兼容 → **必须**自动切换到列表中的兼容模型（确定性规则，见 §6） | 例：当前纯文本模型，上游新连图片 → 自动切到支持该输入的模型 |
| P0-9 **acceptsCurrentInputs vs readyToSubmit** | **区分**两态：前者 = 当前已连输入可被某 operation 槽位结构吸收（允许缺 min / 缺 prompt，便于逐步连线）；后者 = 满足 min、prompt、必要 metadata，才允许提交 | 逐步连线不因「尚未满 min」而整节点锁死；生成按钮 / 提交闸只认 `readyToSubmit` |
| P0-10 **模式 UI 锁定** | 有效 operation 数：**0** → 不显示 mode UI **且阻止生成**；**1** → 完全不显示 mode UI；**≥2** → 只显示有效项；不支持项 100% 隐藏，永不置灰 | 单 operation 不出现「全能参考」等误导文案；文案来自当前 operation 的 label |
| P0-11 **执行前校验** | 提交生成前按**当前模型 + 当前 operation + 指纹** Fail-fast；与连线规则同源契约；错误 **typed reason** 可读可定位 | 不把无效请求打到厂商；缺 min / prompt / metadata → 不可提交 |
| P0-12 **旧图零候选** | 打开 / 加载历史画布时，若当前指纹下**零**兼容模型：**不删边**；节点进入 **`configuration_error`**，阻止生成，并给出可解释原因 | 与「新 mutation 严格拒连」区分；用户可手动改线 / 改模恢复 |
| P0-13 **YAML SSOT 消费** | catalog **model capability** specs（YAML，根 `schemaVersion`）为目录与兼容性真源；画布与执行中枢评估器读同一来源；Workflow **不得**复制第二套 operation 穷尽表；model aliases 做 wire model ID 归一，operation aliases 仅 legacy 附属 | 禁止 media/text 双表 + BUILTIN 长期并行为真源；禁止根 `version` 作 model-contract canonical；迁移期只读适配允许，产品验收以 YAML / MCC 为准 |
| P0-14 **测试门禁** | 契约 schema（canonical `schemaVersion`）、legacy version 迁移与 both/conflict/missing/wrong 拒收、录入完整性、上限来源、可见性三元组、profile 未知 operation、指纹 × 兼容矩阵、连线拒绝、自动切换、0/1/≥2 mode UI、accepts vs ready、旧图 configuration_error 等自动化门禁 | CI 可红灯；关键路径有用例表（见 §8） |

### 5.2 P1 — Should have

| ID | 需求 | 验收要点 |
|---|---|---|
| P1-1 | 槽位角色与连线 UI 提示（typed reason 文案：MIME / 体积 / 时长 / 数量已满 / 无兼容模型 / 角色冲突） | 用户拒连时能理解原因 |
| P1-2 | 自动切换时的轻量提示（非阻断）：「已切换至 {model} 以支持上游图片」 | 可改选其他兼容模型，不可回到不兼容模型 |
| P1-3 | operation 与参数面板解耦：参数随 operation 变化；参数不支持 = 隐藏该参数，不置灰整 operation | 无假 mode |
| P1-4 | 多 operation 仍兼容时的「最优 operation 自动建议」（≥2 仍兼容） | 稳定优先级；用户可改；P0 不强制智能改 operation（见 Q） |
| P1-5 | YAML 覆盖率仪表：模态 × operation × 在架模型矩阵（含上限来源与可见性状态） | 治理可视，便于录入 Agent 补洞 |
| P1-6 | 边与 material 能力对齐契约槽，减少「能连但不能跑」 | 与 P0-5 / P0-9 同源 |
| P1-7 | document 类型画布连线消费（若产品排期） | 先有契约，本轮明确不做；P1 再开 |

### 5.3 P2 — Nice to have

| ID | 需求 | 验收要点 |
|---|---|---|
| P2-1 | 时长 / 分辨率组合约束的更细厂商差异（同一 operation 多 profile） | 不破坏 17 operation 枚举 |
| P2-2 | ASR 真实 speechToText seam + Whisper 等进入可见性三元组 | 独立主题；本 PRD 只留契约位 |
| P2-3 | 兼容性解释面板（开发者 / 高级用户） | 展示指纹与候选 operation 匹配过程 |
| P2-4 | 批量录入向导（多模型官方文档抓取辅助） | 仍须确认契约字段与上限来源 |

---

## 6. 交互规格与错误体验

### 6.1 核心心智（创作者）

```text
上游变化 → 更新指纹
        → 过滤「可见且兼容」模型（Hide 不兼容）
        → 保证选中合法（自动适配）
        → 计算有效 operation 集
        → 0：无 mode UI + 阻止生成
          1：无 mode UI
          ≥2：只列有效 operation
        → 连线（新 mutation）拦截非法边；typed reason
        → acceptsCurrentInputs 允许逐步连线
        → readyToSubmit 才允许提交；提交前再次 Fail-fast
```

### 6.2 连线（Edge）— 新 mutation

| 场景 | 系统行为 |
|---|---|
| 上游可被目标节点**某 listed 兼容模型的某 operation 某槽**吸收，且未超该槽容量 / 声明体积 / 时长；模拟后 ≥1 兼容模型 | **允许连接**；连接后刷新列表与自动适配 |
| 上游体积 > **该 slot 声明上限**（来源见契约） | **拒绝连接**；`size_exceeded` + 展示上限与来源摘要（若 UI 允许） |
| 上游 MIME 不在任何兼容槽 `allowedMimes` | **拒绝连接**；`mime_unsupported` |
| 目标槽 `max` 已满 | **拒绝连接**或拒绝占用该槽的边；`slot_capacity` |
| 指纹下**零** listed 兼容模型 | **拒绝连接**；`no_compatible_model`（维护能连上 ⇔ 有模型） |
| 仅「去掉某既有上游」后才兼容 | 不自动删边；拒连或保持原状，由用户处理 |
| 当前输入尚未满足某槽 `min`，但类型 / 角色可被吸收 | **允许**作为逐步连线（属 `acceptsCurrentInputs`）；不因此单独成为「永久可提交」 |

### 6.3 旧图与 configuration_error

| 场景 | 系统行为 |
|---|---|
| 加载历史画布，当前指纹 + 当前目录下**零**兼容模型 | **保留所有边**；节点进入 **`configuration_error`**；阻止生成；展示 typed reason（如 `no_compatible_model` / `contract_missing` / 模型已下架） |
| 用户在错误态下发起**新**连线或改模型 | 走 §6.2 严格规则 |
| 用户修复后恢复 ≥1 兼容模型 | 退出 `configuration_error`；执行自动适配与 operation 重算 |

### 6.4 模型列表与自动适配

| 场景 | 系统行为 |
|---|---|
| 无上游媒体（纯文本指纹） | 列表 = 该产出模态下所有**可见**模型；保持用户选中（若仍合法） |
| 有图 / 视频 / 音频上游 | 列表 ⊆ 支持对应 type/role 的可见兼容模型 |
| 当前模型 ∉ 过滤后列表 | **立即自动选中**列表中的默认兼容模型 |
| 自动选中确定性（产品默认） | ① 同 family 保留 ② 目录默认 / badge 优先 ③ 稳定排序第一；须文档化，禁止随机 |
| 过滤后为空 | 新 mutation 下不应出现（连线已挡）；若竞态或旧图，进入 `configuration_error` 并禁止生成 |
| 用户手动改模型 | 只可选项 = 过滤后列表；选后重算有效 operation |

### 6.5 acceptsCurrentInputs vs readyToSubmit

| 状态 | 含义 | UI / 行为 |
|---|---|---|
| `acceptsCurrentInputs = true` | 当前已连入边在类型 / MIME / 体积 / 角色上可被**某**兼容 operation 吸收（允许尚未达到 `min`、允许 prompt 仍空） | 允许继续连线 / 调参；**不**等于可点生成 |
| `readyToSubmit = true` | 在 `acceptsCurrentInputs` 基础上，当前模型 + 当前 operation 满足：所有 `min`、必要 prompt、必要 metadata，且无超限 | 生成按钮可点；提交闸放行 |
| 仅 accepts、未 ready | 缺必填槽或 prompt 等 | 生成禁用或提交 Fail-fast；typed reason 指向缺失项（如 `min_unsatisfied` / `prompt_required`） |

### 6.6 模式 UI（已锁定）

| 有效 operation 数 | 面板模式区 | TriggerBar 模式段 | 不支持 operation | 生成 |
|---|---|---|---|---|
| **0**（无有效 / 错误态） | **不显示** | **不显示** | — | **阻止** |
| **1** | **完全不显示** | **完全不显示** | 隐藏 | 取决于 `readyToSubmit` |
| **≥2** | 显示可切换（**仅有效项**） | 显示可切换（**仅有效项**） | **100% 隐藏，不置灰** | 取决于 `readyToSubmit` |

有效 operation = 当前**已选模型**声明 ∩ 能吸收**当前指纹**的 operation（并满足可见性）。
禁止：用 disabled 灰项表示「模型不支持」；禁止单 operation 时展示「参考 / 首尾帧」空壳。

### 6.7 节点交互表现（契约 → UI）

| 契约 | 节点表现 |
|---|---|
| 槽 `min/max` | 参考位 / 帧位数量与占位；满则不可再吸边；未达 min 时仍可逐步连，但不 ready |
| `role` | 首帧 / 尾帧 / 参考 / 声纹等语义位，而非无差别附件堆 |
| MIME / size / duration | 拖入或连线时前置校验；失败 typed reason |
| `inputs: []` | 无媒体槽 UI；上游媒体边对「仅该 operation」不合法 |
| `output.type` | 决定节点产出模态与下游可连类型（含 STT → text） |

### 6.8 异常与边界

| 异常 | 处理 |
|---|---|
| 契约缺失或 YAML 损坏 | 模型不上架 / 运行时不可选；开发态门禁失败 |
| 无可信体积 / 时长边界 | 不得用默默 100MB 填坑；保持 draft/unavailable |
| 上游文件丢失（断链） | 指纹降级；可能触发重新适配或错误态；不静默当成功 |
| 自动切换震荡（快速连 / 断） | 以稳定指纹防抖；最终态仍满足兼容不变量 |
| 提交瞬间上游被删 | 执行前校验失败，明确提示 |
| 历史画布仍存 `reference` 等旧 mode | 打开时映射到标准 operation；无法映射则清除并走自动适配或 `configuration_error` |
| summary 文案 | 单 operation 不得冒充多能力「全能参考」；文案来自当前 operation label |
| ASR / Whisper | seam 未 live 前隐藏；不出现「可选但一点就挂」 |

### 6.9 错误原因码（产品级，供文案与遥测）

| 原因码 | 含义 |
|---|---|
| `mime_unsupported` | MIME 不在允许列表 |
| `size_exceeded` | 超过**该 slot 声明**体积上限 |
| `duration_exceeded` | 超时长 |
| `slot_capacity` | 数量超过 max |
| `role_conflict` | 角色槽冲突或不匹配 |
| `no_compatible_model` | 无模型可吸收（新 mutation 应在连线拒绝；旧图 → configuration_error） |
| `model_incompatible` | 当前模型与指纹不兼容（应被自动切换消除；残留则属缺陷） |
| `operation_incompatible` | 当前 operation 不吸收指纹 |
| `contract_missing` | 无契约，模型不可用 |
| `schema_version_missing` | 根缺少 `schemaVersion` 且无合法可迁移 legacy `version` |
| `schema_version_conflict` | 同时存在根 `version` 与 `schemaVersion`，或二者值冲突（both/conflict） |
| `schema_version_unsupported` | `schemaVersion` 存在但不是精确 `"1.1"`（wrong） |
| `profile_operation_unknown` | adapter profile 声明了不在标准 operation registry 中的 operation（malformed） |
| `limit_source_missing` | 无可信上限来源，不可上架 / 不可选 |
| `execution_unavailable` | 执行面 / profile / seam 不存在（如 ASR 未实现） |
| `min_unsatisfied` | 未达槽 min（阻止 readyToSubmit，不必然拒连） |
| `prompt_required` | 缺少必要 prompt / 文本输入 |
| `metadata_required` | 缺少必要 metadata |
| `configuration_error` | 旧图或竞态下节点级配置错误态（不删边） |

### 6.10 与 MCC 治理原则对齐

1. **SSOT** = Model capability YAML specs（根 **`schemaVersion: "1.1"`** + MCC L1 枚举）；registry/profile 文档自有 `version`，与本根字段分层
2. **Hide, Don't Grey**（Don't Disable）
3. **Fail-Fast**（schemaVersion 迁移拒收 + 连线新 mutation + 执行中枢 / 提交）+ **typed reason**
4. **No Spec, No Model**（无合法 schemaVersion / 无完整契约 / 无可信边界 / 无执行面 = 不可见）

---

## 7. UI 设计草案（产品级布局，非视觉稿）

### 7.1 生成节点

- **入边**：按槽位语义吸附（首帧 / 尾帧 / 参考 / 源视频 / 声纹等）；非法拖拽或连线被拒并 toast / 行内 typed reason。
- **模型选择器**：只渲染过滤后列表；无「灰色不可选」行。
- **Mode 区 / TriggerBar 模式段**：按 §6.6 显隐；0/1 不占位。
- **生成控件**：绑定 `readyToSubmit`；未 ready 时禁用并显示缺失项摘要。
- **错误态条**：`configuration_error` 时顶部/节点徽章说明原因与建议操作（改模型 / 删冲突边 / 补契约），**不**自动拆边。

### 7.2 自动适配反馈（P0 最小 / P1 增强）

- P0：静默或极轻提示完成切换，最终态正确即可。
- P1：非阻断文案「已切换至 {model} 以支持上游 {模态}」。

### 7.3 录入 / 治理（Agent 与平台，非创作者主路径）

- 缺 `output.type` 或已声明字段不合法 → 门禁失败信息明确到字段；渠道文档缺项明确显示为未知，不以探测或保守值补齐。
- 覆盖率矩阵（P1）按模态 × operation 显示在架 / draft / unavailable。

---

## 8. 验收矩阵（DoD）

| # | 完成标准 | 优先级 |
|---|---|---|
| D1 | 本 PRD `accepted`；架构师输出对 MCC / 执行中枢 / catalog 的消费方案；明确废弃 runtime 双表为真源的时间盒 | P0 |
| D2 | 在架且画布可见的模型均有完整 YAML；根为 **`schemaVersion: "1.1"`**（无根 `version`）；含显式 `output.type`；`chat` vs `vision_chat` 对上游图片差异可测 | P0 |
| D2a | **schemaVersion 合同**：正式 specs 仅 `schemaVersion`；legacy 仅 `version` 可迁移且输出剥离；both/conflict/missing/wrong 拒绝 + typed reason；normalize/index/export/fingerprint/report 只暴露 schemaVersion；registry/profile 文档 `version` 未误改 | P0 |
| D2b | **aliases / profile**：model aliases 用于 runtime/wire model ID 归一；operation aliases 仅 legacy 附属；profile.operations[] 均 ∈ 标准 registry，未知 op 拒绝 | P0 |
| D3 | 每 slot 的数量、MIME、体积与时长均回指具体渠道模型 operation 的官方 API 文档，或明确标为未知；无「全局 100MB 硬顶」和实测样本上限冒充渠道限制 | P0 |
| D4 | 可见性三元组生效；Whisper 在 speechToText 未实现前不在画布列表 | P0 |
| D5 | 画布：图 / 视频 / 音频 / 文本上游指纹驱动列表过滤；不兼容模型不可见（Hide） | P0 |
| D6 | 不变量：任意**新**合法连线后，生成节点模型列表长度 ≥ 1 且当前模型兼容；不兼容时有自动切换证据 | P0 |
| D7 | 超**声明**上限的素材不能连到对应 slot；用例不得写死「所有模型 100MB」除非该模型契约如此声明 | P0 |
| D8 | 模式 UI：0 有效 operation → 无 UI + 阻止生成；1 → 无 UI；≥2 → 仅有效项；无置灰 | P0 |
| D9 | `acceptsCurrentInputs` 下可逐步连线；`readyToSubmit` 才可提交；缺 min/prompt 有 typed reason | P0 |
| D10 | 旧图零候选：边保留 + `configuration_error` + 阻止生成；新 mutation 仍严格 | P0 |
| D11 | 提交前校验与连线规则同源；故意超 MIME / 数量 / 体积请求被拒且不达厂商 | P0 |
| D12 | Workflow **无**第二套 operation 穷尽枚举；只消费中枢 / catalog 索引 | P0 |
| D13 | 自动化：契约 schema（schemaVersion）+ legacy 迁移/拒收 + profile 未知 op + 兼容矩阵 + 自动切换 + mode UI + 拒连 + 旧图错误态 用例进 CI | P0 |
| D14 | 文档：本 PRD 与 MCC L1、hub、model-list-ownership 交叉链接；历史别名仅作迁移说明；model vs operation aliases 分层写清 | P0 |
| D15 | **本仓**变更说明不含定价 / HITL；本轮交付说明不含 ASR 真实 seam、document 画布 | P0 |
| D16 | 环境与合入纪律满足 §9（R1、单插件 PR、人工合并、UI 证据、45120 仅合并后 verify:live、绝不 Prod） | P0 |

### 附录 A — 兼容性真值表示意（产品验收）

| 上游指纹 | 模型契约摘要 | 列表可见 | 可连（新 mutation） | 自动选中 / 备注 |
|---|---|---|---|---|
| 无媒体 | 仅 `chat`，完整可见 | 是 | 是（无媒体边） | 保持 |
| +1 图 | 仅 `chat` | 否 | 否（若仅此模型则整节点拒收图边） | — |
| +1 图 | `vision_chat` 或 `first_frame` 等 | 是 | 是 | 从不兼容切到兼容 |
| +1 视频，体积 > 该 slot 声明上限 | 任意 | 对该边否 | **拒连** `size_exceeded` | 不因拒连改模型 |
| +1 视频，体积在声明内 | `video_edit` source | 是 | 是 | 按需 |
| +1 音频 | 仅 `speech_to_text` 但 seam 未 live | **否**（execution_unavailable） | 否 | Whisper 不出现 |
| 仅文本 | `text_to_video` | 是 | 是 | 可 |
| 旧图 + 零候选 | — | — | 不删边 | `configuration_error` |
| 已连 0/1 张参考，槽 min=2 | 多参考 operation | 是（若类型兼容） | 可继续连 | accepts true，ready false |

### 附录 B — 模式 UI 真值表

| 已选模型有效 operation 数 | 模式 UI | 生成 |
|---|---|---|
| 0 | 无 UI + 错误 / 阻塞态 | 阻止 |
| 1 | **无**面板模式区、**无** TriggerBar 模式段 | 看 readyToSubmit |
| ≥2 | 仅展示有效 operation；无效不渲染 | 看 readyToSubmit |

---

## 9. 环境、证据与合并纪律

| 项 | 要求 |
|---|---|
| 风险等级 | **R1**（契约 + 画布行为，影响生成主路径） |
| PR 策略 | **单插件 PR**（按改动落点拆分时仍遵守一插件一 PR；跨包主题用关联 PR，不混装无关垂直） |
| 合并权限 | **人工合并**（老板 / 维护者）；不走未授权 auto-merge |
| UI 合入前 | **L2** 证据：相关表面在约定预览环境（如 **44200** 或任务指定预览）用 **ego-browser** 与/或 **GIF** 留证；缺浏览器证据视为失败 |
| 合并后验证 | 相关 PR **人工合并后**，在公共 **45120（Dev）** 执行 `pnpm verify:live`（及主题相关 verify） |
| 物化 | **未合并代码不得物化公共 45120**；**绝不**对 Prod（`~/.omnimux` / `--prod`）做日常物化 |
| 术语 | 文档与提交说明称**执行中枢**，不称网关 |

---

## 10. 待确认事项（架构师 / 老板）

| # | 问题 | 默认假设（若未回覆则按此落地） | 影响 |
|---|---|---|---|
| Q1 | 自动切换排序：同 family > 目录默认 badge > 稳定字典序，是否认可？ | **认可该三级** | 切换可预期性 |
| Q2 | 多 operation 仍兼容时，P0 是否强制「自动改 operation」？ | **P0 只强制自动改模型**；operation 取「仍兼容的当前 operation，否则该模型默认 / 优先级第一」；智能推荐放 P1 | 范围控制 |
| Q3 | `configuration_error` 是否需要用户可一键「移除冲突边」的修复动作，还是仅展示原因由用户手改？ | **P0 仅展示原因 + 阻止生成**；一键修复属 P1 | 旧图 UX |
| Q4 | 平台是否需要「政策硬顶」（超过即全平台拒绝）与「模型声明上限」分层？ | **P0 只认 slot 声明上限 + 来源**；若要平台硬顶由架构师单独立项，不得用 100MB 默填 | 录入与连线 |
| Q5 | catalog 对 Workflow 的只读 API 形态（Host HTTP / `modelCatalog` 扩展 / 专用 compatibility 缝）选哪条？ | **由架构师定**；产品只要求单一 SSOT、无第二枚举 | 实现边界 |
| Q6 | 旧 GenerationMode 别名迁移窗口与双表拆除时间盒？ | 架构师给时间盒；产品验收以标准 operation 为准 | 迁移债务 |

---

## 11. 给架构师的输入摘要（产品边界，不规定类名）

### 11.1 必须守住的不变量

1. **录入即契约** + **可见性三元组**（完整 contract ∧ research verified ∧ execution live/profile）。
2. **Model capability canonical 根 = `schemaVersion: "1.1"`**；No Spec No Model；仅 legacy 根 `version` 可输入迁移并剥离；both/conflict/missing/wrong 拒绝 + typed reason；**registry/profile 文档自身 `version` 不在此约束内**。
3. **operation 原子任务**；MCC 17 为首批标准目录；**Workflow 禁止第二套穷尽枚举**；**profile.operations[] ⊆ registry**。
4. **Aliases 两层**：model aliases = runtime/wire model ID 归一；operation aliases = 仅 operation legacy 附属；不可混用。
5. **显式 `output.type`**；`speech_to_text` = audio → text。
6. **体积 / 时长按 slot 声明 + 来源**；100MB 不是全局硬顶；无可信边界 → draft/unavailable。
7. **能连上** = 模拟后 ≥1 listed 兼容模型，且 edge / model / operation 原子适配。
8. **Hide, Don't Grey**；0/1/≥2 mode UI 规则；拒绝 **typed reason**。
9. **acceptsCurrentInputs ≠ readyToSubmit**。
10. **旧图零候选不删边 → configuration_error**；新 mutation 严格。
11. 本轮不做：ASR 真实 seam、document 画布、定价、HITL、Prod 物化。

### 11.2 现状债务（事实，勿当已完成）

| 点 | 现状（产品侧认知） |
|---|---|
| MCC 1.0 | 已声明 17 operation 与四原则，偏短，需被 runtime 真正消费 |
| YAML | specs 雏形，未全量、未稳定驱动 runtime |
| Runtime | media/text 等双表与 BUILTIN 风险 |
| GenerationMode | 仍可能残留非 MCC 别名 |
| 列表 / 面板 | 存在置灰或双真源风险 |
| 自动切换 / 体积 / 时长 / slot 级连线 | 不完整 |
| ASR | 无完整 speechToText seam 前不得上画布列表 |

### 11.3 建议能力切面（仅边界）

| 切面 | 职责 |
|---|---|
| Catalog SSOT | YAML（根 `schemaVersion: "1.1"`）→ 规范化索引（schemaVersion、modelId / model aliases、operation、slots、output.type、limit 来源、可见性）；legacy version 仅 pre-norm 输入 |
| Upstream Fingerprint | 入边物料 → type/MIME/size/duration/count/role |
| Compatibility Engine | fingerprint × catalog → 兼容模型集、有效 operation 集、accepts/ready、拒连 / 错误原因码 |
| Canvas Binding | 连线闸、列表数据源、自动选模、mode UI 显隐、旧图 configuration_error |
| Submit Guard | 与引擎同源；只认 readyToSubmit |
| Admission CI | No Spec No Model（含合法 schemaVersion）；legacy version 迁移/拒收；profile 未知 op 拒绝；无来源上限拒绝；矩阵测试；禁止第二枚举与双真源 / 根 version canonical 回归 |

### 11.4 推荐落地顺序（产品优先级）

1. 冻结 model capability 根 `schemaVersion: "1.1"` + operation 枚举消费方式与槽位 schema（对齐 MCC；显式 output.type；legacy version 仅输入迁移）
2. 录入门禁 + 上限来源 + 可见性三元组 + YAML 补全（正式 specs 无根 version）
3. Fingerprint + Compatibility 单引擎（含 accepts/ready）
4. 连线闸与列表 Hide；能连上不变量
5. 自动选模 + 有效 operation → mode UI（0/1/≥2）
6. 提交校验 + 旧图 configuration_error
7. 拆除双表 / 置灰 / 旧别名真源；CI 锁回归

---

## 12. 落盘与关联路径

| 项 | 路径 |
|---|---|
| 本 PRD | `docs/specs/2026-09-04-model-io-contract-compatibility-prd.md` |
| Specs 索引 | `docs/specs/README.md` |
| L1 MCC | `docs/contracts/model-capabilities-matrix.md` |
| 执行中枢 I/O | `docs/contracts/hub.md` |
| 模型列表所有权 | `docs/contracts/model-list-ownership.md` |
| 文档治理 | `docs/contracts/docs-governance-standard.md` |
| YAML 真源目录（实现侧，非本 PRD 修改） | `plugins/omnimux/src/catalog/specs/*-models.yaml` |

---

**文档结束（许清楚 · 软件产品经理 · 2026-09-04 · status: accepted）**
