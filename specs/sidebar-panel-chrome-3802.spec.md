# 侧栏官方 panel 行对齐产品行度量 + 「更多」菜单右侧弹出与实体底（Issue #3802）

## 1. 目标与背景（Objective）

侧栏现在同时存在两套行度量：

- **产品自定义行**（项目 / 数字人 / 技能·专家 / 资产库 / 灵感社区）：32px 高、8px 圆角、`0 8px` 内边距、14px 图标、14/20 字阶、`margin: 0 4px`（`packages/dsh-ui-kit/src/stage/createSidebarEntry.ts`）。
- **官方 panel 行**（插件 / 自动化任务 / 更多）：36px 高、12px 圆角、`7px 8px` 内边距、16px 图标、`margin: 0 2px`（`ui-sidebar` 的 `.panelRow`）。

两套行上下相邻，观感是「一高一低、一圆一方」。用户要求把官方三行统一到产品行度量。

同时，官方「更多」菜单以 `portal` + `side:'bottom'` 从锚点**下方**展开，压在侧栏内容上；材质是半透明 + `backdrop-filter` 毛玻璃，底下侧栏文字透出来。用户要求改为**从侧栏右侧弹出**、并**取消透明效果**。

目标：

1. 展开态下官方三行与产品自定义行逐项同度量（高度 / 圆角 / 内边距 / 外边距 / 图标 / 字阶 / 行内间距）。
2. 收起态轨道（56px）保持官方 36×36 居中图标，不被文字行度量撑回横条。
3. 「更多」菜单整体出现在侧栏列右侧（菜单左边界 ≥ 侧栏右边界 + 8px），视口过窄时做钳制不溢出。
4. 该菜单底色为实体不透明色，计算样式 `backdrop-filter` 为 `none`。
5. 材质覆盖**不外溢**到其它官方浮层。

非目标：不改官方 `packages/`；不改「更多」菜单条目清单 / 顺序 / 分组 / 点击委托；不改收起态行度量；不改其它浮层材质。

## 2. 交互旅程与期望界面反馈（User Journey & UI Feedback）

### 旅程 1：展开态侧栏上下两套行视觉一致

- 侧栏展开，`插件 / 自动化任务 / 更多` 三行与 `项目 / 数字人 / 技能·专家 / 资产库 / 灵感社区` 行并排。
- 每行高度 32px、圆角 8px、左右内边距 8px、外边距 4px、图标 14×14、文字 14px/20px、图标与文字间距 6px。
- Hover 时同一组 hover 令牌；当前页对应行的选中底色与产品行 active 同源（`--dsw-alias-interactive-bg-active`），字重 500。

### 旅程 2：收起态轨道不受影响

- 侧栏收起为 56px 轨道（`[data-sidebar-collapsed]` 存在），三行仍是 36×36 居中图标，无文字、无横向内边距。

### 旅程 3：点开「更多」菜单从侧栏右侧弹出

- 用户点「更多」行 → 菜单展开，左边界落在侧栏列右侧（间隙 8px），纵向仍贴着「更多」行的位置。
- 窗口变窄到放不下时，菜单退回靠右留白内，绝不越出视口右边界，也不出现负位移（不会反向压回侧栏）。
- 菜单关闭后不残留位移变量造成的视觉变化。

### 旅程 4：菜单实体底，不透出底层文字

- 菜单底色为不透明层色，`backdrop-filter` 为 `none`；macOS 桌面下官方为毛玻璃准备的实体 backing 与菜单本体同步位移，不在原位置留下色块。

## 3. 实现方案（Implementation）

1. 新增 `plugins/omnimux/src/client/sidebar-panel-chrome.js`：
   - `PANEL_ROW_METRICS` 为产品行度量唯一真源常量；
   - `PANEL_CHROME_CSS` 注入两条规则集：展开态 panel 行度量对齐（`html:not(:has([data-sidebar-collapsed]))` 限定）、「更多」菜单实体底 + `translate` 位移；
   - `computePanelMenuOffset({ sidebarRight, menuLeft, menuWidth, viewportWidth })` 纯函数：目标左边界 = 侧栏右 + 8px，位移不为负，且推完不越过视口右留白 12px，放不下则退回 0；
   - `positionPanelMenu(menu, doc)` 只写自定义属性，不碰 React 每帧写入的 inline `left/top`；
   - `installSidebarPanelChrome(doc)`：幂等注入样式 + 一个 `document.body` **直接子节点**观察器（官方菜单 portal 到 body），菜单出现即逐帧跟随、移除即停。
