# 规格说明：修复具名素材卡槽渲染与口型版 Operation 自动级联

**Issue**: #2865  
**状态**: Approved  
**范围**: `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/` & `plugins/omnimux-workflow/src/shared/graph/feedSlot/`  

---

## 1. 目标 (Objective)

1. **口型版生成方式级联自适应**：
   当用户在模型选择器中切换到 `Hailuo H3 口型版`（`allowedGroups: ['lipsync']`）时，`videoParameterSelection` 必须将生成方式自动校准为其唯一合法操作 `digital_human`，修复之前因 preferred operation（`first_frame`）不在候选列表导致切换被阻断并残留非法 `first_frame` 的缺陷。
2. **具名素材卡槽（`named` preset）完整渲染**：
   在 `inputBindingVersion === 1`（`props.records` 存在）模式下，`SlotWells.tsx` 不得将 `named` 布局退化为单列 `strip` 渲染。必须按 `layout.slots` 渲染所有定义的具名卡槽（如角色图 `character` 和驱动音频 `driving_audio`）；未填满时渲染具名槽专属的空态虚线加号框，并携带正确的 `data-slot`、`aria-label` 与 `targetSlot`，绝不允许将非帧槽折叠为通用的 `wf-slot-well--append`。
3. **连线上游未就绪状态提示（Waiting Feedback）**：
   当有 edge 连入但上游素材正处于生成中或未完成时（`availability === 'waiting'` 或 `status === 'pending'`），卡槽应正确展示等待状态，避免用户产生连线失效错觉。

---

## 2. 详细技术实现 (Technical Details)

### A. `videoParameterSelection.ts`
在 `branch` 函数中解析 `operation` 时：
```ts
const operation = (preferred ? state.effectiveOps.find(op => op.id === preferred) : undefined)
  ?? (state.effectiveOps.find(op => op.id === 'text_to_video') ?? state.effectiveOps.find(op => op.id === state.selectedOperationId) ?? state.effectiveOps[0]);
```
当 `preferred`（如旧的 `first_frame`）在当前 `state.effectiveOps`（如口型版仅有 `digital_human`）中不存在时，平滑回退至当前有效操作首项，保证参数切换顺利完成。

### B. `SlotWells.tsx`
针对 `layout.preset === 'named'` 且 `props.records` 存在的分支：
按照 `layout.slots` 遍历：
- 若该 `spec.slot` 在 `props.records` 中有对应绑定项，渲染已绑定的 `renderWell(model)`；
- 若该 `spec.slot` 未绑定，且当前已绑定数量小于 `spec.max`（或必需槽位），渲染该槽位专属的空态卡槽：
  - `role="button"` / `<button>`
  - `data-slot={spec.slot}`
  - `data-slot-role={spec.role}`
  - `aria-label={t('panel.slotPick').replace('{slot}', slotLabel(spec))}`
  - 点击派发 `onPickSlot(pickRequest(spec))`（包含该 slot 专属的 `targetSlot` 与 `acceptedTypes: [spec.type]`）。

---

## 3. 验收标准 (Acceptance Criteria)

1. 选择 `minimax-h3` 口型版（`lipsync`）时，`params.operation` 正确为 `digital_human`，底栏参数回显数字人/对口型参数。
2. 数字人/对口型模式下，输入框左上方明确呈现两个具名卡槽：一个为角色图片槽，一个为驱动音频槽，各自具备专属类型与选择器契约。
3. 单元测试与端到端测试 100% 绿灯。
