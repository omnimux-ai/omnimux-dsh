# 修复验证证据：排除宿主外框误判为右侧面板避免拖拽黑屏死区

- **验证日期**：2026-09-15
- **验证范围**：
  1. `findWorkbenchPanelElement` 与 `isLikelyWorkbenchPanel` 严格排除外层总容器 `.dshDesktopFrame`，即使外框附带 `data-dragging="true"` 也绝不被误判为右侧面板。
  2. `tagWorkbenchPanel` 自动清洗外框节点上的误标属性，防止其意外被 `max-width: var(--omnimux-split-max)` 锁死截断。
  3. 实机 CDP 验证：清除非法外框属性后，外框由 1088px 恢复为 1728px 全宽，会话栏右侧与右侧面板左侧间距直接归零（gap = 0），中间大面积黑洞与假窗口栏彻底消除。
- **自动化测试**：
  - `plugins/omnimux/src/client/workbench/workbench-frame-clamp.test.js`: 1/1 通过
