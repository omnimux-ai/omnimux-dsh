# 官方侧栏面板行折叠进「更多」菜单

## 1. 目标与背景（Objective）

官方 DSH 左侧栏自带两行面板入口：`插件`（`id: 'plugins'`，order 0）与 `自动化任务`（`id: 'schedules'`，order 10）。它们是官方内置入口，不是 OmniMux 产品入口，与下方自定义行混排会让侧栏第一屏被官方入口占满。

用户要求：这两行暂时不显示；`自动化任务` 改为在「更多」菜单里提供。

约束（决定实现路径）：

- 官方 `packages/` 只读，不能改 `ui-sidebar` / `ui-schedule` / `ui-plugin-manager`；
- 官方 pin 机制无法隐藏 `插件` 行：`setPinned` 对固定面板 id 直接 return；
- 官方 DOM 不暴露面板 id（列表 slot 渲染后每个面板行没有 per-entry 标记），所以按 id 匹配 DOM 行不可行；
- 仓规禁止 `HIDDEN_*` / `LEGACY_*` 黑名单式遮盖。

因此采用「折叠」而不是「按 id 隐藏」：

1. 侧栏面板列表里**除「更多」行之外的面板行**一律不渲染（纯 CSS，`aria-haspopup="menu"` 是官方「更多」行的稳定特征）；
2. 「更多」菜单把自己收到的官方 owner props（`entries` + `onOpen`）渲染成菜单行 —— 官方清单就是单一真源，不复制 id、不硬编码文案；
3. `插件` 行折叠后不丢功能：官方 `ui-entry-customization` 已在「更多」里提供「浏览更多插件」行。

## 2. 交互旅程与期望界面反馈

- 展开态侧栏：「新会话」下方直接是自定义行（项目 / 数字人 / …），官方面板行不再出现；「更多」行保留在面板列表位置。
- 收起态轨道：同样只剩「更多」图标，不出现插件 / 自动化任务图标。
- 点「更多」：菜单最上方是折叠进来的官方面板行（`自动化任务`），其后是 OmniMux 的 10 项入口，中间一条分隔线。
- 点「自动化任务」：官方菜单先关闭，再走官方 `onOpen('schedules')` 选中该面板，与官方行点击一致。
- 官方若新增第三个面板：它同样折叠进「更多」，不会同时出现在侧栏行与菜单里。

## 3. 实现方案

- `plugins/omnimux/src/client/sidebar-panel-chrome.js`：新增一条规则，隐藏面板列表内除「更多」以外的面板行（`display: none`，不区分展开 / 收起态）。
- `plugins/omnimux/src/client/explore-more-menu.jsx`：内容组件接收官方 owner props `entries` / `onOpen`，把 `entries` 渲染成菜单行（`current` 取 `entry.active`，点击先 `onDismiss()` 再 `onOpen(id)`），并在折叠块之后给 OmniMux 自己的第一行加分隔线。
- 图标：折叠行使用单一通用面板图标（不按 id 映射图标，避免第二份 id 清单）。

## 假设

- **假设 A（折叠可覆盖全部官方面板行）**：官方面板列表里除「更多」行以外的行都带 `panelRow` 且不带 `aria-haspopup="menu"`，因此「隐藏所有非更多面板行」等价于「隐藏官方面板行」，不需要按 id 或文案匹配，也就不会随语言或新增面板漂移。
- **假设 B（owner props 足够）**：官方传给 `sidebar.panellist.actions` 的 `entries`（含 `id` / `label` / `pinned` / `active`）与 `onOpen(id)` 足以在菜单里重建一行官方面板入口，且 `onOpen` 与官方行点击等价。

## 证伪方式

- **证伪 A**：真实浏览器里统计面板列表内 `panelRow` 的可见数量。若仍有官方行可见，或「更多」行被误隐藏，则改为按「行内图标特征」收窄选择器，并补一条「更多行必须可见」的反例断言。
- **证伪 B**：真实浏览器里点菜单里的「自动化任务」，读 `layout` 的 `activePanelId`。若未切到 `schedules`，则改为在菜单行里直接调用官方 `selectPanel`，绝不改成自绘导航。

## 验收

