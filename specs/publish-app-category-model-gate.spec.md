# 发布应用分类与生成模型门禁（路线 A+C 最小修复）

- 插件: `omnimux-workflow`（发布向导 + AI 应用运行页）
- 风险: R2（分类契约语义收窄 + 运行页渲染门禁；不改 manifest schema，不改 L1 契约）
- 范围: 最小止血。不新增 `text` 分类（路线 B 需先修订 L1 契约与 MVP 边界，本任务不做）

## 背景

`analyzeWorkflowInputs` 的 `inferCategory` 在没有任何 terminal 节点命中 `video`/`image`/`audio` 时**硬兜底返回 `'video'`**（`topologyAnalyzer.ts:640`），发布向导据此写入 `metadata.category = 'video'`；运行页 `AppTab` 又**无条件**渲染「生成模型」选择器并把非 `image` 分类塌陷为 `video` 目录，于是文本/提取类工作流发布后会显示视频模型列表（Seedance 2.0）。同时 `resolveDefaultNodeModelId` 末尾**无条件** `return 'seedance-2.0'`，使任何分类都会落到同一个视频模型。

## 用户操作旅程

1. 用户在画布把工作流打组，点击「发布为 AI 应用」。
2. **场景 A（媒体产物工作流）**：工作流 terminal 节点带 `materialType: 'video'|'image'|'audio'`。向导第 1 步自动选中对应「核心分类」并标注「推荐」，`封面与预览` 预填该类封面。流程与现在一致。
3. **场景 B（文本/表格产物工作流）**：terminal 节点是文本或表格，无媒体类型。向导第 1 步**不再自动选中任何分类**，并显示一行明确提示「当前工作流的产物为文本/表格，暂不支持发布为 AI 应用」；此时「下一步」与最终「发布」被拦截并提示先选择分类（即使发布者手动选了分类，也必须显式确认）。
4. 用户在应用中心打开任一已发布应用，进入运行页。
5. **场景 A'（含生成节点的应用）**：左侧表单顶部仍显示「生成模型」，可切换模型。
6. **场景 B'（不含生成节点的应用，例如「提取视频」）**：左侧表单**不再出现「生成模型」**，直接以第一个真实输入字段开头。提取类/分析类应用不再看到与其能力无关的视频模型列表。

## 变更点

### 1. `plugins/omnimux-workflow/src/canvas/editor/components/publish/topologyAnalyzer.ts`

- `inferCategory()` 去掉 `return 'video'` 硬兜底，未命中时返回 `null`；返回类型改为 `ApplicationCategory | null`。文本 terminal 节点显式归入 `null` 分支（不再默认视频）。
- `WorkflowAnalysisResult.categorySuggestion` 类型改为 `ApplicationCategory | null`（`publishTypes.ts:231`）。

### 2. `plugins/omnimux-workflow/src/canvas/editor/components/publish/PublishWizardModal.tsx`

- `category` state 改为 `ApplicationCategory | null`，初值 `null`；初始化时直接采用 `analysis.categorySuggestion`（可能为 `null`）。
- 分类为 `null` 时不再预填 `DEFAULT_CATEGORY_COVERS` / `DEFAULT_CATEGORY_MEDIA_URLS` / `DEFAULT_CATEGORY_ICONS` / showcase `mediaType`（这些 `Record<ApplicationCategory, string>` 查表必须带 `null` 守卫）。
- 第 1 步新增阻断提示：`analysis.categorySuggestion === null` 时展示「文本/表格产物暂不支持发布」说明。
- 「下一步」（step 1）与 `handlePublish` 都增加 `if (!category)` 守卫，提示并回到第 1 步。
- `executePublish` 内用 `const resolvedCategory: ApplicationCategory = category` 收窄后统一使用，保证 manifest 只在分类确定时落盘。

### 3. `plugins/omnimux-workflow/src/client/projects/appTabWidgets.js`

