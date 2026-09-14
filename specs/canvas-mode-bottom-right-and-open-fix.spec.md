# 画布按钮右下角调整与全屏画布模式打开修复规格

## 1. 缺陷背景与根因定位
用户实测提出两点优化与缺陷反馈：
1. **按钮位置调整**：将气泡卡片右上角的「🎨 画布」悬浮胶囊按钮，移动至卡片的**右下角**（`bottom: 10px; right: 10px;`），使得视觉重心更加协调且不遮挡图片顶部视觉主体。
2. **点击触发空白页面根因**：
   - 在先前实现中，点击卡片时同步执行了 `data-omnimux-conversation-collapsed="true"`，立刻将中间会话列宽度折叠为 0；
   - 随后调用 `(win as any).__omnimuxWorkbench?.openWorkbench`；
   - **核心 Bug**：在 `plugins/omnimux/src/client/workbench.js` 的全局对象导出中，对外公开的方法名为 `open`（`open: openWorkbench`），未提供别名 `openWorkbench`。因此 `__omnimuxWorkbench.openWorkbench` 值为 `undefined`！
   - 导致右侧工作台根本没有被调用打开（`panelOpen` 仍为关闭状态）；
   - 中间列折叠为 0，右侧列未打开，直接导致除左侧导航栏外整个主区域呈现一片漆黑的**空白页面**！

## 2. 修复与优化方案
1. **右下角悬浮胶囊按钮定位**：
   - 样式更新为：`position: absolute; bottom: 10px; right: 10px;`
   - 保持高质感黑透磨砂底色（`rgba(20, 20, 24, 0.85)`）与高光细边框，鼠标悬停卡片时平滑浮现。
2. **全局工作台接口兼容器修复**：
   - 在 `workbench.js` 的 `createApi` 中，同时公开 `open: openWorkbench` 与 `openWorkbench: openWorkbench`。
   - 在 `contract.js` 与 `focus-state.js` 的 `WORKBENCH_OCCUPANTS` 和 `isWorkbenchTab` 中将 `omnimux:media-viewer` 登记为官方工作台一等公民，确保全屏模式（`gui` 焦点）与会话折叠状态被正确识别与联动。
3. **安全调用时序与防空白兜底保护**：
   - 在调用进入画布模式时，采用容错调用链路：优先调用 `__omnimuxWorkbench.open` / `openWorkbench` 打开媒体查看器；
   - 只有在侧边栏成功呼出且就绪后，再协同执行 `setConversationCollapsed(true)` 与 `setFocus('gui')`；
   - 若宿主工作台暂不可用，严禁孤立折叠中间会话列，杜绝出现空白屏幕。

## 3. 验收标准（Acceptance Criteria）
- **AC-1（按钮位置迁移至右下角）**：卡片上的「🎨 画布」悬浮胶囊按钮样式属性为 `bottom: 10px; right: 10px;`，鼠标移入卡片时在右下角淡入浮现。
- **AC-2（API 别名对齐）**：`window.__omnimuxWorkbench` 同时暴露 `.open()` 与 `.openWorkbench()`，调用均能正常打开工作台 Tab。
- **AC-3（工作台一等公民登记）**：`isWorkbenchTab('omnimux:media-viewer')` 返回 `true`。
- **AC-4（点击切入全屏画布不白屏）**：点击卡片或按钮后，正常呼出 `omnimux:media-viewer`，视口呈现全屏大图与底部悬浮输入框，中间会话栏收起，无空白屏幕。
