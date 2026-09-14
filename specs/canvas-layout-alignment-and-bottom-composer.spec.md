# 全屏画布布局对齐与右下角按钮修复规格（Canvas Layout Alignment & Bottom Composer Spec）

## 1. 业务痛点与根因分析
用户在实测后反馈两个问题并附实机截图：
1. **右下角悬浮按钮**：图片卡片上的「🎨 画布」按钮需要精准放置在卡片的右下角，避免遮挡图片主体。
2. **画布模式布局错乱（核心缺陷）**：
   - 现象：点击进入画布模式后，右侧工作台没有正确对齐，中间大片黑色空白，且生成的图片异常偏移到了最左侧并压在了左侧导航栏之上，导致整个界面错乱重叠。
   - 根因排查（经 CDP 真机实测取证）：
     - 在 Electron 桌面端中，右侧栏的内部面板容器 `[class*="_panel"]` 采用了 `position: fixed` 定位。
     - 之前的会话折叠规则 `html[data-omnimux-conversation-collapsed] .dshDesktopRightbarSurface [class*="_panel"]` 简单粗暴地设置了 `left: 0 !important;`。
     - 由于 `position: fixed` 的包含块是整个视口（Viewport），`left: 0` 导致面板直接从屏幕的最左端（x = 0）开始绘制，完全穿透了宽度 280px 的左侧通用导航栏，导致画布内部的图片从 x = 56px 处开始排版，正好被叠在左侧栏下方露出一截，右侧则留出千像素级的巨大黑空！
     - 此外，默认视图子模式为 `grid` 时间线，未默认进入图 4 要求的单图居中画布模式。

## 2. 核心架构与修复方案

### 2.1 视口栅格与定位隔离修复
- 在左侧栏未折叠状态（正常工作态）：
  ```css
  html[data-omnimux-conversation-collapsed]:not([data-omnimux-left-collapsed]) .dshDesktopRightbarSurface [class*="_panel"]:not([class*="bottom"]):not([class*="Hidden"]) {
    left: var(--omnimux-sidebar-width, 280px) !important;
    right: 0 !important;
    width: calc(100vw - var(--omnimux-sidebar-width, 280px)) !important;
    max-width: none !important;
  }
  ```
- 在左侧栏折叠状态：
  ```css
  html[data-omnimux-conversation-collapsed][data-omnimux-left-collapsed] .dshDesktopRightbarSurface [class*="_panel"]:not([class*="bottom"]):not([class*="Hidden"]) {
    left: 0 !important;
    right: 0 !important;
    width: 100vw !important;
    max-width: none !important;
  }
  ```
确保面板左侧永远贴合在左侧导航栏的右边界（280px），杜绝任何内容穿透重叠，右侧占满剩余视口。

### 2.2 视图默认单图大画布与底部悬浮输入框
1. `media-viewer-store.js` 默认 `subViewMode` 设为 `'single'`，默认即为图 4 样式的大图居中画布；
2. 触发进入画布模式时，设置 `layoutMode = '2col'`，底部居中浮现带有时间标签、素材预览与模型选择的悬浮输入框；
3. 顶部工具栏在单图模式下居中展示常用操作快捷胶囊（`+ 添加评论`、`🪄 移除背景`、`◇ 移除`、`⤢ 调整大小`），对标用户图 4 完整创作流。

### 2.3 卡片悬浮胶囊定位强固
卡片悬浮胶囊按钮增加 `top: auto !important; bottom: 10px !important; right: 10px !important;`，保证其稳固驻留在卡片右下角。

## 3. 验收标准（Acceptance Criteria）
- **AC-1（左栏无重叠遮挡）**：在全屏画布模式下，左侧导航栏（0~280px）清晰可见，媒体画布严格从 280px 起始绘制，无任何元素被挤压到左侧栏下方。
- **AC-2（单图居中大画布）**：进入画布模式后，当前生成的图片在画布中央居中自适应缩放展示，左侧配有 70px 胶卷缩略图栏。
- **AC-3（底端输入框悬浮居中）**：画布正下方呈现水平居中的微调输入框，对标图 4 示意。
- **AC-4（卡片按钮右下角）**：消息气泡卡片上的「🎨 画布」按钮在 hover 时精准浮现在卡片右下角。
