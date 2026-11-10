# 规格：去掉卡槽下方所有常驻状态文案（Issue #4048）

## 一、目标 (Objective)
画布生成节点输入卡槽下方不再出现任何常驻文本提示（「不兼容 / 不可用 / 等待中 / 未使用 / 无效」等一律不显示）；原因保留在 `SlotHoverPreview` 悬浮预览中。
本任务只做展示层；跨模式残留 `slotBindings` 的数据清理涉及「显示=提交 / autoFill」语义重构，单独跟进，不在本次改动。

## 二、命令 (Commands)
- 定向测试：`node --import ./test-setup.mjs --test src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs src/shared/graph/slotStateCleanup.e2e.test.mjs`
- 包级测试：`pnpm --filter omnimux-workflow test`
- 类型检查：`pnpm --filter omnimux-workflow typecheck`

## 三、项目结构与修改范围 (Project Structure & Scope)
- 表现层：`plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotWells.tsx`（删除 `wf-slot-well__state` 常驻文本节点）
- 样式：`plugins/omnimux-workflow/src/canvas/theme/components.css`（删除对应死样式与 `:has` padding）
- 测试：`slotInteractionRefinement.test.mjs`（渲染断言任何状态均无状态文案）、`slotStateCleanup.e2e.test.mjs`（渲染级 e2e）
- 不改动：`canvasSlotRecompute` 数据逻辑、提交/执行内核、模型契约、`slotBindings` 语义。

## 四、技术方案 (Technical Design)
1. 删除 `SlotWells` 中按 `model.state` 渲染的 `<span className="wf-slot-well__state">`；视觉状态仍由占位符（裂图/加载/文字缩略图）与 `wf-slot-well--conflict` 等样式表达。
2. 删除 `.wf-slot-well__state` 与 `.wf-slot-wells:has(.wf-slot-well__state)` 两条死 CSS。
3. 原因仍在 `SlotHoverPreview` 中按 `state/reasonCode` 展示（invalid/pending/inactive）。

## 五、验收标准 (Success Criteria)
1. `state=invalid / inactive / pending / input_unavailable` 任一状态下，`SlotWells` 渲染 HTML 不含 `wf-slot-well__state`，也不含「不兼容/不可用/等待中/未使用/无效」文本。
2. `SlotHoverPreview` 对 invalid/pending/inactive 仍展示原因。
3. 数据层行为与 base 完全一致（不新增/不修改绑定清理）。
4. 定向 + 包级全量测试、typecheck 全绿。

## 六、边界约束 (Boundaries)
- Always：独立 worktree；测试与类型检查通过后走 PR / Merge Queue。
- Never：不改 `slotBindings` 数据语义、不改提交/执行内核、不删除 hover 原因。

## 七、新用户基线 (Product Baseline)
仅依赖本地画布与本地模型目录，不依赖 dev 机专属服务或凭据；新用户首次进入创作画布即可用。

## 假设
输入卡槽下方的状态文案是纯展示层信息，移除它不影响任何数据绑定、提交参数或执行结果；用户需要原因时可通过悬停预览查看，因此只删除常驻文本不会造成功能或无障碍能力缺失。

## 证伪方式
证伪方式：渲染 `SlotWells` 的 invalid/inactive/pending 记录，断言 HTML 不含 `wf-slot-well__state` 与任何状态词；若仍出现文本则假设被推翻、用例变红。同时跑包级全量测试，若数据/提交相关用例因本改动失败，则“纯展示、不影响数据”的假设被推翻。

## 旧标准变更
- `plugins/omnimux-workflow/src/shared/graph/slotStateCleanup.e2e.test.mjs` :: `#4048 e2e：切到 text_to_image 后，reference_image 残留绑定被清理且展示/提交无记录`
  原断言：数据层裁剪后展示/提交无残留记录。
  必须改：数据层清理涉及显示=提交/autoFill 语义重构，已移出本任务；e2e 改为渲染级断言「任何状态无状态文案」。
  新期望证据：渲染 invalid/inactive/pending 记录的 HTML 不含 `wf-slot-well__state`/状态词。
- `plugins/omnimux-workflow/src/shared/graph/slotStateCleanup.e2e.test.mjs` :: `#4048 e2e：pinned=true 的旧槽位占用仍保留为可停用的无效意图`
  原断言：数据层 pinned 保留。
  必须改：同上，数据层范围移出本任务。
  新期望证据：新 e2e 用例覆盖 invalid 渲染无文案。
- `plugins/omnimux-workflow/src/shared/graph/slotModeSwitchResidual.test.mjs` :: `#4048 阻断1：catalog 不可用（空 layout）不得清空未固定但存活的绑定`
  原断言：数据层裁剪安全边界。
  必须改：数据层清理移出本任务，文件删除。
  新期望证据：不再需要（展示层无数据行为）。
- `plugins/omnimux-workflow/src/shared/graph/slotModeSwitchResidual.test.mjs` :: `#4048 阻断2：已保存 slotConflicts 不得把被清理的占位者回填`
  原断言：数据层 conflict 过滤。
  必须改：同上。
  新期望证据：同上。
- `plugins/omnimux-workflow/src/shared/graph/slotModeSwitchResidual.test.mjs` :: `#4048 阻断3：裁剪后保留空槽键，展示/提交不出现「显示已填、提交为空」`
  原断言：数据层裁剪表示。
  必须改：同上。
  新期望证据：同上。
- `plugins/omnimux-workflow/src/shared/graph/slotModeSwitchResidual.test.mjs` :: `#4048 阻断1b：无 feed 裁剪后保持未初始化，重新连线可在数据层自动装填`
  原断言：数据层未初始化/重连。
  必须改：同上。
  新期望证据：同上。
- `plugins/omnimux-workflow/src/shared/graph/slotModeSwitchResidual.test.mjs` :: `#4048 Q2：用户显式空数组清空不被自愈覆盖`
  原断言：数据层用户清空保护。
  必须改：同上。
  新期望证据：同上。
- `plugins/omnimux-workflow/src/shared/graph/slotSubmissionConsistency.test.mjs` :: `切换生成方式后，当前 layout 不存在的槽位绑定（未固定）被清理（Issue #4048）`
  原断言：数据层跨模式清理。
  必须改：数据层清理移出本任务。
  新期望证据：不再需要。
- `plugins/omnimux-workflow/src/shared/graph/slotSubmissionConsistency.test.mjs` :: `切换生成方式后，pinned 的旧槽位绑定仍保留为可停用意图（Issue #4048）`
  原断言：数据层 pinned 保留。
  必须改：同上。
  新期望证据：不再需要。