- [ ] AC-1：展开态侧栏不出现 `插件` / `自动化任务` 行，`更多` 行仍可见。
- [ ] AC-2：收起态轨道同样不出现这两行。
- [ ] AC-3：「更多」菜单首行是折叠进来的官方面板行，点击后官方 `activePanelId === 'schedules'`。
- [ ] AC-4：折叠块与 OmniMux 10 项之间有分隔线，10 项文案与顺序不变。
- [ ] AC-5：无 `entries` 时（老宿主 / 直接渲染）菜单仍渲染 10 项，不报错。

## 旧标准变更

- `plugins/omnimux/src/client/sidebar-panel-chrome.test.js` :: `收起态排除：度量规则只在没有 data-sidebar-collapsed 时命中`
  - 原断言：CSS 里**每一条**含 `panelRow` / `panelGlyph` 的规则行都以 `html:not(:has([data-sidebar-collapsed]))` 开头。
  - 必须改的理由：本次新增的「隐藏非更多面板行」规则在展开态与收起态都必须生效（轨道上也不该留面板图标），因此它不能带收起态排除前缀；原断言把「所有面板规则都排除收起态」写死，会把这条隐藏规则判成回归。
  - 新期望证据：断言只覆盖**度量类**规则（`min-height` / `padding` / `gap` / `border-radius` / `font-size` / `width` 等），逐条仍要求带收起态前缀；隐藏规则单独由新用例断言「不带收起态前缀且只在侧栏作用域内」，即两种状态都隐藏。
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `折叠块之后断开一条分隔线，产品入口内部原有分组不变`
  - 原断言：`menu.rows.slice(2)` 的 `separatorBefore` 逐项等于 `EXPECTED_SEPARATORS`（产品入口自身分组，首项为 `false`）。
  - 必须改的理由：折叠块与产品入口之间要断开一条分隔线，产品入口第一行因此带 `separatorBefore: true`；原断言把「首行不画线」写死，会把这条新分隔线判成回归。
  - 新期望证据：`slice(2)` 的分隔线 = `[true, ...EXPECTED_SEPARATORS.slice(1)]` —— 首行由折叠块边界画线，其余分组位置逐项不变；并单独断言 `slice(2)[0].separatorBefore === true` 说明它来自折叠块边界。

- `plugins/omnimux/src/client/sidebar-panel-chrome.test.js` :: `官方面板行折叠：非「更多」面板行在展开态与收起态都不显示`
  - 原断言：按行文本匹配（`split('\n')` 后逐行找 `panelRow` + `display: none`）。
  - 必须改的理由：CSS 是块结构，规则的选择器与声明不在同一行，按行匹配会把选择器与 `display: none` 拆开、取不到同一条规则；改为先按 `}` 拆成「选择器 + 声明块」再断言，判据（只有一条隐藏规则、只隐藏非更多行、限定侧栏作用域、不带收起态排除）完全不变。
  - 新期望证据：用 `cssRules()` 解析后仍断言 `hideRules.length === 1`、选择器含 `:not([aria-haspopup="menu"])`、含侧栏作用域、不含 `data-sidebar-collapsed`。

- `tests/e2e/official-panel-fold.e2e.test.mjs` :: `E2E: 折叠在展开态与收起态都生效（规则不带收起态排除）`
  - 原断言：按字面量 `panelRow` 定位隐藏规则。
  - 必须改的理由：生产 CSS 的选择器走 `PANEL_ROW_SELECTOR` 常量插值，源文件里没有字面量 `panelRow`，按字面量匹配取不到规则。改按常量名 `PANEL_ROW_SELECTOR` + `display: none` 定位，判据（只有一条折叠规则、不带收起态排除、限定侧栏作用域）不变。
  - 新期望证据：`hideRules.length === 1`、规则不含 `data-sidebar-collapsed`、规则含 `SIDEBAR_SCOPE`。
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `官方面板行排在产品入口之前，文案取自官方 entries（不硬编码）`、`点击官方面板行：先 onDismiss，再走官方 onOpen(id)`、`选中态：官方 entries 的 active 透传为 current`
  - 原断言：三例都基于「两行官方面板（插件 + 自动化任务）都渲染」——首行是 `插件`、点击两行分别 `open:plugins`/`open:schedules`、两行各自透传 `active`。
  - 必须改的理由：用户最终决策是官方「插件」行**彻底隐藏**（产品已有自研插件管理模块），只有「自动化任务」进菜单。原断言把「两行都渲染」写死，会把白名单过滤判成回归。
  - **实际处置：整组删除，改为轻量源码断言**。实测发现：在本文件里新增渲染型 describe（走 jsdom + esbuild bundle 路径）会让整个测试进程挂住（`exit code 143`，CI `Plugin tests (hub)` 分片两次复现）。因此渲染行为由既有 4 组 describe 覆盖，白名单本身改由 `describe(\`官方面板行白名单\`)` 三条源码文本断言验证：白名单只含 `schedules`、过滤用 `has()` 白名单而非黑名单、不得原样渲染全部 entries。
  - 新期望证据：`node --test plugins/omnimux/src/client/explore-more-menu.test.js` 19/19 通过且进程正常退出（不再挂住）。