- 删除 `resolveDefaultNodeModelId()` 末尾**无条件** `return 'seedance-2.0'`，改为 `return null`（函数返回值类型放宽为 `string | null`）。`!manifest` 分支同样改为 `return null`。
- 保留 `isCreatifyOrBuiltin` 条件分支（它是有条件的、针对内置/creatify 应用族的历史兼容，不是无条件兜底）。
- 新增**证据层**纯函数 `hasGenerationModelNode(manifest)`：快照中是否**存在**绑定生成模型的生成节点；只看证据，快照缺失或为空返回 `false`。组合两个既有 SSOT，缺一不可：
  - 节点身份 `resolveNodeKind(data) === 'generate'`（`shared/graph/materialNode.ts:178`，全仓唯一身份真源）——排除导入/提取/槽位节点；但该函数对未标注的 `text-editor` 也返回 `generate`（实测），故必须叠加下一条；
  - 工具能力 `materialTools[data.selectedTool]?.modelCategory`（`shared/specs/nodes/materialNodeSpec.ts`，纯数据、仅 type 导入）——只有真正绑定生成模型的工具才声明该字段；`text-editor` / `link-extract` / `import` 均无；
  - 遗留兜底：预设工作流使用注册表未收录的 legacy tool id（`omnimux_video_submit`），但其节点持久化了 `data.model`，据此识别。
- 新增**策略层**纯函数 `shouldShowModelSelector(manifest)`，把「证据不足」与「证据证明没有生成节点」分开：
  - 快照缺失/为空 → `true`（**证据不足，保持既有行为**）。**已核实**：`plugins/omnimux-apps/catalog/builtin-apps.json` 的 10 个内置应用 manifest **全部没有** `workflowBinding.snapshot.nodes`（只带 `workspaceId`），工作流实体在 `catalog/presets/*.workflow.json`；若按「无快照即隐藏」处理会误伤全部内置视频应用；
  - 快照存在且含生成节点 → `true`；
  - 快照存在且不含生成节点 → `false`（运行页整体不渲染选择器）。

### 4. `plugins/omnimux-workflow/src/client/projects/AppTab.jsx`

- 「生成模型」字段组用 `showModelSelector = shouldShowModelSelector(manifest)` 包裹，快照证明无生成节点时**整体不渲染**。
- `defaultModelName` 去掉硬编码 `'Seedance 2.0'` 兜底，改为 `defaultModelObj?.name || availableModels[0]?.name || ''`。

### 5. 测试

- `src/client/projects/appTabWidgets.test.mjs`：新增 `hasGenerationModelNode` 证据层用例与 `shouldShowModelSelector` 策略层用例（文本编辑器 → false；提取类 import 节点 → false；`video-generation` → true；legacy `omnimux_video_submit` + `data.model` → true；无内嵌快照 → true）。
- `src/canvas/editor/components/publish/publishWizard.test.mjs`：`sampleNodes` 的终端节点 `gen_video` 补上 `materialType: 'video'`，使 T03.1 / T03.4 的分类断言依赖显式媒体类型而不是已被删除的兜底。
- `src/canvas/editor/components/publish/topologyAnalyzer.test.mjs`：新增 `T01.4b`，断言无媒体 terminal → `categorySuggestion === null`，且显式媒体 terminal 仍正常推断。
- **旧标准变更（须独立审查，不由实现者应用）**：两条既有断言直接编码了本次要修掉的缺陷，必须改写，但 `scripts/test-authoring-inspection.mjs:231` 的硬门禁禁止实现者删除/改写既有断言，`docs/contracts/anti-agent-fake-completion-guard.md:146` 要求「旧断言删除、跳过、聚焦或期待变化仍需独审，不能用本地 approved 文件自我批准」。因此补丁已按可审查形式产出：
  - `appTabWidgets.test.mjs`：`resolves seedance-2.0 for default video category or empty/null manifest` → 改为断言 `null`；
  - `tests/apptab-form-widgets.e2e.test.mjs`：纯文本快照「无生成节点时健全推导为 Seedance 2.0」→ 改为断言选择器**不存在**。
  - 补丁文件：`/tmp/frozen-patch/frozen-assertion-patch.diff`（`git apply --check` 退出码 0，已验证可干净应用）。应用命令见交付报告。

## 旧标准变更

本次必须作废两条既有断言——它们**逐字要求缺陷行为**（没有可解析模型时回退到 `seedance-2.0`），而那个回退正是本任务要修的缺陷。按 `docs/contracts/anti-agent-fake-completion-guard.md` §3.1 的通道逐条声明。

