# 规格说明：收敛左侧侧边栏按钮直接点击的强制伪全屏行为，统一采用分屏呈现

## 一、背景与问题定义
在 `sidebar-controller.js` 中，`openSidebarStore`（由左侧侧边栏图标点击触发）硬编码传入了 `focus: WORKBENCH_FOCUS.gui`，导致即便 `resolveDefaultFocus` 已经收敛为 `split`，从左侧侧边栏点击功能入口时依然被强制推进 `gui` 伪全屏，进而引发会话栏被压瘪至 0px、文字泄漏穿透与全屏状态倒挂。

## 二、验收标准（Acceptance Criteria）
1. `openSidebarStore` 移除强制的 `focus: WORKBENCH_FOCUS.gui`，不传 `focus` 属性，从而默认回退至 `resolveDefaultFocus(tabId)`（即 `WORKBENCH_FOCUS.split`）。
2. 更新单元测试，确保侧边栏激活验证期望打开参数符合分屏策略。
3. 保持现有全屏/退出全屏与会话激活仲裁回归 Green。
