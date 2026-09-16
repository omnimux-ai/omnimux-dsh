# 规格 · 左侧侧边栏完全收起（Issue #2077）

## 1. 产品意图

这是与宿主原生的**刻意差异**：原生左侧栏收起后会保留一条窄栏（真机实测 90px），而本产品要求**收起即完全收起**，屏左侧不留任何死带，会话区从 x=0 起铺满。

## 2. 实测现状

左右两侧栏都收起时（开发版 1920×1050，CDP 取证）：

| 指标 | 实测值 |
| --- | --- |
| 左侧栏元素 `.dshDesktopSidebarSurface` | `display: none`（插件已正确隐藏） |
| 框架计算列 | `90px 1830px 0px` |
| 会话区起点 / 宽度 | x = 90 / 1830 |

真正的侧栏已隐藏，但框架首列仍占 90px —— 屏左一条 90px 空白死带。

## 3. 根因

`sidebar-toggle-topbar.js` → `applyTopbarToggleCssVars()`：

```js
const sidebarWidth = nativeFrame
  ? (readShellRailWidthPx(doc) ?? (layout.collapsed ? 0 : Math.max(0, layout.leftRailW || 280)))
  : (layout.collapsed ? 0 : Math.max(0, layout.leftRailW || 280))
```

只要原生 frame 存在，就**无条件采信壳层内联首列宽**，用自己的读数覆盖了自己的收起意图。左侧栏收起后壳层把首列写成 `90px`，该值经 `--omnimux-sidebar-width` 流入：

```css
.dshDesktopFrame[data-rightbar-collapsed="true"] { grid-template-columns: var(--omnimux-sidebar-width, 280px) minmax(0px, 1fr) 0px !important; }
```

于是 90px 被钉进首列。同一根因还导致：右侧栏全屏面板左缘停在 x=90、输入框投射横向基准偏移 90px。

旁证：样式表内三条把首列写成字面 `0px` 的规则，在浏览器 CSSOM 中**声明块为空**（选择器在、声明被解析器丢弃），不参与层叠，无法兜底。

## 4. 修法

**收起意图优先于壳层读数。** 当 `layout.collapsed` 为真（含显式收起意图）时，镜像 `0px`；否则维持原有「读壳层真实栏宽、退化到 `leftRailW || 280`」的行为。

单点修复即同时覆盖首列死带、全屏面板左缘、输入框投射三处消费方。

## 5. 验收标准

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| AC-1 | 收起意图为真 | `--omnimux-sidebar-width` 为 `0px` |
| AC-2 | 收起意图为真 + 右侧栏收起 | 框架计算列为 `0px minmax(0px, 1fr) 0px` |
| AC-3 | 收起意图为假（左栏展开） | 镜像值仍等于壳层真实栏宽，行为不回归 |
| AC-4 | 左侧栏完全收起 | 右侧栏全屏面板左缘为 0 |
| AC-5 | 实机左右栏都收起 | 屏左侧无残留窄条，会话区起点为 0 |

## 6. 非目标

- 不改宿主 AppFrame 的网格计算与拖拽逻辑；
- 不改 `data-omnimux-conversation-collapsed` 的置位规则；
- 不删除既有的字面 `0px` 规则（本次不做无关清理）。
