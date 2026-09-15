# 规格：修复拖拽分栏时宿主外框被误标为右侧面板导致的大面积黑屏空洞

## 1. 缺陷背景
在分栏模式下调节会话栏与右侧边栏宽度时，中间出现大面积黑色空洞，右侧工作台被挤到最右侧，中间看似“多出了一个空的窗口栏”。

### 根因分析
1. 用户在拖拽官方分栏调整手柄时，官方底座 `AppFrame` 会在外层总容器 `.dshDesktopFrame` 上添加 `data-dragging="true"`。
2. 插件的 `findWorkbenchPanelElement` 在解析当前活跃右面板时，执行了 `doc.querySelector('[data-dragging]')`，由于其判定函数 `isLikelyWorkbenchPanel` 未排除外层总容器 `.dshDesktopFrame`，导致误将外层外框判定为右侧面板。
3. 随后 `tagWorkbenchPanel` 将 `data-omnimux-workbench-panel` 属性打在了外框 `.dshDesktopFrame` 上。
4. 样式规则 `html:not([data-omnimux-conversation-collapsed]) [data-omnimux-workbench-panel] { max-width: min(100vw, var(--omnimux-split-max, 100vw)) !important; }` 生效，直接把整个应用的桌面外框强行限制为 1088px 最大宽度。
5. 结果：总外框收缩至 1088px，而右侧面板又固定在屏幕最右侧，两者之间暴露出整整数百像素的窗口底层黑色空白死区，形成“多出一个空窗口栏”的严重视觉缺陷。

## 2. 验收标准（AC）
- **AC-1 排除外框节点误判**：`isLikelyWorkbenchPanel` 与 `findWorkbenchPanelElement` 严格排除 `.dshDesktopFrame`、`[class*="frame"]`、`body`、`html` 及全屏宽度的容器节点，绝不允许将外层总容器识别为工作台面板。
- **AC-2 自动解绑防护**：在布局探测与样式应用时，若检测到 `.dshDesktopFrame` 附带 `data-omnimux-workbench-panel` 属性，立即自动移除，防止残留属性限制容器最大宽度。
- **AC-3 拖拽无黑屏死区**：用户无论如何拖动分割线拉宽或收窄会话栏与右侧工作台，`.dshDesktopFrame` 始终 100% 占满视口，会话栏右边界与右工作台左边界紧密贴合（gap = 0），绝不出现任何中间黑色空洞。
