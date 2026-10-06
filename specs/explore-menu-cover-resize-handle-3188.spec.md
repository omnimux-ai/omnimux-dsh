# Spec: 探索悬浮菜单不得盖住外壳分隔线手柄（Issue #3188）

## 背景
左侧栏「探索」入口悬停展开的浮层菜单（`.omnimux-explore-menu`，z-index 500）贴边弹出时盖住外壳分隔线手柄（`.dshDesktopResizeHandle`，z-index 50，宽 8px 跨分割线 ±4px）。菜单打开期间，分割线被覆盖段无法命中、不可拖拽。

## 用户操作旅程
1. 用户悬停「探索」，菜单向右弹出。
2. 用户把鼠标移到左侧栏与中间栏分割线、与菜单重叠的高度。
3. 光标应变 col-resize，按住可拖动改变左侧栏宽度。

## 验收标准
- 探索菜单展开状态下，分割线手柄在任意高度 `elementFromPoint` 命中栈顶部均为 `dshDesktopResizeHandle`。
- 菜单展开时合成拖拽仍改变侧栏宽度。
- 菜单点击/悬停/收起行为不变（`sidebar-coordinator.test.js` 相关用例全绿）。
- 手柄仅 8px 宽，不得遮挡菜单项的可达性与视觉。

## 实现方案
在 `EXPLORE_STYLES` 中声明 `.dshDesktopResizeHandle { z-index: 510 !important; }`，使手柄层级高于菜单（500）。手柄仅 8px 宽，不挡菜单项。

## 验证
- `node --test plugins/omnimux/src/client/sidebar-coordinator.test.js`（工作树内）
- 真机复测：Dev App（CDP 9229）打开探索菜单后 `elementFromPoint(280, y)` 全高度命中 `dshDesktopResizeHandle`。
