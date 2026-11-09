# Spec: 模型展示名统一为模型 ID

- 任务：`omnimux-model-id-labels`
- 日期：2026-11-09
- 状态：active

## 目标

所有模型消费界面只显示“品牌图标 + canonical model ID”，例如 `gemini-3.1-flash-lite-image`；不再把本地营销短名或渠道分组文本拼进模型名。选中模型后的触发器不显示分组文本，用户打开模型列表即可在渠道列查看分组。Hub 的 `label` 字段保留为内部描述元数据，所有用户可见的模型选择/触发器由前端按 `id` 渲染。

## 用户操作旅程与期望反馈

1. 画布图片节点选中 `gemini-3.1-flash-lite-image` 后，底部触发器只显示 Google 品牌图标和 `gemini-3.1-flash-lite-image`，不显示“标准版（主流高品质专线）”。
2. 打开模型列表：品牌列仍显示品牌图标/名称，型号列只显示模型 ID；渠道列显示分组名称和价格，用户需要时可以查看。
3. 文本、图片、视频、音频所有画布模型选择器、composer 模型选择器和兼容模型下拉都使用同一 canonical ID，不出现同义营销名、短名或分组后缀。
4. 旧节点/旧渠道数据保持不变；仅改变展示，不改变实际 `model` 值、路由、价格或执行。

## 技术范围

- Workflow：`ModelCascadeMenu.tsx` 的 trigger 只用 canonical model ID，不拼 `activeGroup.label`、不渲染分组 badge；型号行标题只用 `item.id`，并移除型号行副标题。
- Workflow：`ConfigPanel/index.tsx` 的 `modelOptions` label/triggerLabel 使用 `row.id`，覆盖 ASR 工具的兼容下拉。
- Hub client：`composer-quick-shortcuts/ModelPicker.jsx` 的动态目录行和离线兜底项使用 raw `id` 作为名称/胶囊名，不再展示营销短名或副标题。
- 不修改 Hub `projectRow`/`projectModelDto` 的 `label` 数据字段；渠道列、价格和路由完全不变。

## 假设

- “模型名称”指 UI 展示名称；执行、计费、路由、工具 enum 仍使用 canonical ID，不因展示改造改变。
- Hub `label` 可作为内部描述元数据继续存在；前端模型选择器不得消费它作为用户可见名称。
- 品牌图标由现有 `ModelBrandIcon` 从 model ID 推导；不需要新增品牌映射。
- 统一名称不影响旧节点保存的 model ID；旧保存值直接显示为自身 ID。

## 证伪方式

- 用 `ModelCascadeMenu` 的 trigger 断言不含 `activeGroup.label`、`·` 拼接或 `wf-model-cascade-capsule__badge`；型号列表标题为 `{item.id}` 且不渲染 `item.subtitle`。
- 用 `ConfigPanel` 断言 `modelOptions` 的 `label`/`triggerLabel` 使用 `row.id`。
- 用 `ModelPicker.jsx` 断言动态目录行 `name = rawId`、`capsuleName = rawId`，离线兜底名称也是 ID。
- 打开画布选 `gemini-3.1-flash-lite-image`，trigger 文本必须精确等于 `gemini-3.1-flash-lite-image`；打开列表能在渠道列看到“标准版（主流高品质专线）”。
- 旧节点 `gpt-image-2.5` 的保存 model 值不变，仍可生成/路由。

## 验收标准

- 画布文本/图片/视频/音频模型选择器、ASR 兼容下拉、composer 模型选择器均按 ID 展示。
- 选中触发器无分组文本；渠道列仍可查看分组。
- Hub `label` 数据字段不被修改，路由/价格/执行不变。
- 既有模型选择/渠道路由测试按新展示名更新并通过；无真实模型请求。

## 边界

- 不动渠道分组数据、不改变 `model` 保存值、不改变价格/路由/执行。
- 品牌名称仍显示在品牌列；渠道分组仍显示在渠道列。

## 旧标准变更

本任务把用户可见的模型选择/触发器展示名从“品牌化短名/本地营销名”统一为 canonical model ID。以下既有 UI 测试断言被替换，执行、路由、渠道数据和 Hub 数据字段均未变。

- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `resolves compact model names for the trigger capsule`
  - 原断言：`resolveShortModelName` 返回 `2.0 Fast`、`Seedance 2.0`、`Opus 4.6` 等短名。
  - 必须改的理由：触发器统一显示 canonical ID，不再使用营销短名。
  - 新期望证据：每个输入返回其 canonical ID，空值仍返回“选择模型”。
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `keeps the capsule label across the midjourney/nano-banana canonical rename (#1751)`
  - 原断言：family 优先返回 `Midjourney` / `NanoBanana` / `Seedream`。
  - 必须改的理由：family 短名展示被 ID 标准取代；alias/canonical 仍归一为 ID。
  - 新期望证据：family 和 alias 输入均返回 canonical model ID。
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/modelCascadeMenu.test.mjs` :: `picker consumes only final filtered options and renders their labels`
  - 原断言：源码必须出现 `item.label || item.id` 和 `item.subtitle`。
  - 必须改的理由：型号行只显示模型 ID，并移除分组副标题。
  - 新期望证据：源码出现 `{item.id}`，不出现 `item.label || item.id` / `item.subtitle`。
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/barTriggerUnify.test.mjs` :: `模型触发器不再携带内联业务样式`
  - 原断言：触发器必须有 `wf-model-cascade-capsule__badge` 类。
  - 必须改的理由：选中后不再显示渠道分组 badge，避免重复显示分组文本。
  - 新期望证据：触发器不含 `wf-model-cascade-capsule__badge`，几何/无内联样式断言保留。
