# 规格：移除输入框上方 Agent 预设切换入口并保持社媒专家默认值守 (Issue #2299)

## 1. 业务目标与背景
根据极简产品设计原则与用户诉求：
1. 在新会话及输入框上方彻底移除智能体预设切换入口按钮（`AgentPresetSeat`），避免暴露不必要的切换下拉菜单；
2. 系统底层持续保持「社媒专家」（`omni-agent`）作为唯一默认值守角色，开箱即用；
3. 保留工作区选择器（`button.zNic4G_workspace`）及输入框卡片内部的所有交互功能（技能、模型选择、发送、文件拖拽等）不受任何影响；
4. 绝对不可对大容器 `[data-composer-seat]` 设置隐藏（防范历史 PR #2294 事故），仅针对预设切换按钮本身进行精准防御性隐藏。

## 2. 行为契约与改动规范
1. **精准隐藏预设切换按钮**：
   在 `plugins/omnimux/src/client/styles.js` 中新增防御性隐藏规则：
   ```css
   /* ── 移除输入框上方 Agent 预设切换入口，保持社媒专家作为唯一默认值守 (Issue #2299) ── */
   [data-slot="conversation.hero.agentPreset"],
   [data-omnimux-preset-seat],
   button[class*="AgentPresetSeat_seat"],
   button[class*="PnBhwW_seat"],
   button[class*="_seat"][aria-haspopup="menu"],
   [class*="heroWorkspaceRow"] > span:has(button[class*="seat"]),
   [class*="heroWorkspaceRow"] > span:has([data-omnimux-preset-seat]),
   [data-omnimux-preset-menu] {
     display: none !important;
   }
   ```
2. **默认预设保持**：
   系统底层持续遵循 `default: omni-agent` 规则，新建会话始终以「社媒专家」作为主理人。
3. **安全红线**：
   严禁包含 `[data-composer-seat]`，严禁影响任何输入框卡片、工作区按钮与侧边栏组件。

## 3. 关键验收场景（Acceptance Criteria）
- **AC-1 (切换入口完全隐藏)**：在新建会话页面中，`[data-slot="conversation.hero.agentPreset"]` 及内部切换按钮计算样式为 `display: none`。
- **AC-2 (工作区按钮与输入框完好保留)**：左侧工作区选择器（`button[class*="workspace"]`）与输入框卡片（`[data-composer-card]` / `textarea`）正常展示（`display: flex` / 可见），各项工具栏正常可用。
- **AC-3 (社媒专家默认值守不变)**：会话创建默认 Agent 标识仍为 `omni-agent`。
- **AC-4 (单测与 E2E 绿灯)**：相关单元测试与集成测试 100% 通过。