- `plugins/omnimux-workflow/src/client/projects/appTabWidgets.test.mjs` :: `resolves seedance-2.0 for default video category or empty/null manifest`
  - 原断言：`resolveDefaultNodeModelId({})`、`(null)`、`({ category: 'video' })` 三者都 `=== 'seedance-2.0'`。
  - 必须改的理由：该回退是无条件写死的视频模型，正是「文本/提取类应用显示视频模型列表」的成因；断言把缺陷钉成了契约。
  - 新期望与证据：改为 `returns null instead of guessing a video model when no model is resolvable`，三处断言 `null` 并新增 `workflowBinding.snapshot.nodes` 为空时也 `null`。证据：`pnpm --filter omnimux-workflow test` 全绿。

- `plugins/omnimux-workflow/tests/apptab-form-widgets.e2e.test.mjs` :: `E2E: 表单首部生成模型默认项显式绑定工程作者模型 (Issue #2642)`
  - 原断言：无生成节点的快照下，`生成模型` 组的触发器文案必须 `=== 'Seedance 2.0'`。
  - 必须改的理由：同一条缺陷的另一面——文本应用根本没有生成节点，此时**不该渲染模型选择器**，断言却要求它渲染并显示视频模型。
  - 新期望与证据：改为断言该字段组不存在（`modelSelectGroup2 === undefined`）。证据：同一条 E2E 在 `pnpm --filter omnimux-workflow test` 中通过。

## 假设

1. **分类语义**：`metadata.category` 是「导航/展示分类」，不是「引擎或模型族」。因此当工作流没有任何媒体产物时，正确表达是「无分类」而不是「猜一个 video」。`ai-app-ui-spec.md:37` 限定二级栏只有视频/图片/音频三类，这与「未选分类时禁止发布」并不冲突——我们只是不再伪造一个分类。
2. **提取/分析类节点不是生成节点**：`planVideoExtractionDownstream.ts:151,186` 与 `planAudioExtractDownstream.ts:194,242,313` 产出的节点显式标记 `nodeKind: 'import'`，因此 `resolveNodeKind` 会判定为 `import`，「提取视频 / 提取音频」应用不会再被当成生成型应用。
3. **能力表是生成模型的唯一权威**：`materialNodeSpec.ts` 中只有 13 个工具声明 `modelCategory`，`text-editor`/`link-extract`/`import` 均无；因此「是否绑定生成模型」可以由该字段精确判定，无需维护第二份白名单。
4. **`resolveNodeKind` 单独不足以做门禁**：它对 `{ selectedTool: 'text-editor' }` 也返回 `'generate'`（实测），所以门禁必须是「身份 + 能力」的组合，否则纯文本工作流仍会显示模型选择器。
5. **`node --test` 能加载 `.ts` 依赖**：Node 25 默认启用类型剥离，`materialNode.ts` 可被 `.js` 测试文件直接 import（已在 worktree 内实测通过）。
6. **既有测试样本依赖被删除的兜底**：`publishWizard.test.mjs` 的 `gen_video` 节点未声明 `materialType`，其 `'video'` 断言此前正是靠硬兜底成立；补上显式 `materialType` 才是符合真实数据（预设生成节点确实带 `materialType: 'video'`）的写法。
7. **内置应用没有内嵌快照**：`plugins/omnimux-apps/catalog/builtin-apps.json` 的 10 个应用 `workflowBinding` 只含 `workspaceId`/`workflowVersion`，不含 `snapshot.nodes`。因此「快照缺失」是常态而非「无生成节点」的证据，门禁必须把两者分开，否则会隐藏全部内置视频应用的模型选择器。
8. **旧标准变更的合法路径**：本任务有两条既有断言直接编码了待修缺陷，但仓库硬门禁禁止实现者改写既有断言，契约要求独立审查。因此实现者只产出可审查补丁，不自行应用；`pnpm --filter omnimux-workflow test` 在补丁应用前保留这 2 条已知失败，其余全绿。

## 证伪方式

