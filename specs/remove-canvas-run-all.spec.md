# 规格说明：创作画布移除一键运行全画布执行功能

## 1. 背景与目标 (Background & Objective)
- **背景**：当前创作画布顶栏控制区支持「一键运行整个画布」（Run All），在闲态时展示圆形运行全部按钮，终态时展示重新执行全部按钮。全画布一键运行极易引起意料之外的全部节点高并发消耗、意外覆盖已有结果或产生不可控的模型调用。
- **目标**：彻底移除创作画布「一键运行整个画布」功能，不支持整个全画布一键运行。用户仅支持按需针对具体选中的节点（右键运行所选节点或单个节点生成）进行精准执行。

## 2. 界面与交互行为变更 (UI & Interaction Changes)
1. **闲态（Idle 状态）**：
   - 移除顶栏控制区独立圆形运行全部按钮（`.wf-header-capsule--exec-standalone`）。
   - 闲态时不展示任何全画布执行按钮，控制栏保持极致简洁与现代留白。
2. **执行中（Busy / Paused 状态）**：
   - 当用户通过节点单独生成或右键菜单触发部分节点执行时，顶部状态胶囊正常显示执行状态、进度、暂停/继续与取消按钮。
3. **终态（Completed / Error / Cancelled 状态）**：
   - 保留状态指示与重置按钮（重置后恢复到闲态），但**彻底移除**重新执行全画布按钮（`.wf-header-capsule__btn--run-all`）。
4. **组件与控制层 API**：
   - 从 `HeaderControlsProps` 与 `CanvasEditorProps` 移除 `onStartExecution` 属性。
   - 从 `App.tsx` 移除 `onStartExecution={() => void execution.startExecution({ mode: 'full' })}`。
   - `ExecutionBar.tsx` 移除全画布执行按钮（`exec.runAll`）。
   - 执行控制层 `useExecutionController` 对 `mode: 'full'` 或缺少目标节点的全画布执行进行阻断与安全报错防护，杜绝隐式旁路执行。

## 3. 改动文件清单 (Scope of Changes)
- `plugins/omnimux-workflow/src/canvas/editor/components/HeaderControls.tsx`
- `plugins/omnimux-workflow/src/canvas/editor/CanvasEditor.tsx`
- `plugins/omnimux-workflow/src/canvas/App.tsx`
- `plugins/omnimux-workflow/src/canvas/editor/components/ExecutionBar.tsx`
- `plugins/omnimux-workflow/src/canvas/hooks/useExecutionController.ts`

## 4. 验收标准与测试验证 (Acceptance Criteria & Verification)
1. **静态检查与类型安全**：TypeScript 编译无报错。
2. **顶栏渲染与交互**：
   - 闲态下不出现全画布运行按钮（通过 DOM 检查与测试断言）。
   - 运行态和终态胶囊内无任何全画布运行按钮，终态重置功能完好。
3. **安全拦截**：`useExecutionController.startExecution` 在 `mode: 'full'` 时被安全拦截并抛出友好错误提示。
4. **单元与集成测试**：所有相关测试用例 100% 通过。
