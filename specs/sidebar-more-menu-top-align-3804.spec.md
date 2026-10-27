# 「更多」菜单顶部对齐触发按钮（#3804）

## 1. 目标与背景（Objective）

#3802 把官方「更多」菜单从侧栏列下方挪到了侧栏列右侧，方向对了，但纵向仍沿用官方 `side:'bottom'`：菜单顶边落在「更多」行**下方** 4px，于是菜单第一行比按钮低一整行，看起来像挂在按钮的下半截。

用户要求：菜单**顶边对齐按钮顶边**。

目标：

1. 菜单顶边与「更多」按钮（官方 `moreAnchor`）顶边对齐，误差 ≤ 1px。
2. 纵向仍然受视口约束：菜单底边不得越过视口下留白，顶边不得越过视口上留白。
3. 横向行为（#3802 的右侧弹出、收窄、留白）不变。

非目标：不改菜单条目、材质、宽度；不改官方 `Menu` 源码。

## 2. 交互旅程与期望界面反馈

- 点「更多」→ 菜单在侧栏右侧展开，第一行（`浏览更多插件`）与按钮同一水平线，不再低一行。
- 菜单较长、贴着窗口底部时，整体上移量按视口下留白收住，不会被推出屏幕。
- 窗口很高时，菜单顶边仍精确对齐按钮顶边，不出现多余偏移。

## 3. 实现方案

`computePanelMenuPlacement` 增加纵向分量：`anchorTop` / `menuTop` / `menuHeight` / `viewportHeight`，返回 `offsetY`。规则：

1. 目标顶边 = 按钮顶边 → `offsetY = anchorTop − menuTop`（通常为负，向上挪）；
2. 夹到视口内：`offsetY` 使得 `menuTop + offsetY ≥ margin` 且 `menuTop + offsetY + menuHeight ≤ viewportHeight − margin`；
3. 菜单比可用高度还高时贴顶（`top = margin`），交给官方自身的 `max-height` + 滚动。

样式侧把 `translate` 从单轴改成双轴，位移仍只走 `translate`（官方每帧写 inline `left/top`，不抢属性）。

## 假设

- **假设 A（锚点可测）**：官方 `moreAnchor` 包裹层就在侧栏列内，其 `getBoundingClientRect().top` 等于按钮顶边；用它而不是按钮本身，避免按钮在 Tooltip 包裹下取不到。
- **假设 B（双轴 translate 不冲突）**：`translate` 的 X、Y 两个分量可以同时由本模块写入，官方 `Menu` 不写该属性，因此纵向对齐不会与它的每帧定位打架。

## 证伪方式

- **证伪 A**：浏览器里对比锚点 `top` 与按钮 `top`，若不等则改用按钮选择器（`[class*="panelRow"][aria-haspopup="menu"]`）。
- **证伪 B**：浏览器里读菜单计算后的 `translate` 与 `getBoundingClientRect().top`，若顶边未对齐或出现抖动，则改为只写纵向 CSS 变量并在官方定位后下一帧应用，绝不改成自绘菜单。

## 验收

- [ ] AC-1：菜单顶边与锚点顶边差 ≤ 1px（真实浏览器）。
- [ ] AC-2：菜单底边 ≤ 视口高 − 12px，顶边 ≥ 12px。
- [ ] AC-3：横向行为不回归（左边界 ≥ 侧栏右边界）。
- [ ] AC-4：单测覆盖对齐、底部收住、顶部收住、非法几何四种情形。

## 旧标准变更

- `plugins/omnimux/src/client/sidebar-panel-chrome.test.js` :: `「更多」菜单去透明：覆盖该实例的材质变量并禁用毛玻璃`
  - 原断言：`translate: var(--omnimux-more-menu-shift, 0) 0`（只校验横向分量，纵向写死 0）。
  - 必须改的理由：本次要求菜单顶边对齐按钮顶边，纵向必须可偏移；把纵向写死 `0` 的断言会把这个新行为判成回归。
  - 新期望证据：`translate: var(--omnimux-more-menu-shift, 0) var(--omnimux-more-menu-shift-y, 0)`，两个分量各自缺省为 0；材质断言（实体底 + `backdrop-filter: none`）保持不变。

## 证据计划

`node --test plugins/omnimux/src/client/sidebar-panel-chrome.test.js`；`node scripts/verify-sidebar-panel-chrome.mjs`（真实 Chrome，PNG + JSON）。
