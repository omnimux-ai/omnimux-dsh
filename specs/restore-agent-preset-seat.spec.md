# 规格：恢复会话上方原生切换 Agent 按钮与多预设选择能力

## 1. 业务背景与目标
用户明确要求恢复会话输入区上方 DSH 原生的切换 Agent 按钮。
先前为了极简曾全局硬性隐藏 `[data-composer-seat]`、`[data-omnimux-preset-seat]` 等节点，并下架了非社媒专家选项。
现需彻底恢复该按钮与弹出式下拉菜单的正常显示和交互能力，支持用户在界面自由切换不同的专家预设（如 TikTok运营专家团、社媒专家、营销专家、短剧专家等）。

## 2. 改动范围与契约
1. **样式恢复**：
   - 移除 `plugins/omnimux/src/client/styles.js` 中对 `[data-composer-seat]`、`[data-omnimux-preset-seat]`、`button[class*="PnBhwW_seat"]` 等选择器的 `display: none !important;` 规则；
   - 移除 `plugins/omnimux/src/client/agent-preset-enhancer.js` 中同等的隐藏规则，以及对其他预设选项的 `:not([data-omnimux-preset-id="omni-agent"])` 过滤隐藏；
2. **交互完整性**：
   - 会话顶部 Hero 区域与输入框上方恢复展示当前激活的专家名称与头像；
   - 点击该按钮能够正常唤起预设切换浮层菜单，菜单中完整展示出厂预设选项列表，点击后可顺畅完成模式切换。

## 3. 验收标准（Acceptance Criteria）
- **AC-1**：`styles.js` 与 `agent-preset-enhancer.js` 中不再包含对 AgentPresetSeat 及菜单的全局隐藏代码；
- **AC-2**：自动化测试验证切换按钮与预设菜单样式正常挂载，相关测试 100% 绿灯通过；
- **AC-3**：开发版与正式版完成编译物化，确保桌面应用中切换 Agent 按钮正常可见。