2. `chrome.js` 的 `installHubChrome()` 里安装并纳入卸载链。
3. 合同同步 `docs/contracts/sidebar-extra-entries.md`。

单一真源：行度量只在 `PANEL_ROW_METRICS` 定义一次，样式与测试都读它；菜单条目与点击委托仍由 `sidebar-coordinator.js` 提供，本模块不复制。

## 4. 验收用例（Acceptance）

- [ ] AC-1：展开态官方三行 `min-height/padding/margin/gap/border-radius/font-size/line-height` 与产品行逐项相等（32/0 8px/0 4px/6/8/14/20）。
- [ ] AC-2：官方行图标槽与其中 `svg` 计算尺寸为 14×14。
- [ ] AC-3：`[data-sidebar-collapsed]` 存在时上述度量规则不命中（轨道仍 36×36）。
- [ ] AC-4：`computePanelMenuOffset` 常规用例返回「侧栏右 + 8 − 菜单左」；视口过窄时钳制后菜单右边界 ≤ 视口宽 − 12；菜单已在目标右侧时返回 0。
- [ ] AC-5：真实浏览器里点开「更多」菜单，菜单 `getBoundingClientRect().left ≥ 侧栏列右边界`。
- [ ] AC-6：菜单计算样式 `backdrop-filter === 'none'`，且背景色 alpha 为 1（不透明）。
- [ ] AC-7：另一个官方浮层（如设置菜单 / 会话视图菜单）材质不受影响（反例断言）。
- [ ] AC-8：`installSidebarPanelChrome` 二次调用不重复注入样式节点；卸载后观察器不再触发。
- [ ] AC-9：隔离 worktree 真实浏览器截图 + 结构化 JSON 报告落 `docs/evidence/sidebar-panel-chrome-3802/`。

## 假设

- **假设 A（类名命中）**：官方 panel 行类名稳定含 `panelRow` / `panelGlyph` / `panelActive`，菜单 `listClassName` 稳定含 `moreMenu`，因此可在侧栏作用域内用 `[class*="…"]` 精确命中，不影响侧栏外的同名行。
- **假设 B（位移通道）**：菜单横向位置由官方 `Menu` 每帧写入 inline `left`，因此只能靠它不写的 `translate` 覆盖，两者互不覆盖。
- **假设 C（材质作用域）**：只覆盖该菜单实例上的 `--dsw-menu-surface-fill` / `--dsw-menu-backdrop-filter` 即可去透明，且不外溢到其它官方浮层。

## 证伪方式

- **证伪 A**：真实浏览器里统计命中集合，若侧栏内不是 3 行、或命中到侧栏外的元素，则收窄为侧栏列后代选择器并复核命中集合；不扩大到全局裸类名。
- **证伪 B**：真实浏览器里读取菜单的 `translate` 与 `left` 计算值；若位移未生效或菜单仍在侧栏下方，则改为在菜单挂载后的帧序列里按锚点矩形重算，绝不改成自绘菜单。
- **证伪 C**：同时采样其它官方浮层的计算样式，若它们也变不透明或该菜单仍透底，则把覆盖收窄到「侧栏作用域下 `[data-menu-material="translucent"]` 的 moreMenu 实例」并补反例断言。

## 旧标准变更

本任务实现中先写了几条「放不下就不位移」的用例，随后发现那条期望把「菜单压回侧栏」当成了正确结果 —— 与需求「从侧栏右侧弹出来」相反。因此把落位逻辑拆成 `computePanelMenuPlacement`（位移 + 收窄）与只取位移的 `computePanelMenuOffset`，并按下述逐条改写。全部是本任务新增用例，未削弱任何既有仓库用例。

- `plugins/omnimux/src/client/sidebar-panel-chrome.test.js` :: `computePanelMenuOffset：常规把菜单左边界推到侧栏右侧 + 间隙`
  - 原断言：位移 `= 280 + 8 − 8`，`8 + 位移 === 288`。
  - 改的理由：改名为 `placement：常规把菜单左边界摆到侧栏右侧 + 间隙，宽度不变`，断言对象换成 `computePanelMenuPlacement` 并追加「不施加宽度上限」；几何与数值不变。
  - 新期望证据：`offset === 280 + PANEL_MENU_GAP − 8`、`maxWidth === null`、`8 + offset === 288`。
