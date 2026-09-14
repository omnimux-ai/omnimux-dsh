# 独立全屏画布模式与卡片悬停交互规格（Canvas Mode & Card Hover Interaction）

## 1. 业务背景与用户意图
用户反馈当前消息气泡中的图片卡片存在两处交互与体验瑕疵：
1. **卡片按钮冗余**：卡片底部带有一排「复制」和「在侧边栏打开」操作条，破坏了图片的通透感，不够极简。
2. **交互链路不沉浸**：用户希望卡片默认纯净，鼠标悬停时才在右上角优雅浮现黑透磨砂「🎨 画布」胶囊按钮；点击卡片或按钮后，不再只是打开狭窄侧栏，而是直接切入**独立的画布模式**——中间的消息列表隐藏收起，媒体画布铺满整个主舞台，且输入框平移到屏幕最底端居中悬浮（对标用户图 4 示意），形成“看大图 + 底端输入下达微调指令”的高效创作流。

## 2. 界面与交互设计规范

### 2.1 气泡图片卡片优化
1. **剔除底部操作栏**：彻底移除卡片底部的 `.omx-chat-media-tail__actions` 栏及其子按钮，图片四角保持一致大圆角（14px）。
2. **右上角悬浮「画布」胶囊**：
   - 元素：`.omx-chat-media-tail__canvas-btn`
   - 布局定位：`position: absolute; top: 8px; right: 8px; z-index: 3;`
   - 视觉质感：`background: rgba(24, 24, 27, 0.82); backdrop-filter: blur(8px); border-radius: 9999px;`，高质感白字白图标。
   - 图标与文本：调色盘画笔图标（Palette Brush Icon）+ 文本「画布」。
   - 显隐动画：默认 `opacity: 0; pointer-events: none;`，当鼠标移入卡片（`.omx-chat-media-tail__card:hover`）时平滑淡入 `opacity: 1; pointer-events: auto;`。

### 2.2 独立全屏画布模式切入
1. **点击响应**：点击图片卡片任意有效区域，或点击右上角「画布」按钮，执行 `openInSidebar`。
2. **布局状态切换**：
   - 将媒体查看器设置为两栏画布模式（`store.setLayoutMode('2col')`）；
   - 在根节点挂载属性 `data-omnimux-conversation-collapsed="true"`，收起中间的会话气泡列；
   - 唤起右侧工作台 `openWorkbench({ tabId: 'omnimux:media-viewer' })`，工作台面板全屏向左扩展铺满主视口；
   - 视口底部常驻居中悬浮输入框（`FloatingBottomComposer`），方便用户基于当前大图继续对话微调。

### 2.3 顶部模式切换按钮细节（对标图 3）
- 左按钮：单图画框图标（表示大图单画布浏览模式）；
- 右按钮：四宫格 `::` 图标（表示时间线瀑布流模式）；
- 紧凑圆角胶囊容器，激活态带有深色反差底色。

## 3. 验收标准（Acceptance Criteria）
- **AC-1（卡片操作栏移除）**：消息气泡尾部卡片内不再渲染底部的 `.omx-chat-media-tail__actions` 操作条。
- **AC-2（悬停浮现画布按钮）**：卡片右上角存在带有「画布」字样与调色盘图标的悬浮胶囊按钮，默认不可见（`opacity: 0`），鼠标悬停（hover）时可见。
- **AC-3（点击进入全屏画布）**：点击卡片或画布按钮，`document.documentElement` 正确设置 `data-omnimux-conversation-collapsed="true"`，且 `media-viewer-store` 的 `layoutMode` 切换为 `'2col'`。
- **AC-4（工作台成功打开）**：点击后正确调用 `openWorkbench` 并激活当前媒体资产。
- **AC-5（顶部模式图标对标）**：媒体查看器顶部工具栏左侧包含单图画框模式与四宫格模式切换按钮。
