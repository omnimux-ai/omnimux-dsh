# P0：画布渠道菜单改读中枢目录，删除本地模型/线路/价格镜像

- Issue：#3762（父任务 #3719 的收尾步）
- 前置：P1a（#3719 / PR #3723）网关快照运行时可用；P1b（#3734 / PR #3752）中枢目录的成员/线路/价格已由快照推导。
- 用户已拍板（2026-10-25）：先合中枢，画布镜像清理留到本步。

## 这一步要什么

画布节点的三级级联菜单（品牌 → 型号 → 渠道）从此**只读中枢目录**：线路有哪些、每条线叫什么、大概多少积分，全部来自
`/omnimux/model-catalog` 投影到 `/omnimux-workflow/api/capabilities` 的 `row.channelGroups`。画布不再持有任何线路集合、
价格数字或计费倍率；本地只留「展示覆盖」（短名、BYOK 展示表、价格/计费文案格式化）与「运行期概念」（用户自备渠道）。

## 用户旅程与期望反馈

- 用户打开画布节点，点开模型菜单：看到的每条线路与价格与中枢目录逐项一致（`seedance-2-5` 显示 4 条线路；`gpt-image-2.5`
  与 `gemini-3.8-flash` 的表达式计费线路显示「网关按计费表达式计价，无法逐项比对」而不是旧手抄数字）。
- 网关下架的型号（`seedance-2-0-fast` / `-mini` / `seedream-5-0-pro`）不再出现在菜单里，也不再显示任何价格。
- 用户选了一条线路后，卡槽数量、可用操作列表、参数控件仍按该线路的 `constraints` 收窄（与改动前同一语义，只是约束来自目录）。
- 断网/目录不可用时：菜单给空态（「该模型尚未配置渠道分组…」），不发明线路与价格。

## 方案

1. **类型层补齐**：`shared/api.ts` 声明 `CatalogChannelGroupDto` / `CatalogChannelGroupPricingDto`，并挂到 `CatalogModelDto`
   与 `CapabilityModelItem`（字段此前已在运行时透传，只是没有类型）。
2. **接缝透传**：`workflow/seam/canvasCatalog.ts` 的 `rows()` 把 `channelGroups` 按已知字段透传（此前被剥掉），
   `shared/validation/operationUi.ts` 的 `FilteredModelOption` 带上 `channelGroups`，于是 `filteredModels.options`
   （即菜单的 `options`）每行都带目录线路。
3. **菜单读行**：`ModelCascadeMenu` 的渠道列、默认线路、选中态、量尺全部改为读 `options[].channelGroups`，
   删除对本地 `getModelChannelGroups` 的调用。
4. **镜像降级**：`ConfigPanel/channelGroups.ts` 删除 `MODEL_CHANNEL_GROUPS` 整表（含全部价格数字与线路集合）与
   `getModelChannelGroups`；保留 label/badge 无关的纯格式化、短名表、`BYOK_PROVIDER_DISPLAY_MAP`、BYOK 守卫与合并逻辑。
   新增 `directoryChannelGroups(catalog, modelId)` 把目录行归一化为 `ChannelGroupItem`（补 `category`/`sourceType`/`isAvailable`）。
5. **约束 resolver 改目录驱动**：`resolveLineConstraints(modelId, routing, directoryGroups, runtimeSettings)` 从目录行取
   `constraints`；`lineConstraints.ts` 的全局 resolver 增传 catalog（`narrowCatalogByRouting` 本来就拿着 catalog），
   于是 `canvasInputMutationGateway` / `canvasSlotRecompute` / `resourcePickerPolicy` 的行为不变、数据换源。
6. **门禁改真源**：渠道镜像段改为「目录投影 vs 画布消费」；定价门禁退役硬编码倍率与本地↔本地比对，改为「投影价 = 快照口径」；
   命名门禁改为对目录投影校验显示名（画布与投影逐字一致）。
7. **契约文档**：`channel-group-pricing.md` / `channel-group-naming.md` 删掉「两端手抄保持一致」，引用
   `omnimux-contracts-architecture.md` §契约单一真源。

