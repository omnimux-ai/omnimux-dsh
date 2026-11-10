# Spec: 网关公开模型为画布唯一准入来源

- 任务：`omnimux-gateway-public-model-authority`
- 日期：2026-11-10
- 状态：active

## 目标

让画布与模型选择器以网关当前公开的模型集合为唯一模型可见性来源，移除本地画布的模型准入白名单、隐藏列表和 `canvasExcluded` 过滤；执行能力（本地 adapter）只作为“可执行/不可执行”状态，不再决定模型是否出现。用户自定义 BYOK provider 的模型作为额外行合并到同一目录，并按 provider 路由。

## 用户操作旅程与期望反馈

1. 打开视频节点模型列表：可见 `minimax-h3-video`、`seedance-2-0`、`seedance-2-5`；本地 adapter 不可用的网关模型（如 `wan-3.0`）也可见，但标记“不可执行”且不能提交。
2. 设置中即使存在旧的 `canvasHiddenModels` 隐藏项，也不再影响画布模型列表。
3. 配置 BYOK provider（模型 ID、能力、协议/参数）后，该模型出现在对应能力的选择器；选中后按 provider 路由；未验证或缺少凭据时显示状态并在提交前给出明确错误。
4. 已保存旧节点的 model 值不被改写；模型不可用时显示配置错误，不自动切换或丢失内容。
5. 输入槽兼容过滤保留：当前节点已有图片/视频/音频输入时，只展示能接收这些输入的模型；这是能力匹配，不是模型准入。

## 技术范围

- Hub：`plugins/omnimux/src/catalog/list.js` 新增 gateway public rows 与 custom rows 合并；`project.js`/DTO 增加 `source`、`executionStatus`、`providerId`；`settings/schema.js` + `byok/http.js` 支持 `byokProviders[].modelProfiles`。
- Workflow：`generationPolicy.ts` 的 `projectCanvasCatalog` 不再按 `canvasHiddenModels`/listed operation 裁剪；`canvasCatalog.ts` 不再传递 hidden；`canvasInputMutationGateway.ts`/`canvasSlotRecompute.ts` 去掉 `allowedModelIds` 拒绝；`operationUi.ts` 保留输入兼容并输出不可执行状态；`ModelCascadeMenu.tsx`/`ConfigPanel/index.tsx` 展示状态。
- Manifest/脚本：`auto-serving-manifest.json` 的 `minimax-h3-video` 移除 `canvasExcluded`；`scripts/verify-auto-serving.mjs` 不再以 `canvasExcluded` 作为画布通过条件。
- 文档：`docs/contracts/model-list-ownership.md`、`docs/contracts/hub.md` 更新可见性与执行能力口径。

## 假设

1. “网关公开”指快照中 `enableGroups` 非空；当前网关公开模型均有 v2 contract。没有 contract 的模型只进入 `gateway.missingContract` 诊断，不伪造 operation。
2. 输入槽/参数兼容过滤必须保留；用户要求移除的是本地模型准入/白名单，不是让无法接素材的模型进入选择器。
3. 自定义模型第一版覆盖现有 `byokProviders`、`runtimeKeyModel`、媒体 runtime provider 和 `scenarioBindings`；本地 CLI/ComfyUI 作为后续独立接入，不在本次目录 PR 中。
4. `canvasHiddenModels` 旧字段保留解析但不再生效，不删除用户数据。
5. 无真实模型 API 探测；自定义 provider 只通过用户本地配置，测试使用离线 fixture。

## 证伪方式

- 构造含 `minimax-h3-video`、`wan-3.0`、`seedance-2-5` 的网关快照/契约索引，调用 `buildModelCatalog`；若 H3 或 `wan-3.0` 被本地列表过滤、或 `canvasHiddenModels` 仍改变画布结果，则失败。
- 以 `canvasHiddenModels: { video: ['minimax-h3-video'] }` 调用 `projectCanvasCatalog`；若 H3 消失，则失败。
- 配置 BYOK `modelProfiles` 后调用 `buildModelCatalog`/`projectCanvasCatalog`；若模型未以 `source:'custom'` 出现，或无法按 provider 路由，则失败。
- 对不可执行模型执行 `guardSubmit`；若仍发起 provider 请求或返回成功，则失败；若无稳定错误，则失败。
- 视频节点选择 H3 后生成流程仍走 `tasks/autodl`；若被改写为 Seedance/普通视频路由，则失败。

## 验收标准

- `/api/capabilities` 的视频列表包含所有网关公开视频模型；每行 `source`/`executionStatus` 正确。
- `projectCanvasCatalog` 不再删除 `canvasHiddenModels` 指定行；`generationPolicy.allowedModelIds` 不再作为拒绝条件。
- BYOK `modelProfiles` 通过 schema 校验、保存、读取后可作为 `source:'custom'` 模型出现在选择器。
- `wan-3.0` 等无 adapter 模型可见但 `executable:false`，提交前被拦截。
- 既有输入兼容、默认模型、节点保存/恢复保持通过；不出现密钥进入 catalog。
- 质量门禁、单元测试、工作树真实浏览器证据均通过。

## 边界

