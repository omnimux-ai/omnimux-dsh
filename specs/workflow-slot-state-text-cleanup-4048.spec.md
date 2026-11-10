# 规格：去掉卡槽下方常驻状态文案并清理跨模式残留槽位绑定（Issue #4048，#4032 后续）

## 一、目标 (Objective)
1. **表现**：画布生成节点输入卡槽下方不再出现任何常驻文本提示（「不兼容 / 不可用 / 等待中 / 未使用 / 无效」等一律不显示），原因保留在 hover 预览与 aria-label。
2. **数据**：清理「切换模型/生成方式后，旧 operation 的槽位绑定仍残留」的问题。典型：`wan-3.0 · text_to_video`（只接受 prompt）仍携带 `slotBindings.reference_images`（pinned=false），被渲染成冲突槽 +「不兼容」。

## 二、命令 (Commands)
- 定向测试：`node --import ./test-setup.mjs --test src/shared/graph/slotSubmissionConsistency.test.mjs src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs`
- 包级测试：`pnpm --filter omnimux-workflow test`
- 类型检查：`pnpm --filter omnimux-workflow typecheck`

## 三、项目结构与修改范围 (Project Structure & Scope)
- 数据层：`plugins/omnimux-workflow/src/shared/graph/canvasSlotRecompute.ts`
- 表现层：`plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotWells.tsx`
- 测试：`slotSubmissionConsistency.test.mjs`（新增跨模式残留清理用例）、`slotInteractionRefinement.test.mjs`（改为断言任何状态都不渲染 `wf-slot-well__state`）
- 不改动：hover 预览、提交/执行内核、模型契约。

## 四、技术方案 (Technical Design)
1. **数据层**：在 V1 `explicit` 过滤处，未固定（`pinned=false`）占位者保留条件改为：
   `slotExistsInLayout && isLiveOccupant(occupant)`；`pinned=true` 仍保留（既有 invalid-intent 语义）。
   `slotExistsInLayout = layout.slots.some(spec => spec.slot === slotName)`。
   裁剪后保留空数组，维持「显示=提交」一致。
2. **表现层**：删除 `SlotWells` 的常驻 `wf-slot-well__state` 文本节点（不再按 `model.state` 渲染任何文案）。视觉状态仍由占位符（裂图/加载/文字缩略图）与 `wf-slot-well--conflict` 等样式表达；原因在 `SlotHoverPreview`。

## 五、验收标准 (Success Criteria)
1. 构造 `text_to_video`（layout 无 reference_images）+ `slotBindings.reference_images`（pinned=false、source/edge 均存活）→ 重算后该槽位绑定为空数组，`compat.reasonCodes` 不再包含该槽位带来的 `role_conflict`。
2. `pinned=true` 的同槽位绑定仍保留（不破坏 invalid-intent 流程）。
3. `SlotWells` 渲染：对 `state=invalid / inactive / pending / input_unavailable` 任一状态，均不输出 `wf-slot-well__state` 与任何「不兼容/不可用/等待中/未使用/无效」文本。
4. 既有 `SlotHoverPreview` 原因展示与无障碍标签不变。
5. 定向 + 包级全量测试、typecheck 全绿。

## 六、边界约束 (Boundaries)
- Always：独立 worktree；测试与类型检查通过后走 PR / Merge Queue。
- Never：不删除 hover 原因、不改提交/执行语义、不放宽其它校验。

## 七、新用户基线 (Product Baseline)
仅依赖本地画布节点/边与本地模型目录（catalog），不依赖 dev 机专属服务或凭据；新用户首次进入创作画布即可用。

## 假设
生成节点的 `slotBindings` 只有在「其槽位存在于当前 operation 的 layout」且「source 节点与 edge 均存活」时才是当前模式的真实输入；切换模型/生成方式后，未固定（pinned=false）的旧槽位占用属于应被重算清理的残渣，而 pinned=true 是用户显式意图，必须保留为可停用的无效意图。

## 证伪方式
证伪方式：构造一个 `text_to_video` 节点，其 `slotBindings.reference_images` 指向存活图片节点与存活边（pinned=false），调用 `recomputeCanvasSlots` 后断言该槽位被清空、`compat.reasonCodes` 不含 `role_conflict`；再构造同槽位 pinned=true 的对照，断言其被保留。同时渲染 `SlotWells` 的 invalid/pending 记录，断言 HTML 不含 `wf-slot-well__state`。任一断言失败即假设被推翻、用例变红。

## 旧标准变更
- `plugins/omnimux-workflow/src/shared/graph/slotModeSwitchResidual.test.mjs` :: `#4048 阻断3：裁剪后保留空槽键，展示/提交不出现「显示已填、提交为空」`
  原断言：裁剪后必须保留 `first_frame` 空槽键，并且直接把 `result.data.slotBindings` 传给展示/提交读取断言为空。
  必须改：评审实测 ConfigPanel 会把「无匹配槽位」的绑定归一成未初始化并 autoFill，保留空槽键会同时造成「显示已填、提交为空」以及同槽位后续连线无法自动装填；改为「裁剪导致无任何显式占用时，按未初始化重新自动装填并落盘」。
  新期望证据：重算后 `first_frame` 不残留，同一条 live 边自动装填到 `reference_images`，展示与提交选中同一条。
