# 定时任务详情面板自动保存（Auto-Save）与移除保存按钮规格

## 1. 目标（Objective）
响应用户明确指令：“修改设置自动保存 无需手动确认保存 把保存按钮移除”，将定时任务详情面板（`TaskDetailPanel.jsx`）与工作台（`AutomationWorkbench.jsx`）重构为现代系统设置的实时自动保存机制：
1. 移除详情底部的保存按钮与取消按钮；
2. 修改任何设置项（选择工作区、模型、推理等级、权限边界、计划类型、时间、星期等）即时自动保存持久化；
3. 文本输入（名称、指令 prompt、时区、并发数）在失焦（onBlur）或改动后自动保存；
4. 移除切换任务与按 Esc 关闭时的“放弃修改”二次确认拦截（因为改动已即时持久化，不存在丢失修改的脏态）。

## 2. 核心验收标准（Acceptance Criteria）
- **AC-1（保存按钮移除）**：
  - 详情面板彻底移除保存按钮（以及取消按钮），不再要求用户手动确认保存。
  - 保留干净沉浸的无底栏现代排版。
- **AC-2（修改即自动保存）**：
  - 用户更改下拉项（工作区、模型、权限、周期类型、时间）、点击推理等级分段按钮或星期切换时，系统即刻调用 `runtime.updateAutomation` 完成持久化。
  - 用户在输入框（名称、指令等）完成编辑并失焦时，自动触发提交保存。
- **AC-3（无阻断切换与关闭）**：
  - 关闭面板（Esc 或关闭按钮）与切换不同任务时，无缝切换，无需弹出“放弃未保存的修改”确认框。
- **AC-4（全量测试绿灯）**：
  - 更新对应的自动化测试，所有 132 项单元测试与端到端测试 100% 保持通过。

## 3. 影响文件与修改范围
- `specs/automation-detail-autosave.spec.md`
- `plugins/omnimux-automation/src/client/TaskDetailPanel.jsx`
- `plugins/omnimux-automation/src/client/AutomationWorkbench.jsx`
- `plugins/omnimux-automation/src/client/render.test.js`
- 产物 `plugins/omnimux-automation/lib/client.js`
- 验证证据 `docs/evidence/automation-detail-autosave-verified.md`
- 端到端测试 `tests/e2e/automation-detail-autosave.e2e.test.mjs`
