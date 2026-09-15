# 规格：分栏模式工作区组件左对齐、间距极致收敛与分割线拖拽恢复

## 1. 背景与目标
在分栏/右侧面板打开的场景下，用户提出三项关键体验优化诉求：
1. **工作区组件左对齐**：输入框上方的「工作区」选择器组件（`📁 视频创作` 所在行）当前向左突出，未能与下方输入框左边缘对齐，视觉上参差不齐。
2. **左右与底部间距极致收敛**：分栏模式下输入框两侧留白和底部留白依然偏大，需进一步收紧留白，消除黑边死区，最大化利用打字与视野空间。
3. **分割线拖拽调整宽度恢复**：会话栏与右侧边栏之间的中间分割线目前无法拖拽调整宽度（由于先前样式规则使用了固定像素和 `!important` 强行锁死网格轨道，阻断了底座原生的拖拽手柄）。

## 2. 核心架构与验收标准（AC）

### AC-1 工作区组件与输入框严格左对齐
- 输入框卡片包裹在底座 `inputBar` 容器中，具有左侧间隙 `var(--dsh-composer-side-clearance, 16px)`。
- 工作区行（`heroWorkspaceRow`）的内边距设置为 `padding-left: var(--dsh-composer-side-clearance, 16px)!important; padding-right: var(--dsh-composer-side-clearance, 16px)!important; width: 100%!important; box-sizing: border-box!important;`。
- 效果：工作区组件按钮（`📁 视频创作` 等）左边缘与输入框左边缘严格处于同一垂直线上，彻底对齐。

### AC-2 左右与底部间距极致紧凑
- 分栏模式下解除输入框座席及英雄容器的多余底部内边距（`padding-bottom: 0!important`）。
- 输入框自然贴底，仅保留底座原生紧凑呼吸间隙（8px）。
- 左右边距遵循紧凑布局规范（16px 原生间距），横向自然充盈，消除冗余黑边。

### AC-3 恢复会话栏与右侧边栏分割线的拖拽调整
- 彻底移除 `conversation-box.js` 中使用 `!important` 强行覆盖 `grid-template-columns` 导致原生 `DragHandle` 失效的样式规则。
- 移除强行指定固定宽度 `width: 440px !important` 和 `width: calc(100vw - 440px) !important` 的破坏性限制。
- 仅保留 `min-width: 380px` 的安全保护宽度，底座原生拖拽手柄驱动的动态网格列宽（`cols.rightbar` 与 `minmax(0, 1fr)`）完全恢复响应。

## 3. 门禁与验证要求
- 全量单元测试和集成测试 100% 通过。
- 覆盖分割线拖拽无阻断及工作区行几何对齐测试。
