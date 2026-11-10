# 规格：清理 V1 画布残留绑定并抑制槽位裸「不可用」文案（Issue #4032）

## 一、目标 (Objective)
修掉画布「生成节点」在**上游已被删除、但 `slotBindings` 仍残留占位绑定**时出现的幽灵态：
生成键被 `input_unavailable` 锁死、输入槽显示裂图 + 常驻裸「不可用」、用户只能重建节点。
根因有二：数据层 `recomputeCanvasSlots` 对 `inputBindingVersion===1` 的占位者无条件保留，从不校验其 source 节点 / edge 是否还在；表现层 `SlotWells` 把 `input_unavailable` 的原因渲染成常驻在槽位下方的裸文案。

## 二、命令 (Commands)
- 包级测试（含新增回归）：`pnpm --filter omnimux-workflow test`
- 类型检查：`pnpm --filter omnimux-workflow typecheck`
- 影响面判定：`node scripts/impact-matrix.mjs --git-diff --base origin/main`

## 三、项目结构与修改范围 (Project Structure & Scope)
- 数据层：`plugins/omnimux-workflow/src/shared/graph/canvasSlotRecompute.ts`
  - 在 `explicit`（V1 显式 `slotBindings`）过滤处，对 `currentVersion` 的每个占位者做存活校验：`sourceNodeId ∈ graph.nodes`、`edgeId ∈ graph.edges(target===node.id)`，且该 edge 的 `source === occupant.sourceNodeId`。
  - 存活判定通过则保留；**未固定（`pinned=false`）且不存活**的占位者丢弃；**`pinned=true` 的用户选择**保留为「可停用的无效意图」（不破坏既有 invalid-intent 流程）。裁剪后变为空的槽位键一并移除，避免留下 `{slot: []}` 残渣。
- 表现层：`plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotWells.tsx`
  - `reasonCode==='input_unavailable'` 时不再渲染常驻 `wf-slot-well__state` 裸「不可用」；原因保留在 `SlotHoverPreview` 悬浮预览中（符合 Tier3「Hide, Don't Grey」）。
- 回归测试：
  - `plugins/omnimux-workflow/src/shared/graph/slotSubmissionConsistency.test.mjs`：新增「V1 残留绑定在重算时被清理」用例。
  - `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs`：新增「input_unavailable 不再常驻裸文案」渲染用例。
- 不改动：提交/执行内核、模型契约、catalog。

## 四、技术方案 (Technical Design)
1. **数据层**：`recomputeCanvasSlots` 内对 V1 占用过滤条件由「无条件保留」改为「必须存活」：
   `liveNodeIds = new Set(graph.nodes.map(n=>n.id))`，`liveEdgeIds = new Set(graph.edges.filter(e=>e.target===node.id).map(e=>e.id))`；
   占位者需 `liveNodeIds.has(occupant.sourceNodeId) && occupant.edgeId && liveEdgeIds.has(occupant.edgeId)`。
   Legacy（非 V1）路径沿用原 `!modeChanged || occupant.pinned` 语义，不受影响。
2. **表现层**：`SlotWells` 常驻状态标签仅在 `model.state && model.state!=='ready' && model.reasonCode!=='input_unavailable'` 时渲染。

## 五、验收标准 (Success Criteria)
1. 删除上游节点后重算，目标节点 `slotBindings` 不再引用该已删节点/边（对应槽位为空数组），`compat.reasonCodes` 不再包含 `input_unavailable`。
2. 现有正常绑定不受影响：`slotSubmissionConsistency`、`canvasSlotRecompute.supplyMode`、`canvasInputMutationGateway.compat`、`occupantReplacement` 等既有用例保持绿。
3. 展示侧：`state:'invalid', reasonCode:'input_unavailable'` 的槽位不再输出 `wf-slot-well__state` 与「不可用」字样，但仍渲染 `wf-slot-well__placeholder--broken`；悬浮预览仍能读到原因。
4. `pnpm --filter omnimux-workflow test` 与 `typecheck` 全绿。

## 六、边界约束 (Boundaries)
- Always：在独立 worktree 修改，类型检查 + 包级测试通过后走 PR / Merge Queue。
- Never：不改提交/执行内核语义、不放宽其它无效态提示、不以首页空态冒充验收。

## 七、新用户基线 (Product Baseline)
本修复只依赖本地画布图数据与本地模型目录（`catalog`），不依赖任何 dev 机专属服务或凭据。
新用户首次进入创作画布即可用；`catalog` 缺失时按既有 `catalog_unavailable` 降级，不引入新的空态欺骗。

## 假设
V1 节点（`inputBindingVersion===1`）的 `slotBindings` 中，未固定（`pinned=false`）的自动占位者本应始终对应一条真实存在的 `source→target` 边；一旦源节点或边被删除，或边源与占位源不一致，它就是应被重算清理的无效残渣。而 `pinned=true` 是用户显式选择，即使供给失效也应保留为可停用的无效意图，不得静默清理。

## 证伪方式
证伪方式分两组：① 构造 V1 节点，其未固定占位者指向不存在的 `sourceNodeId`/`edgeId`（或边源与占位源不一致），调用 `recomputeCanvasSlots` 后断言该占位者被移除、`compat.reasonCodes` 不含它带来的 `input_unavailable`；若仍保留则假设被推翻、用例变红。② 构造 `pinned=true` 的失效占位者，断言其被保留；若被清理则同样变红。
