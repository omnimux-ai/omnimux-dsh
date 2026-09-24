# Issue #2632 — 优化会话模型面板开关样式、文案精简与移除冗余分类标题

## 目标 / Objective
根据业务决策者反馈与截图指示，对会话模型选择器（`ModelPicker`）进行体验与视觉打磨：
1. **开关按钮样式修复**：
   - 解决开启时背景为纯白色导致滑块被融掉无法识别的问题；
   - 统一使用规范的开关设计：开启状态使用 `var(--dsw-alias-state-success, #10b981)` 醒目绿底；关闭状态使用 `var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16))` 暗灰底；
   - 滑块（thumb）为 `#ffffff` 纯白圆球并带柔和阴影 `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25)`，开闭状态清晰易辩；
2. **文案极致精简**：
   - 将原「自动 (由 Agent 决策)」精简为「自动」；
   - 对应的无障碍属性 `aria-label` 同步更新为「自动」；
3. **移除 Tab 下方冗余分类标题**：
   - 彻底移除选项卡下方的 `sh-model-section-title` 标题元素（视频下的「视频生成模型」、图像下的「图像生成模型」），减少多余层级与视觉噪声，Tab 选项卡下方直接紧接模型单列卡片；
4. **自动化测试与回归**：
   - 同步更新 E2E 测试断言与证据产物，确保 100% 全绿，无构建及语法异常。

## 涉及文件 / File List
- `plugins/omnimux/src/client/composer-quick-shortcuts/ModelPicker.jsx`
- `plugins/omnimux/src/client/composer-quick-shortcuts/styles.js`
- `plugins/omnimux/tests/e2e/composer-shortcut-model-picker.e2e.test.mjs`
- `scripts/generate-composer-model-picker-evidence.mjs`
- `specs/model-picker-ui-polish.spec.md`

## 验收标准 / Acceptance Criteria
- AC-1: 弹窗右上角「自动」文字简洁呈现为「自动」，无冗余后缀；
- AC-2: 开关按钮在开启时呈现绿色背景（#10b981），关闭时呈现暗色背景，滑块为带立体阴影的白色圆球，滑块滑动正常；
- AC-3: 选项卡下方不再渲染「视频生成模型」或「图像生成模型」文字标题，列表自然上移；
- AC-4: 关联单元与端到端测试 100% 全绿；
- AC-5: 开源代码审查通过，真实验证通过。
