# 会话栏分屏/非全屏模式下隐藏底部快捷方式规范

## 目标

在非全屏（分栏/分屏）模式下（即右侧展开应用或工作台面板、中间会话栏收敛为紧凑列，或命中了 `data-omnimux-split-compact` 状态），会话栏底部自动隐藏四条快捷方式入口（`.omx-quick-shortcuts`），消除紧凑列拥挤感并使输入框自然贴底；恢复全屏模式（右侧面板收起或全屏）时，四条快捷方式完整保持展示。

## 场景行为契约

| 界面场景 | 会话栏状态 | 判定依据 | 底部快捷栏（.omx-quick-shortcuts） | 视觉效果与交互行为 |
| --- | --- | --- | --- | --- |
| 全屏主视图 | 居中全宽列 | 无展开的右侧面板，或右侧面板处于全屏 | 正常展示 | 居中呈现四条快捷起手指令 |
| 非全屏（分屏） | 左侧/中间紧凑工作列 | 命中 `html[data-omnimux-split-compact]` 或右侧面板处于打开且非全屏 | 自动隐藏 (`display: none !important`) | 彻底隐藏，输入框紧凑贴底，不产生多余留白或横向溢出 |

## 成功标准

1. **分屏状态立即隐藏**：在分屏紧凑态选择器（`html[data-omnimux-split-compact]` 以及 `.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"]))`）下，`.omx-quick-shortcuts` 强制隐藏 (`display: none !important`)。
2. **全屏状态完整保留**：当宿主右侧面板收起或处于全屏时，四条快捷方式入口无缝保持原有显示与居中排布，点击功能与状态不受任何影响。
3. **零布局破损**：隐藏后不破坏输入框与工作区行（`heroWorkspaceRow`）的既有贴底与内边距几何，页面无额外纵向滚动条或布局跳动。
4. **测试与代码审查**：相关单测全部通过，新增分屏隐藏断言，通过开源代码审查命令行（`ocr`）行级审查。
