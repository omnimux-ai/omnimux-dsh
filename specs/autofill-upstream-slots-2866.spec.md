# 规格说明：修复上游连线素材自动装填卡槽与空态阻断

**Issue**: #2866  
**状态**: Approved  
**范围**: `plugins/omnimux-workflow/src/shared/graph/feedSlot/` & `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/`  

---

## 1. 目标 (Objective)

解决画布核心交互逻辑断层：用户在画布上拉出连线连接上游可用素材（如图片输出）至生成节点（如视频节点）后，生成节点的素材卡槽依然显示为两个空态加号，无法自动装填并展示素材缩略图的问题。

核心原则：
1. **连线即供给并智能装填**：新建立或存在的上游连线，若满足目标槽位类型、角色与限制，且未被用户主动移除进入待命池（`slotStandbyEdgeIds`），必须自动填充（`autoFillSlots`）至未满的卡槽中，卡槽立即展示缩略图；
2. **尊重用户主动卸载**：当用户在卡槽悬浮窗或弹窗中主动点击卸载/移除时，该边进入 `slotStandbyEdgeIds`（或 `use: 'inactive'`），后续不再重复自动装填；
3. **贯通 inputBindingVersion=1 契约**：彻底清除 `effectiveInputDisplay.ts`、`canvasSlotRecompute.ts` 与 `ConfigPanel/index.tsx` 中阻断 `autoFillSlots` 的硬编码短路代码。

---

## 2. 详细技术实现 (Technical Details)

### A. `effectiveInputDisplay.ts`
当 `inputBindingVersion === 1` 时：
若 `saved`（即 `nodeData.slotBindings`）为空或其对应槽位有空位，且连入边未在 `standby` 中，调用 `autoFillSlots(feed, layout, explicit ?? {}, standby)` 完成自动装填。

### B. `canvasSlotRecompute.ts`
在连线变更重新计算节点槽位时：
允许新连入的边经由 `autoFillSlots` 装配至空卡槽中。

### C. `ConfigPanel/index.tsx`
移除 `if (currentInputs) return raw ?? {};` 的阻断短路，允许在未记录待命卸载边时正常触发自动装填。

---

## 3. 验收标准 (Acceptance Criteria)

1. 当上游图片节点（带 ready 图片）连线接入下游视频节点（如口型版数字人模式）时，视频节点的卡槽 1（`character`）自动装入该图片并显示缩略图，卡槽 2（`driving_audio`）继续保持空态虚线加号等待音频。
2. 单元测试与端到端测试 100% 绿灯。