- `plugins/omnimux/src/client/sidebar-panel-chrome.test.js` :: `computePanelMenuOffset：视口过窄时钳制，不越出右留白`
  - 原断言：420px 视口下位移 > 0 且右边界不越界。
  - 改的理由：420px 连最小菜单宽都放不下，任何摆法都会把菜单压回侧栏，该场景另由「连最小可用宽度都放不下」覆盖；原用例改名为 `placement：右侧空间不足时收窄菜单，而不是压回侧栏`，改用 560px 视口验证收窄路径。
  - 新期望证据：`offset === 280 + 8 − 8`、`maxWidth === 560 − 12 − 288`、`288 + maxWidth ≤ 560 − 12`。
- `plugins/omnimux/src/client/sidebar-panel-chrome.test.js` :: `computePanelMenuOffset：侧栏顶到右边界时最多推到留白处，绝不越界也不为负`
  - 原断言：侧栏右 400 / 视口 420 时位移 ≥ 0 且右边界落在留白处。
  - 改的理由：该几何本身无法满足「菜单整体在侧栏右侧」，断言改为覆盖最小宽不足分支（改名 `placement：连最小可用宽度都放不下时保持官方位置`）；「不越界」这条约束由 560px 收窄用例承担。
  - 新期望证据：`viewportWidth = 侧栏右 + 间隙 + 留白 + 最小宽 − 1` 时返回 `{ offset: 0, maxWidth: null }`。
- `plugins/omnimux/src/client/sidebar-panel-chrome.test.js` :: `computePanelMenuPlacement：右侧空间不足时收窄菜单而不是压回侧栏`
  - 原断言：420px 视口下的 `offset` 与 `maxWidth`。
  - 改的理由：420px 同时命中「收窄」与「最小宽不足」两个分支，无法区分；改用 560px 只走收窄分支，用例名补标点为 `placement：右侧空间不足时收窄菜单，而不是压回侧栏`。
  - 新期望证据：同上第二条的新期望。
- `plugins/omnimux/src/client/sidebar-panel-chrome.test.js` :: `computePanelMenuPlacement：连最小宽度都放不下时保持官方位置`
  - 原断言：420px 视口返回 `{ offset: 0, maxWidth: null }`。
  - 改的理由：420px 下「保持官方位置」与「收窄」互斥地取决于侧栏宽，用例几何改为「侧栏右 + 间隙 + 留白 + 最小宽 − 1」，名称改为 `placement：连最小可用宽度都放不下时保持官方位置`。
  - 新期望证据：返回 `{ offset: 0, maxWidth: null }`。
- `plugins/omnimux/src/client/sidebar-panel-chrome.test.js` :: `computePanelMenuOffset：菜单已在目标右侧时不动`
  - 原断言：位移为 `0`。
  - 改的理由：断言对象换成 `computePanelMenuPlacement`，并追加「不施加宽度上限」；名称改为 `placement：菜单已在目标右侧时位移为 0`。
  - 新期望证据：返回 `{ offset: 0, maxWidth: null }`。
- `plugins/omnimux/src/client/sidebar-panel-chrome.test.js` :: `computePanelMenuOffset：非法几何一律 0`
  - 原断言：NaN / Infinity / 零宽三种几何位移均为 `0`。
  - 改的理由：改为对 `computePanelMenuPlacement` 断言完整落位对象，覆盖「位移 0 且不收窄」；名称改为 `placement：非法几何一律保持官方位置`。
  - 新期望证据：三种非法几何均返回 `{ offset: 0, maxWidth: null }`。

## 证据计划

| 面 | 命令 |
|---|---|
| 单测 | `node --test plugins/omnimux/src/client/sidebar-panel-chrome.test.js` |
| 静态门禁 | `node scripts/scan-ui-gates.mjs`、`node --test tests/e2e/guard-no-transparent-popover.test.mjs` |
| 包测 | `pnpm --filter omnimux test` |
| 浏览器 | `node scripts/verify-sidebar-panel-chrome.mjs`（真实 Chrome，PNG + JSON） |

## 7. 文档影响

`docs/contracts/sidebar-extra-entries.md`：度量表补「官方 panel 行按产品行度量渲染」，新增「更多菜单放置与材质」小节（右侧弹出、间隙 8px、视口留白 12px、实体不透明底）。