## 验收

- 菜单渲染出的线路 id / label / badge / 价格逐项等于同一份目录 DTO 的 `channelGroups`（用真实目录夹具在菜单的
  数据入口上断言，而不是只看源码）。
- 已下架型号不在菜单候选里；其历史工程节点不会因此复活线路。
- `rg 'pointsEstimate"\s*:\s*-?[0-9]' plugins/omnimux-workflow/src/canvas/.../channelGroups.ts` 无命中（画布无本地价格数字清单）。
- 线路约束收窄行为不回归：`gpt-image-2.5` 标准版仍固定 1K / 关闭 quality / 张数 1；`seedance-2-5` 480p/720p 仍固定分辨率；
  BYOK 视频兜底（单图 + 16:9/9:16/1:1 + 5/10 秒）不变。
- 门禁与测试：`pnpm --filter omnimux-workflow test`、`pnpm --filter omnimux test`、`pnpm check:boundaries`、
  `pnpm verify:model-contracts`、`pnpm verify:product-baseline`、`pnpm verify:group-naming`、`pnpm verify:group-pricing`、
  `pnpm verify:cross-plugin-models`、`pnpm test:gates` 全绿。
- 真实浏览器证据（隔离工作树、应用级 runner）：画布节点菜单实际渲染出目录线路与价格，留存 PNG + 结构化断言。

## 假设

- 中枢目录 DTO 的 `channelGroups`（`projectChannelGroups`）在客户端是**完整且可信**的线路真源：线路集合来自快照
  `enable_groups`、价格来自 `group_ratio` + 每模型计费、约束/SLA/展示名来自中枢的展示覆盖表。P1b 已把这条链路合入并
  有 `gateway-truth-p1b.test.js` 与离线对账证据，本步只是让画布消费它。
- 该字段在运行期**已经**随 `/api/capabilities` 到达客户端（接缝只剥了桶行、`models[]` 是整行透传），因此本步不需要改
  中枢或路由，只需补类型 + 透传 + 换消费方；浏览器证据会验证这一点，若字段没到客户端则整条链路证伪。
- 画布对线路的依赖只有三件事：展示（label/badge/价格文案）、可选集合（enabled）、约束（constraints）。BYOK 渠道是
  用户运行期自备概念，不属于网关目录，因此 BYOK 的展示与守卫继续留在画布侧是正确分层，不是残留镜像。
- 目录里由网关直接发布、中枢展示覆盖表未命名的线路（如 `seedance-2-5-480p` / `-720p` / `nanobanana-economy`），
  其 label 是网关自己的分组名；画布照实显示即「等于目录」，产品要改名必须在中枢展示覆盖表加条目，而不是在画布再抄一份。

## 证伪方式

- 若菜单渲染出的线路数量/名称/价格与同一份目录 DTO 的 `channelGroups` 有任何一项不等，说明画布仍有本地真源参与决策。
- 若在画布源码里 `rg` 到 `pointsEstimate: <数字>` 或任何线路集合表（`MODEL_CHANNEL_GROUPS`），说明镜像没删干净。
- 若断网/目录为空时菜单仍显示线路或价格，说明存在本地兜底表。
- 若 `resolveLineConstraints` 在「目录行有 constraints」时返回空、或在目录行无 constraints 时仍返回旧约束，
  说明 resolver 没真正改由目录驱动（对应单测：把 fixture 的 `channelGroups` 挂到 `catalog.models[].channelGroups` 上，
  约束必须跟着变；从目录行移除后必须回到空）。
- 若真实浏览器里菜单仍显示 P1b 证据中列出的旧手抄数字（`seedance-2-0` standard=4.9、`gpt-image-2.5` standard=0.13/0.01、
  `gemini-3.8-flash` standard=100），或 `seedance-2-5` 只有 2 条线路，则本步在运行期没有生效。
- 若改动后 `pnpm verify:group-pricing` 仍在比对两份本地表，说明门禁没换真源。

## 旧标准变更

- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `retrieves channel groups for supported models`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `offers no channels for a model the hub has no pool for`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `mirrors the hub routing table exactly (model keys, ids and every routing field)`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `never invents an SLA for groups the gateway does not publish one for`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `never repeats the discount inside a feature badge`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `resolves the full spec of the lines the node routes to`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `drops every constraint of the delisted cheap line`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `drops every former H3 line contract now that the model is registered-only`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `uses DEFAULT_BYOK_CONSTRAINTS as default constraints for byok channels`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `injects standard aspect ratio and duration constraints for video models in fallback line constraints`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `never relies on window.__OMNIMUX_RUNTIME_SETTINGS__ and returns standard fallback when runtimeSettings is omitted`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `safely rejects invalid settings via isRuntimeByokChannelSettings guard and supports constraints injection`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `deeply validates LineConstraints shape preventing malformed objects from escaping`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `correctly reads routing.channelGroupId to resolve line constraints`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `fails closed and returns empty constraints when routing mixes official and byok channels`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs` :: `deduplicates conflicting BYOK IDs with channelGroupId as authoritative source`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `returns isFallback: false for valid official routing`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `returns isFallback: false when byok channel is verified in runtimeSettings`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `returns isFallback: true when sourceType is byok but targetGroupId is missing`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `returns isFallback: true with exact copy when byok channel is missing/unverified`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `returns recommendedOfficialGroupId: null when no official channel exists for model`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `rejects untrusted label with invalid/XSS characters and safely falls back to provider derived label`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `preserves valid labels with allowed punctuation like Ben & Jerry's`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `guards against non-byok candidates extraction when sourceType is byok`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `returns official groups with category official when no runtimeSettings provided`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `dynamically appends byok channel when runtime key is verified`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `supports custom provider with 内部专线 chip label`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `supports multiple byokProviders in settings and deduplicates`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `applies maxReferenceImages = 1 constraint for byok-fal routing`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `does not apply constraints when byok channel is not declared in runtimeSettings`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.test.mjs` :: `safely handles prototype pollution or prototype property names like toString or constructor`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/comfyui-ops-filter.test.mjs` :: `TC-OPS-01: operations 约束把模型操作收窄到线路允许项`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/comfyui-ops-filter.test.mjs` :: `TC-OPS-02: resolution.supported=false 清空契约分辨率集合`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/comfyui-ops-filter.test.mjs` :: `TC-OPS-04: 两处渠道组表镜像约束一致（drift 自检）`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/videoParams/videoParameterSelection.test.mjs` :: `operation adapts to line constraints when preferred operation is not supported by target channel group`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/videoParams/videoParameterSelection.test.mjs` :: `a line narrows the operation list and keeps hidden parameters from resurfacing`
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/modelCascadeMenu.test.mjs` :: `emission and channel lists validate model membership`
- `plugins/omnimux-workflow/src/shared/validation/gpt-image-consumers-3071.test.mjs` :: `canvas default/selected standard hide unsupported quality without mutating saved parameters`
- `plugins/omnimux-workflow/tests/e2e/channel-group-naming.e2e.test.mjs` :: `e2e: 全部渠道分组的 label 与 badge 命中命名规范（白名单 + 禁用词）`
- `plugins/omnimux-workflow/tests/e2e/channel-group-naming.e2e.test.mjs` :: `e2e: 画布镜像的分组文案与中枢逐字一致`
- `plugins/omnimux-workflow/tests/e2e/channel-group-naming.e2e.test.mjs` :: `e2e: MiniMax H3 六档使用统一价值语义命名`
- `plugins/omnimux-workflow/tests/e2e/channel-group-naming.e2e.test.mjs` :: `e2e: 面向用户的分组文案不再出现供应商名与采购层黑话`
- `scripts/verify-channel-group-pricing.test.mjs` :: `passes on the live catalog and canvas mirror`
- `scripts/verify-channel-group-pricing.test.mjs` :: `rejects an invented text model points estimate that drifts from gateway ratio`
- `scripts/verify-channel-group-pricing.test.mjs` :: `rejects a pool estimate that drifts from 2.9 discount rate`
- `scripts/verify-channel-group-pricing.test.mjs` :: `detects mirror points mismatch between hub and canvas`
- `scripts/verify-channel-group-naming.test.mjs` :: `passes on the live catalog and canvas mirror`
- `scripts/verify-channel-group-naming.test.mjs` :: `covers every enabled group of the catalog`
- `scripts/verify-channel-group-naming.test.mjs` :: `detects a mirror drift against the hub`
- `scripts/verify-pricing-points-integrity.test.mjs` :: `mirrors pricing configurations exactly between hub and canvas`
- `scripts/verify-pricing-points-integrity.test.mjs` :: `enforces non-token models must never exceed 100 points (anti-hallucination barrier)`
- `scripts/verify-pricing-points-integrity.test.mjs` :: `verifies every served line price is derived from the gateway snapshot`
- `scripts/verify-pricing-points-integrity.test.mjs` :: `isolates sortWeight from user-facing pointsEstimate`
- `scripts/test-env-bootstrap.test.mjs` :: `default ui isolates environment, fixed config, login capability and cleanup`

### 变更理由（逐类）

- **画布镜像表被删**：`MODEL_CHANNEL_GROUPS` 与 `getModelChannelGroups` 不复存在，凡是「拿画布表与中枢表逐字比对」或
  「无参调用 `getModelChannelGroups(modelId)`」的断言都失去对象；新期望改为把目录行喂给画布侧函数后断言结果等于目录行。
  对应改名：`retrieves channel groups for supported models` → `resolves exactly the lines the hub directory publishes for a model`；
  `offers no channels for a model the hub has no pool for` → `offers no channels for a model the gateway does not sell`；
  `mirrors the hub routing table exactly (model keys, ids and every routing field)` → `reads every line field from the directory row without re-declaring it`；
  `e2e: 画布镜像的分组文案与中枢逐字一致` → `e2e: 画布展示的分组文案与目录投影逐字一致`；
  `e2e: MiniMax H3 六档使用统一价值语义命名` → `e2e: 已下架型号不再持有任何显示名（含 MiniMax H3 六档）`；
  `TC-OPS-04: 两处渠道组表镜像约束一致（drift 自检）` → `TC-OPS-04: 画布线路约束等于中枢目录投影，且画布不再持有本地线路表`。
- **函数签名改目录驱动**：`resolveModelChannelGroups(modelId, directoryGroups, runtimeSettings)` 与
  `resolveLineConstraints(modelId, routing, directoryGroups, runtimeSettings)` 需要显式目录行；旧断言改为传入目录夹具
  （`channelGroups.test.mjs`、`channelContractReconciler.test.mjs`、`comfyui-ops-filter.test.mjs`、
  `videoParameterSelection.test.mjs`、`gpt-image-consumers-3071.test.mjs`）。
- **约束来源改目录行**：`videoParameterSelection.test.mjs` 的两条线路收窄用例不再往画布表里塞合成模型，
  改为把线路挂在 `catalog.models[].channelGroups` 上——这正是运行期中枢目录到达画布的路径；
  `gpt-image-consumers-3071.test.mjs` 的 `gpt-image-2.5` 标准版约束同样改为目录行提供（断言值不变）。
- **门禁换真源**：本地↔本地比对退役，改为「目录投影 vs 画布消费」与「投影价 = 快照口径」；旧断言所锁定的
  `checkTextModelPricing` / `checkMirrorPricing` / `checkMirror` 已删除，改为 `checkProjectionPricing` /
  `checkCanvasPricingSource` / `checkProjectedCatalog` / `checkCanvasNames`。
- **宿主欢迎声明版本升级**：宿主 `WELCOME_NOTICE_VERSION` 已升至 `2026-09-28.1`（app.asar 实测常量），
  原断言 `welcomeNoticeVersion === '2026-08-13.1'` 钉的是旧版本号——继续钉旧值会让首启「预览版说明」弹窗
  在测试环境必现并遮挡全部后续断言。新期望为 `2026-09-28.1`，证据为宿主 asar 内常量与 verify:app 的
  `runtime-modal-bypassed`/截图无弹窗。

### 既有失败（与主检对照，未在本任务修）

以下用例在**本工作树基线提交 a2a3c5286（P1b 之后）**上就已是红的，与本任务改动无关；已用 `git stash` 对照复现同一失败：

- `plugins/omnimux/src/agents/local.test.js` :: `marks only the binaries that answer --version as installed`、
  `probeAgentModels returns dynamic models from local cache/config`（依赖本机 codex CLI 的本地缓存/配置，环境相关）。
- `scripts/public-plugin-apply.test.mjs` :: `unregistered task paths and external siblings cannot inherit shared repository authority`
  （工作树登记/授权环境相关）。
- `plugins/omnimux-workflow/tests/e2e/gpt-image-2-5-cascade-three-groups.e2e.test.mjs`（P1b 已把 gpt-image-2.5 的线路换成
  标准/经济/Nano Banana 经济三条，旧 #3071 的 pro 线路断言失效；该文件不在 `pnpm --filter omnimux-workflow test` 的 glob 内）。
- `plugins/omnimux-workflow/tests/e2e/comfyui-u06-ops-filter.e2e.test.mjs` :: `渠道约束只放行全能参考，目录收窄后仅剩 1 个生成方式`、
  `清晰度控件数据消失且不再产生自适应自愈提示`（H3/ComfyUI 专线在 #3516 已下架，夹具前提失效；同样不在包测试 glob 内）。

### 支撑包 0.28.0 升级带来的安装器测试口径变更

`scripts/task-runtime-install.test.mjs` 有三条用例锁定「恰好一条 peerExemptions 声明生效」的旧口径。
0.28.0 的 peer 已放宽到 `^0.2.1-rc.1`，宿主 0.2.1-rc.3 直接满足，豁免不再需要；机制本身仍保留，
所以机制类用例改用一份合成声明做夹具（覆盖强度不降：stale / expired / 畸形 / 越权 / 不覆盖
`compatibility.json` / 不碰包载荷，逐条仍在验）。

- `scripts/task-runtime-install.test.mjs` :: `the declared exemption covers the shipped support package on the running host`
  - 原断言：身份文件里恰好一条豁免声明，且该声明在运行宿主上被授予。
  - 理由：0.28.0 的 peer 已由宿主满足，身份文件不再携带 `peerExemptions`；「有声明」不再是事实。
  - 新期望：改名为 `the shipped support package needs no peer exemption on the running host`，
    断言声明列表为空、`unmetHostRequirements` 为空、决策为 `not-needed`。
- `scripts/task-runtime-install.test.mjs` :: `a declaration for another host generation or an expired review refuses instead of granting`
  - 原断言：拿身份文件里真实那条声明的 `hostSpec` 驱动 stale / expired 两条拒绝路径。
  - 理由：真实声明已不存在，测试无法再从身份文件取夹具；但拒绝路径本身必须继续被验证。
  - 新期望：改用合成声明夹具，断言 `TEST_ENV_INSTALL_SUPPORT_EXEMPTION_STALE` 仍在
    「声明世代与运行世代不符」和「审核过期」两种情况下抛出，且不留下半生效的 `compatibility.json`。
- `scripts/task-runtime-install.test.mjs` :: `an existing compatibility file is never overwritten by the installer`
  - 原断言：用真实声明的 `hostSpec` 触发写入路径，验证已有文件不被覆盖。
  - 理由：同上，夹具来源从身份文件换成合成声明；「不覆盖已有文件」这一保证不变。
  - 新期望：改用合成声明夹具，仍断言安装器不覆盖已有 `compatibility.json`。

## 不做什么

- 不改 `plugins/omnimux/src/catalog/cloud/` 下 P1a/P1b 的语义（快照拉取、成员资格、价格推导）。
- 不改中枢展示覆盖表的展示名（网关直接发布的线路名由网关负责；产品改名是另一件事，见「假设」第 4 条）。
- 不删 `plugins/omnimux-viewer/src/media-viewer/MediaViewerComposerData.js`：它是离线/失败兜底，产品基线要求保留。
- 不动 `generationPolicy.ts` 的 `allowedModelIds`（产品策展），只在门禁里保持对齐。
