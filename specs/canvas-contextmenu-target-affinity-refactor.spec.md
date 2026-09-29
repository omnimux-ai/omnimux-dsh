# 创作画布右键菜单目标归属性与状态机收敛规格 (Canvas Context Menu Target-Centric Affinity Spec)

## 1. 目标 (Objective)
在创作画布（`plugins/omnimux-workflow`）中，彻底消除“选中节点后在空白处右键却弹出已选节点卡片菜单”的严重交互缺陷。
确立并落地**「靶心归属性原则（Target-Centric Affinity）」**：
- 右键点击谁，焦点与上下文菜单就 100% 绑定到该目标；
- 右键画布空白背景时，必须**原子化取消所有选中态**，并精准唤起画布全局菜单；
- 右键其他未选中的节点时，原子化将焦点转移至该节点（单选选中），并唤起该节点的专属操作菜单；
- 杜绝在右键事件流中依赖前序历史选中做黑盒猜测的手术式补丁，做一次结构清晰、职责单一的架构收敛。

## 2. 用户操作旅程与期望界面反馈 (User Journeys)

### Journey 1: 空白处右键清空选中并激活画布菜单
1. 用户在画布上左键点击节点 A，节点 A 呈现蓝色选中高亮边框；
2. 用户移动鼠标至节点卡片外侧的任意空白背景，点击右键；
3. **界面即时反馈**：
   - 节点 A 的蓝色选中高亮边框立即消失；
   - 视口在鼠标右键位置弹出纯净的「画布背景菜单」（包含：素材导入、新建节点、撤销、重做、创建工作流、粘贴、全选）；
   - 菜单中绝对不出现与节点相关的操作项（如：运行测试、复制节点、删除等）。

### Journey 2: 跨节点右键自动切换单选焦点
1. 用户在画布上选中节点 A；
2. 用户移动鼠标至另一未选中的节点 B 卡片范围内，点击右键；
3. **界面即时反馈**：
   - 节点 A 自动取消选中；
   - 节点 B 变为唯一选中高亮节点；
   - 弹出节点 B 的专属菜单（包含：运行测试、复制、创建副本、粘贴、删除）。

### Journey 3: 多选节点时的右键集合操作
1. 用户按住 Meta/Shift 或框选同时选中了节点 A 与节点 B；
2. 用户在节点 A 或节点 B 卡片范围内点击右键；
3. **界面即时反馈**：
   - 维持当前多选集合 [A, B]；
   - 弹出批量操作菜单（包含：批量执行、复制、创建副本、编组为工作流、粘贴、批量删除）。
4. 若用户在多选集合外的空白背景点击右键：
   - 所有节点的选中态全部清除；
   - 弹出纯净的画布背景菜单。

## 3. 状态迁移规则表 (State Transition Matrix)

| 事件触发 | 前置节点选中状态 | 状态变更 (State Mutation) | 上下文类型 (Context) | 弹出菜单内容 |
| :--- | :--- | :--- | :--- | :--- |
| `onPaneContextMenu`<br>(空白背景右键) | 存在选中节点 (单选/多选) | 1. `clearSelection()`<br>2. 所有节点 `selected=false`<br>3. `selectedElement={type:'none'}` | `{ type: 'pane' }` | 画布全局菜单 (无删除节点) |
| `onPaneContextMenu`<br>(空白背景右键) | 无任何节点选中 | 保持无选中 | `{ type: 'pane' }` | 画布全局菜单 |
| `onNodeContextMenu`<br>(未选节点右键) | 选中其它节点或无选中 | 1. 目标节点 `selected=true`<br>2. 其它节点 `selected=false`<br>3. `setSelectedElement('node', id)` | `{ type: 'node', nodeId }` | 节点专属菜单 |
| `onNodeContextMenu`<br>(已单选节点右键) | 目标节点已单选 | 保持当前单选 | `{ type: 'node', nodeId }` | 节点专属菜单 |
| `onNodeContextMenu`<br>(多选集合成员右键) | 目标节点在多选集中 | 保持多选集合 | `{ type: 'selection' }` | 批量多选菜单 |
| `onSelectionContextMenu`<br>(多选框选区右键) | 任意多选态 | 保持多选集合 | `{ type: 'selection' }` | 批量多选菜单 |

## 4. 影响模块与接口约定 (Architecture & Interfaces)

- **`useCanvasContextMenu.ts`**：
  - 在 `CanvasContextMenuDeps` 注入 `setSelectedElement` 回调；
  - `handlePaneContextMenu` 严格执行 `clearSelection()`，并无条件派发 `{ type: 'pane' }` 上下文；
  - `handleNodeContextMenu` 判别当前节点是否处于多选集：若处于多选集派发 `{ type: 'selection' }`；否则单选收敛至该节点，派发 `{ type: 'node', nodeId: node.id }`；
  - 彻底删除原 `openContextMenu` 中的 store 意图猜测 fallback。
- **`CanvasEditor.tsx`**：
  - 将 `setSelectedElement` 透传给 `useCanvasContextMenu` 依赖。
- **测试文件**：
  - `src/canvas/editor/components/ContextMenu.test.mjs`
  - `tests/e2e/context-menu-delete-node.e2e.test.mjs`

## 5. 验收标准与验证命令 (Acceptance Criteria & Commands)

- **AC-1**：在节点选中状态下右键点击画布空白背景，必须触发 `clearSelection` 且菜单上下文为 `pane`。
- **AC-2**：在节点 A 选中状态下右键点击节点 B，节点 B 变为唯一选中，且菜单上下文为 `{ type: 'node', nodeId: 'node-b' }`。
- **AC-3**：多选集内的节点右键呼出 `selection` 菜单；多选集外空白右键清除多选并呼出 `pane` 菜单。
- **AC-4**：类型检查与单元测试 100% 通过。

**执行命令**：
```bash
# 类型检查
npm run typecheck --prefix plugins/omnimux-workflow
# 单元测试与 E2E
node --test plugins/omnimux-workflow/src/canvas/editor/components/ContextMenu.test.mjs plugins/omnimux-workflow/tests/e2e/context-menu-delete-node.e2e.test.mjs
```