## 证据计划

`node --test plugins/omnimux/src/client/explore-more-menu.test.js`、`node --test plugins/omnimux/src/client/sidebar-panel-chrome.test.js`、真实 Chrome 验收（PNG + JSON）。

## 合并冲突解决（2026-10-28）

`main` 在等待评审期间合入了 Alpha 标识改动（`exploreMoreMenuLabel`），与本任务的 `panelRowIcon` 落在 `explore-more-menu.jsx` 同一位置，产生内容冲突。

- 冲突文件：`plugins/omnimux/src/client/explore-more-menu.jsx`（唯一一处）。
- 解决原则：**两边都保留**——`panelRowIcon`（本任务：官方面板行图标）与 `exploreMoreMenuLabel`（main：Alpha 标识）是两个独立函数，无逻辑交叠，不存在取舍。
- 拒绝的做法：取任一侧（会丢功能）、重新排序（会破坏各自的注释与调用点）。
- 期望证据：合并后两函数同时存在；`explore-more-menu.test.js` 与 `sidebar-panel-chrome.test.js` 全绿；Alpha 标识与面板行折叠在同一次渲染中互不干扰。

## 决策变更（2026-10-28，用户确认）

原实现把官方面板行（`插件` / `自动化任务`）**全部**迁入「更多」菜单。用户最终决策：

- **官方「插件」行彻底隐藏**——产品已有自研插件管理模块，官方入口不需要。
- **「自动化任务」保留在「更多」菜单**，继续复用官方 `onOpen`。

因此 `explore-more-menu.jsx` 对官方 `entries` 加一层白名单：只放行 `id === 'schedules'`，其余丢弃。

### 为什么用白名单而不是黑名单

- 白名单表达「菜单里只该有自动化任务」这一明确意图；黑名单只挡 `plugins`，官方将来新增面板会自动冒出来，属于未经决策的暴露。
- 与 `sidebar-panel-chrome.js`「隐藏所有非更多面板行」的收敛语义一致。

### 与 main（Alpha 标识）的冲突处理

`main` 同期合入 `exploreMoreMenuLabel`（Alpha 内测标识），与本任务的 `panelRowIcon` 落在同一文件同一位置。**两边都保留**：两个函数无逻辑交叠，分别负责行图标与行文案后缀。

### 验收标准（本次变更）

- [ ] 官方 `entries` 含 `plugins` + `schedules` 时，菜单只渲染「自动化任务」，不渲染「插件」。
- [ ] 「插件」行在侧栏仍被 `sidebar-panel-chrome.js` 的 CSS 隐藏（`display: none`）。
- [ ] 「自动化任务」仍带 Alpha 标识与面板图标。
- [ ] `entries` 为空或缺失时，菜单仍渲染产品入口且不崩。

## CI 卡死排查（2026-10-28）

合并 main（含 #3847 的 4 分片并行）后复跑 CI，`Plugin tests (hub)` 分片仍以 `exit code 143`（SIGTERM 超时）失败，其余 3 分片通过。

已排除：
- 依赖缺失：用主检出完整依赖跑 worktree 的测试文件，仍卡死。
- CI 环境：3 个分片正常。
- 白名单定义顺序：第 70 行定义、137 行使用，正确。
- 测试 helper：与主检出逐字一致。

待定：新增的 `describe('折叠的官方面板行')` 块是否根因。用截断版二分验证。
