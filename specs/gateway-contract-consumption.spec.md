# Spec: 本地插件消费 Gateway Contract v2

- 任务：`omnimux-gateway-contract-consumption`
- 日期：2026-11-09
- 状态：active

## 目标

让 `plugins/omnimux` 与 `plugins/omnimux-workflow` 消费网关已发布的 Gateway Contract v2，在**不新增每个模型本地 YAML** 的前提下，让画布文本节点显示网关在售且本地有适配器的全部文本模型、图片节点显示全部对应图片模型；模型能力、输入槽和参数以网关 Contract v2 为真源，本地只保留 adapter profile、缓存、标签、默认值和场景编排。

## 用户操作旅程与期望反馈

1. 用户打开画布文本节点：模型选择器显示 `gemini-3.8-flash` 与 `gemini-4-argon`（若网关状态 partial，显示部分能力标识），选择后能进入提交校验；不再只显示一个文本模型。
2. 用户打开画布图片节点：模型选择器显示 `gpt-image-2.5` 与 `gemini-3.1-flash-lite-image`；`gpt-image-2.5` 的参考图上限按网关合同为 1 张，`gemini-3.1-flash-lite-image` 按合同为 14 张；参数控件只展示合同声明的参数。
3. 用户刷新/重新打开画布：目录随网关快照变化；已保存的旧 `multi_reference` 节点仍保留且可提交或显示明确的降级原因，不崩溃、不静默改数据。
4. 网关新增同族模型：只需网关 Contract 更新；本地不需要为新模型逐条写 YAML 或前端专用逻辑。

## 技术范围

- 输入：`plugins/omnimux/src/catalog/cloud/bundled/pricing.json`（生产 v2 快照）与运行时 `/api/pricing` 刷新得到的 snapshot。
- 新增：`plugins/omnimux/src/catalog/gateway-contract.js`、`plugins/omnimux/src/catalog/runtime-index.js`。
- 修改：`plugins/omnimux/src/catalog/list.js`、`plugins/omnimux/src/catalog/project.js`、`plugins/omnimux/src/text/catalog.js`、`plugins/omnimux/src/text/execute.js`、`plugins/omnimux/src/text/mount.js`、`plugins/omnimux/src/media/catalog.js`、`plugins/omnimux/src/media/execute.js`、`plugins/omnimux/src/media/execution-plan.js`；必要时更新 `plugins/omnimux-workflow` 的 catalog 类型与参数展示。
- 第一期 overlay 范围：`llm` 与 `image`。`video`/`audio` 的旧本地行为保持不变；没有本地可调用 operation 的 `wan-3.0` / `suno-sounds` 以 `gateway.adapterUnsupported` 暴露，待视频/音频专项再接入。
- 不修改网关仓库；不发起真实模型请求；不改变计费/额度/预扣/结算。

## 数据源优先级

| 数据 | 真源 | 本地行为 |
|---|---|---|
| 在售状态、线路、价格 | gateway snapshot | 缓存与展示，不本地决定 |
| operation、输入槽、参数、状态、unknowns | Gateway Contract v2 | 直接投影；本地 `specs` 不得覆盖 |
| adapter profile、seam、wire 映射 | 本地 `adapter-profiles.json` / `specs` implementation | 仅执行能力 |
| 标签、badge、默认值、场景 curation | 本地设置/配置 | 保留 |
| 无 v2 contract 的旧快照 | 本地 `specs` | 保持旧 fallback |

## 验收标准

- 用生产形状 v2 快照，`buildModelCatalog()` 的 `text` 至少含 `gemini-3.8-flash`、`gemini-4-argon`；`image` 至少含 `gpt-image-2.5`、`gemini-3.1-flash-lite-image`。
- `gateway.missingContract` 对当前 11 个在售模型为空；没有本地 adapter 的 `suno-sounds` 进入 `gateway.adapterUnsupported`，不进入任何 picker。
- `gemini-4-argon` 经 `textComplete` 可校验；`gemini-3.1-flash-lite-image` 经 `imageGenerate` 可校验。
- `gpt-image-2.5` 的 contract 参数与网关 v2 一致（参考图 max=1、`n`/quality 按合同）；旧节点带有旧参数时给出明确降级原因，不删除数据。
- 旧 v1 快照/缺 v2 contract 时回退本地规格，目录不崩溃。
- 不发起真实模型请求；所有测试使用离线 v2 fixture/随包快照。

## 假设

- 生产 `/api/pricing` 的 11 个在售模型已稳定返回 `schemaVersion=2.0`，`gemini-4-argon` 的 `partial`、`suno-sounds` 无本地 audio profile 是真实状态。
- 本地 `adapter-profiles.json` 足以承接文本与图片 family；视频/音频仅对已有 profile 的模型开放，不强行新增 profile。
- 现有 `Catalog v1.1` DTO 保持兼容；只增加可选 gateway 元数据，不破坏 workflow 现有消费。

## 证伪方式

- 若把生产 v2 快照喂给实现后 `text` 仍只有 `gemini-3.8-flash` 或 `image` 仍只有 `gpt-image-2.5`，则本方案未达成目标。
- 若 `gateway.missingContract` 仍包含 `gemini-4-argon`/`gemini-3.1-flash-lite-image`，或这两个模型在 text/image 校验中被 `unknown_model` 拒绝，则适配层未接入。
- 若 `gpt-image-2.5` 仍出现 `reference_images.max=16` 或 UI 仍显示 2K/4K/quality 档，则网关合同没有成为参数真源。
- 若旧 `multi_reference` 节点打开即崩/被静默改写，则兼容失败。

## 命令

- `pnpm --filter omnimux test`
- `pnpm --filter omnimux-workflow test`
- `pnpm verify:model-contracts`
- `pnpm catalog:snapshot:check`
- `pnpm verify:models`
- `pnpm verify:product-baseline`
- 浏览器验收：worktree 画布文本/图片节点，使用离线 v2 fixture，自清理并保留截图/报告。

## 边界

- Always：只读网关公开 snapshot；失败回退并显式记录；不伪造 unknown。
- Ask first：新增 adapter profile 类型、改变计费/价格、生产发布。
- Never：调用真实模型 API 探测能力；把 v2 参数写入本地 YAML 作为第二真源；静默删除旧节点。