- 不改官方 DSH 源码；不复制 BeefTV 代码（其许可为 Source Available，不是 MIT），只借鉴架构。
- 不改网关侧 snapshot/契约；不调用真实模型 API；不删除用户已有 `canvasHiddenModels` 数据。
- 不在本次实现本地 CLI/ComfyUI 的模型目录接入。

## 旧标准变更

- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `curation admits every listed catalog row minus the hidden set; policy seeds only supply fallbacks`
  - 原断言：按 hidden 集相减，未 listed 的目录行被裁掉。
  - 必须改的理由：画布准入/过滤移除，目录行按 catalog 可见性保留，hidden 设置不再生效。
  - 新期望证据：hidden 后列表保持全部行；未 listed 行仍可见但执行状态另行处理。
- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `canvasHiddenModels subtracts per-kind rows from the effective policy and shifts the fingerprint`
  - 原断言：hidden 改变 effective policy 和 fingerprint。
  - 必须改的理由：old hidden setting 只保留解析兼容，不再参与画布投影。
  - 新期望证据：hidden 不改变列表、effective policy 或 fingerprint。
本任务会改变“画布只显示本地 listed 且不在 hidden 集合的模型”的旧测试标准；具体用例在实现时按实际改动逐条声明，至少包括：

- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `curation admits every listed catalog row minus the hidden set; policy seeds only supply fallbacks`
  - 原断言：隐藏集相减、未 listed 行裁掉。
  - 新期望：不再相减隐藏集；未适配网关行保留为不可执行状态。
- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `canvasHiddenModels subtracts per-kind rows from the effective policy and shifts the fingerprint`
  - 原断言：隐藏模型从 effective policy 消失。
  - 新期望：隐藏项不再影响可见集，fingerprint 不因旧隐藏项变化。
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: 既有“只列 gateway ∩ listed contract 行”相关用例
  - 原断言：只出现已 listed 行。
  - 新期望：网关公开行全部可见，执行状态区分 ready/unsupported。
- `plugins/omnimux/src/catalog/list.test.js` / `project.test.js` 中“只列 listed 模型”相关断言：改为“网关公开 + custom 完整集合，状态字段区分可执行性”。

## 旧标准变更

- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `curation admits every listed catalog row minus the hidden set; policy seeds only supply fallbacks`
  - 原断言：按 hidden 集相减，未 listed 的目录行被裁掉。
  - 必须改的理由：画布准入/过滤移除，目录行按 catalog 可见性保留，hidden 设置不再生效。
  - 新期望证据：hidden 后列表保持全部行；未 listed 行仍可见但执行状态另行处理。
- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `canvasHiddenModels subtracts per-kind rows from the effective policy and shifts the fingerprint`
  - 原断言：hidden 改变 effective policy 和 fingerprint。
  - 必须改的理由：old hidden setting 只保留解析兼容，不再参与画布投影。
  - 新期望证据：hidden 不改变列表、effective policy 或 fingerprint。
- `plugins/omnimux-workflow/src/canvas/editor/utils/resourcePickerPolicy.test.mjs` :: `R5 current-operation verdict disables known JPEG and excluded model, but allows incomplete/pending loading`
  - 原断言：设置 `generationPolicy.allowedModelIds=[]` 后资源不可选。
  - 必须改的理由：画布准入/过滤已移除，资源选择只由输入槽和素材兼容决定。
  - 新期望证据：同一输入下资源仍可选；模型执行状态由提交守卫处理。
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `host catalog bridge preserves authoritative default operations and nested contract data`
  - 原断言：投影后的 `models[].operations` 只保留 listed 操作。
  - 必须改的理由：目录行保留完整操作，展示/执行状态由 row status 表达。
  - 新期望证据：`model.operations` 与 Hub 原始 operations 完全一致。
- `plugins/omnimux-workflow/src/shared/generationPolicy.hub.test.mjs` :: `defaults outside enabled buckets or listed output contracts cannot enter the canvas (#3312)`
  - 原断言：draft/wrong-output 行从可见 bucket 移除并强制回退。
  - 必须改的理由：移除本地可见性过滤；只有 disabled/absent 才改变默认回退。
  - 新期望证据：disabled/absent 回退策略种子；draft/wrong-output 保留行可见。
- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `audio policy admits every listed model; the configured default wins over the policy seed`
  - 原断言：hidden 集合可将 suno 从画布移除。
  - 必须改的理由：legacy hidden 设置不再参与画布过滤。
  - 新期望证据：hidden 后 audio 列表保持完整。
- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `capability seam admits only LISTED speech models, and only to the tool that consumes the seam`
  - 原断言：`models[]` 只包含 listed ASR 模型。
  - 必须改的理由：模型目录行完整可见；只有 capability tool 的候选仍按 listed seam 判定。
  - 新期望证据：`view.models` 保留 ASR 行，但 transcription tool 仍只列 listed seam。
- `plugins/omnimux-workflow/src/shared/generationPolicy.test.mjs` :: `saved models that fell out of the visible set degrade via not_listed while keeping configuration and outputs`
  - 原断言：legacy hidden 使旧节点变为 `configuration_error`。
  - 必须改的理由：模型行不再因 hidden 消失；保持 `ok`，执行状态单独处理。
  - 新期望证据：旧节点 model/content 保持不变且 compat status 仍为 `ok`。