1. **分类兜底已移除**：在 worktree 内执行 `node --input-type=module -e "import {analyzeWorkflowInputs} from './plugins/omnimux-workflow/src/canvas/editor/components/publish/topologyAnalyzer.ts'; console.log(analyzeWorkflowInputs([{id:'t',type:'material',data:{materialType:'text'}}],[]).categorySuggestion)"` —— 若输出 `video` 而非 `null`，则变更 1 未生效。
2. **模型兜底已移除**：`node --input-type=module -e "import {resolveDefaultNodeModelId} from './plugins/omnimux-workflow/src/client/projects/appTabWidgets.js'; console.log(resolveDefaultNodeModelId({}))"` —— 若输出 `seedance-2.0` 而非 `null`，则变更 3 未生效。
3. **门禁能区分「证据不足」与「证明没有生成节点」**：`shouldShowModelSelector` 对 `{workflowBinding:{workspaceId:'ws-x'}}`（无快照）必须为 `true`；对 `{snapshot:{nodes:[{data:{nodeKind:'import',selectedTool:'import',materialType:'video'}}]}}` 必须为 `false`；对 `{snapshot:{nodes:[{data:{nodeKind:'generate',selectedTool:'video-generation'}}]}}` 必须为 `true`；对 `{snapshot:{nodes:[{data:{materialType:'text',selectedTool:'text-editor'}}]}}` 必须为 `false`。任一不符即策略层设计被证伪。
4. **运行页不再渲染选择器（真实浏览器，已执行）**：`node scripts/verify-apptab-model-selector-gate-browser.mjs` —— Headless Chrome + CDP 中渲染真实 AppTab，三条断言必须全过：纯文本快照 → 选择器**不存在**；含生成节点快照 → 选择器**可见**（正向对照）；无内嵌快照 → 选择器**保持可见**（防内置应用回归）。任一不过即变更 3/4 未生效。实测 3/3 通过，截图 `docs/evidence/workflow-apptab-model-selector-gate.png`、报告 `docs/evidence/workflow-apptab-model-selector-gate.json`。若纯文本快照下仍出现选择器，则门禁被证伪。
5. **未选分类无法发布**：发布一个纯文本 terminal 工作流，向导第 1 步应显示阻断提示，且「下一步」/「发布」被拦截；若仍能发布并落盘 `category: 'video'`，则变更 2 未生效。
6. **回归与已知红**：`pnpm --filter omnimux-workflow typecheck` 必须退出码 0（已实测 0）。`pnpm --filter omnimux-workflow test` 实测 2875 用例 / 2873 通过 / 2 失败，且这 2 条失败**必须恰好**是补丁覆盖的两条旧标准断言（`resolves seedance-2.0 for default video category or empty/null manifest`、`E2E: 表单首部生成模型默认项显式绑定工程作者模型`）。若出现任何第 3 条失败，则本次改动引入回归，假设被证伪。补丁应用后应达到 2875/2875 全绿。
7. **不再有跨插件模型漂移盲区（本任务不修，仅确认残留）**：`node scripts/verify-cross-plugin-model-alignment.mjs` 仍不覆盖 `AppTab.jsx`/`appTabWidgets.js`；该盲区登记为后续独立任务，不作为本次通过条件。

## 新产品基线

全新用户安装并登录后，从画布打组发布应用的路径不依赖任何本机状态、本地模型服务、开发端口或绝对路径：分类由工作流自身的终端产物类型决定，模型目录来自宿主 `/omnimux/model-catalog`。当工作流没有媒体产物时，向导显示明确的不支持提示而不是伪造一个视频分类；当应用没有生成节点时，运行页不显示模型选择器而不是回落到硬编码的 `Seedance 2.0`。两者都不需要用户具备任何开发机专属条件。

## 文档影响

- `docs/contracts/ai-app-ui-spec.md:52-57` 已规定「影响成本的参数（模型…）固定、不出现」，本次变更使运行页回归该既有约定，**无需修订契约**。
- `docs/contracts/workflow-app-boundary.md:52` 仍限定分类只含 `video/image/audio`；本次不新增分类，与该条相容，**无需修订**。
- 残留项（登记为后续任务，不在本次范围）：① 路线 B 的 `text` 分类表达需先修订上述两份 L1 契约并走 MVP 边界授权；② `AppTab.jsx:65-166` 的 `KNOWN_OFFICIAL_MODELS` 静态表与 `verify-cross-plugin-model-alignment.mjs` 门禁盲区；③ `appTabWidgets.js` 的 `isCreatifyOrBuiltin` 条件兜底。