- `plugins/omnimux-workflow/src/shared/voiceCloneCanvasPolicy.test.mjs` :: `canvas audio policy admits every listed model; the configured catalog default wins`
  - 原断言：hidden 音频模型从列表消失。
  - 必须改的理由：legacy hidden 不再过滤画布目录。
  - 新期望证据：hidden 后音频列表仍包含全部目录行。
- `plugins/omnimux-workflow/src/workflow/seam-gateway.test.mjs` :: `capabilities：hub 目录按画布可见集投影，隐藏集逐类相减`
  - 原断言：canvasHiddenModels 逐类相减，unlisted 行不可见。
  - 必须改的理由：画布投影改为目录透传，执行状态不决定可见性。
  - 新期望证据：hub 目录行、audio 未 listed 行均保留，hidden 设置无效果。
- `plugins/omnimux-workflow/src/workflow/seam-gateway.test.mjs` :: `capabilities：旧 bucket 目录没有 models/operations 时四类型全部不可用`
  - 原断言：旧 bucket 无 models 时四类型全部为空。
  - 必须改的理由：目录行本身是可见来源；旧 hub 的缺失执行合同应通过状态而非隐藏处理。
  - 新期望证据：旧 bucket 行保留可见，默认值取首行；不伪造执行操作。
- `plugins/omnimux/src/catalog/gateway-truth-p1b.test.js` :: `⑤ gateway-sold models with no local adapter are counted, never listed`
  - 原断言：无本地 adapter 的网关模型不可见且 operations listed 为空。
  - 必须改的理由：网关公开模型必须可见，adapter 只影响 `executionStatus`。
  - 新期望证据：suno-sounds/wan-3.0 可见、`executionStatus:'unsupported'`、保留网关操作用于展示。
- `plugins/omnimux/src/catalog/list.test.js` :: `returns Catalog v1.1: models[] authority + listed-only four lists + defaults`
  - 原断言：模型数 47、video 仅 3、audio 仅 2。
  - 必须改的理由：网关公开新增 wan-3.0/suno-sounds 行，models 数变为 48。
  - 新期望证据：video 包含 wan-3.0，audio 包含 suno-sounds，模型数 48。
- `plugins/omnimux/src/catalog/list.test.js` :: `forbids ASCII hyphen-minus in every catalog model label`
  - 原断言：所有 catalog label 不含 `-`。
  - 必须改的理由：网关公开但无本地 adapter 的行使用 canonical ID 标签。
  - 新期望证据：仅断言 label 非空；gateway adapterUnsupported 行保留 ID。
- `plugins/omnimux/src/catalog/display-label-contract.test.js` :: `TEXT_MODEL_LABELS / media SPECS / modelCatalog labels forbid "-"`
  - 原断言：catalog 所有 label 不含 `-`。
  - 必须改的理由：无 adapter 的网关行使用 ID 标签。
  - 新期望证据：跳过 gateway.adapterUnsupported 行后其余 label 继续通过。
- `plugins/omnimux/src/catalog/voices/options.test.js` :: `catalog DTO and contract expose the same 509 rich options with one canonical default`
  - 原断言：audio 桶只有 indextts-2/suno。
  - 必须改的理由：网关公开的 suno-sounds 行进入 audio 桶。
  - 新期望证据：audio 行包含 suno-sounds，选项数量/默认值不变。
- `plugins/omnimux/src/settings/omitted-model-defaults.test.js` :: `3312: saved defaults pointing at delisted models resolve only to the fixed real published catalog`
  - 原断言：video 仅 minimax-h3-video/seedance-2-0/2-5，audio 仅 indextts-2/suno。
  - 必须改的理由：网关公开的 wan-3.0/suno-sounds 行也被保留。
  - 新期望证据：video 含 wan-3.0，audio 含 suno-sounds；默认仍为 seedance-2-5/suno。
- `scripts/verify-auto-serving.test.mjs` :: `every whitelist model must be registered even when not listed`
  - 原断言：策略白名单缺少 manifest 行时失败。
  - 必须改的理由：manifest/策略不再是画布准入白名单，网关公开快照才是成员来源。
  - 新期望证据：policy 额外 ID 不再要求 manifest 注册。
- `scripts/verify-auto-serving.test.mjs` :: `wrong modality, duplicate products and wire-model drift fail closed`
  - 原断言：错误 kind 触发 `not_allowed`。
  - 必须改的理由：移除 canvasExcluded/白名单检查；非法 kind 应由 manifest schema 拒绝。
  - 新期望证据：非法 kind 触发 `manifest_invalid`。
- `scripts/verify-auto-serving.test.mjs` :: `strict model-contract CLI combines the serving failure and emits it as pure JSON`
  - 原断言：空 models manifest 产生 `auto_serving_missing`。
  - 必须改的理由：empty manifest 是合法空目录；使用非法行验证失败路径。
  - 新期望证据：非法 manifest 产生 `auto_serving_manifest_invalid`。
