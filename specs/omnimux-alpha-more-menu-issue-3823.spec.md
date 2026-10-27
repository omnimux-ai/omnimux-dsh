# 官方「更多」菜单为 Alpha 内测插件补可见标识（Issue #3823）

## 目标与成功标准

Alpha 名单（`plugins/omnimux/src/plugin-lifecycle.json`）与生产排除早已就位，但用户侧看不到任何内测标识：
`markAlphaEntry` 打的徽标挂在收敛行元素上，而该元素从不插入 DOM；官方「更多」菜单只渲染 `icon` + `children`。
本任务把内测标识补到**用户真正看得见的那一面**——官方「更多」菜单的行内。

- 官方「更多」菜单里 5 个 Alpha 项（账号 / 发布 / 数据分析 / 任务表单 / 自动化）行内出现 `Alpha` 标识；
- 非 Alpha 的 5 项（应用 / 视频剪辑 / 产品库 / 手机管理 / 社交采收）不出现标识，行文案与顺序逐字不变；
- 标识带 `Alpha · 内测：开发阶段优先完善非 Alpha 功能；正式版不包含此功能。` 的悬停说明；
- Alpha 判定唯一真源仍是 `plugin-lifecycle.json`，菜单面复用 `isAlphaEntry()`，不新建第二份名单；
- 既有 10 项菜单测试与点击行为零退化。

## 现状（为什么现在看不见）

| 层 | 现状 |
|---|---|
| Alpha 名单 | `plugin-lifecycle.json` 已登记 5 个 `stage: 'alpha'` |
| 侧栏常驻行 | `markAlphaEntry()` 给元素加 `[data-release-stage="alpha"]` + `.omnimux-sidebar-alpha-badge`，但这些元素被收敛、**不入 DOM**（`sidebar-coordinator.test.js` 断言 `parentElement === null`） |
| 官方「更多」菜单 | 行内容只由 `MenuItemButton` 的 `children` 渲染进 `.itemLabel`，没有第二渲染面 |
| 结果 | 5 个内测插件在界面上**零标识** |

## 范围

改：

- `plugins/omnimux/src/client/sidebar-coordinator.js`：导出 `ALPHA_DESCRIPTION`（说明文案真源），供菜单面复用，不复制第二份。
- `plugins/omnimux/src/client/explore-more-menu.jsx`：Alpha 项的行内容改为「文案 + 标识」片段，判定走 `isAlphaEntry(item.entryId)`。
- `plugins/omnimux/src/client/styles.js`：标识样式追加到 `HUB_CSS`，颜色走官方 `--dsw-alias-*` Token，字号 12px。
- `plugins/omnimux/src/client/explore-more-menu.test.js`：新增标识渲染回归（Alpha 项有、非 Alpha 项无、文案不丢）。
- `scripts/verify-explore-registration-browser.mjs`：行文案提取改为读文本内容；新增「标识只出现在 Alpha 项」断言。
- `docs/contracts/sidebar-extra-entries.md`：Alpha 内测标记一节补记「更多」菜单这一渲染面。

不改：

- Alpha 名单与发布排除策略（`plugin-lifecycle.json`、`sync-to-app.sh`、`sync-stable.sh`、桌面 `stage-preset-profile.ts`）；
- 官方菜单行原语、seat、order、分组与点击委托；
- 任何插件功能与页面内部。

## 用户旅程

1. 点开侧栏官方「更多」菜单。
2. 「账号」「发布」「数据分析」「任务表单」「自动化」五行末尾各有一个 `Alpha` 小标签。
3. 悬停该标签，显示「Alpha · 内测：开发阶段优先完善非 Alpha 功能；正式版不包含此功能。」
4. 「应用」「视频剪辑」等五行没有标签，文案与顺序与改动前逐字一致。
5. 点击任一行的行为不变（先关菜单，再走既有激活委托）。

## 技术落点

- 判定：`isAlphaEntry(id)` 已能把 `omnimux-<x>-entry` 解析为插件 id 并查 `plugin-lifecycle.json`；菜单项自带 `entryId`，直接复用，不新增名单或第二个判定函数。
- 渲染：`MenuItemButton` 的 `children` 从纯字符串改为「文案 span + 标识 span」片段；非 Alpha 项保持纯字符串，零变化。
- 样式：追加到 `styles.js` 的 `HUB_CSS`（`injectHubStyles()` 已由 hub `apply()` 注入），不新建第二个 `<style>` 注入点。
- 无障碍：标识文本 `Alpha` 本身可被读屏读到，`title` 承载完整内测说明。

## 新用户基线

只依赖正式安装的 `omnimux` 插件与官方宿主提供的 `sidebar.panellist.actions` seat。宿主没有该 seat 时菜单整体不注册（既有行为），标识随之不出现——不会出现「有标识没有入口」的半成品状态，也不依赖任何开发机配置。

## 命令与测试策略

- 组件回归：`node --test plugins/omnimux/src/client/explore-more-menu.test.js`
- 协调器回归：`node --test plugins/omnimux/src/client/sidebar-coordinator.test.js`
- 插件套件：`pnpm --filter omnimux test`
- 静态：`node scripts/verify-plugin-boundaries.mjs`、`node --test scripts/verify-anti-slop.test.mjs`
- 真实浏览器（本工作树内、动态端口、自清理）：`node scripts/verify-explore-registration-browser.mjs`，保留 PNG + JSON 报告

## 假设

官方 `MenuItemButton` 的 `children` 渲染进 `.itemLabel`（`flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`），因此在其内部放「文案 + 尾部标签」的 flex 片段不会被裁掉；宿主 `0.2.1-rc.3` 的该组件只接受 `icon` / `children` / `shortcut` / `separatorBefore` / `onSelect` / `disabled` / `danger`，没有第二个尾部内容插槽，`children` 是唯一可行位置。同时 `plugin-lifecycle.json` 是 Alpha 的唯一真源，`isAlphaEntry()` 对菜单项的 `entryId` 能正确解析。

## 证伪方式

若把标识放进 `children` 后，真实浏览器里 Alpha 项的行文案被截断、标签不可见或被挤出行外，说明 `.itemLabel` 的单行省略约束吃掉了尾部内容——此时改用把标签放进 `icon` 容器的方案，并把结论写回本规格。若 `isAlphaEntry(item.entryId)` 对 5 个 Alpha 项返回 false 或对非 Alpha 项返回 true，说明 `entryId` 与 `-entry` 后缀约定不一致，需改按 `item.pluginId` 判定。可执行验证：`node scripts/verify-explore-registration-browser.mjs`（断言 5 个 Alpha 项有标签、5 个非 Alpha 项无标签、行文案逐字不变），以及 `node --test plugins/omnimux/src/client/explore-more-menu.test.js`。

## 旧标准变更

`plugins/omnimux/src/client/explore-more-menu.test.js` 的两条既有用例把「行内容必须是纯字符串」当作契约；本任务按产品要求给 Alpha 项的行内容加尾部标签，该形态必然不再是纯字符串，两条断言随实现前移：

- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `10 行文案与顺序逐字等于真源清单`
  - 原断言：`assert.deepEqual(menu.rows.map((row) => row.children), EXPECTED_LABELS)`，要求每行 `children` 与真源文案数组逐字相等。
  - 必须改的理由：Alpha 项的行内容改为「文案 + 标识」片段，`children` 不再是字符串；若不放宽，等于要求内测标识无法渲染。
  - 新期望证据：改为从行内容里提取文案文本后与 `EXPECTED_LABELS` 逐字比较（文案本身仍必须逐字一致），并**新增**一条断言要求 Alpha 项同时带标识、非 Alpha 项不带。
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `行图标沿用清单里的受信 iconSvg，行文案按纯文本渲染`
  - 原断言：`assert.equal(typeof row.children, 'string', 'label 只按纯文本交给 React')`，对全部 10 行要求 `children` 是字符串。
  - 必须改的理由：同上，Alpha 行内容为片段；该断言的原意是「文案不得拼进 HTML」，这条约束用「文案文本逐字相等 + 标识是独立元素」表达更准确，不靠「整体必须是字符串」。
  - 新期望证据：断言非 Alpha 行的 `children` 仍是纯字符串（零变化），Alpha 行的文案文本与真源逐字相等且标识为独立元素、不带 HTML 注入。

- `tests/e2e/alpha-more-menu-badge.e2e.test.mjs` :: `E2E: Alpha 判定真源仍是生命周期注册表，菜单面不复制第二份名单`
  - 原断言：`assert.doesNotMatch(menu, /plugin-lifecycle\.json/)`，要求菜单模块源码里不出现 `plugin-lifecycle.json` 这个字符串。
  - 必须改的理由：该正则同时命中新写的注释文本（注释里说明「真源仍是 `plugin-lifecycle.json`」），把「不得 import 注册表」误判成「不得提到它」。断言点应指向 import 语句而不是任意出现。
  - 新期望证据：改为 `/^\s*import\b[^\n]*plugin-lifecycle\.json/m` 的 `doesNotMatch`，即菜单模块不得 import 生命周期注册表；同时保留「必须复用 `isAlphaEntry`」「不得内联 `stage === 'alpha'`」「不得有第二份 Alpha 名单常量」三条。

- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `9 行文案与顺序逐字等于真源清单`
  - 原断言（`origin/main` 当前版本）：`assert.deepEqual(menu.rows.map((row) => row.children), EXPECTED_LABELS)`，要求每行 `children` 与真源文案数组逐字相等。
  - 必须改的理由：本任务把 Alpha 项行内容改成「文案 + 标识」片段，`children` 不再是字符串；不放宽等于要求内测标识无法渲染。9 项计数与文案集合本身不变（产品库并入资产库已由 `origin/main` 完成）。
  - 新期望证据：文案比较改走 `labelTextOf(row.children)`，仍与真源清单逐字相等；`TRUTH.length` / `menu.rows.length` / `[data-stub-row]` 计数保持 9。

- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `运行时注册项出现在菜单末尾`
  - 原断言：`menu.rows.length === 10`（未注册）与 `=== 11`（注册后）。
  - 必须改的理由：合并 `origin/main` 的 #3816 后菜单真源从 10 项变 9 项，行数随之各减一；这不是放宽标准，而是断言点随真源一起前移。
  - 新期望证据：未注册 9 行、注册后 10 行；`labels.at(-1) === '快讯中枢'`、`labels.at(0) === '应用'` 保持不变。

- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `注销后注册项从菜单消失，回到 10 行`
  - 原断言：注册后 `=== 11`、注销后 `=== 10`，用例名写死「回到 10 行」。
  - 必须改的理由：同上，真源 9 项后行数各减一；用例名同步改为「回到 9 行」，避免名字与断言自相矛盾。
  - 新期望证据：注册后 10 行、注销后 9 行；注销项不再渲染的断言保留。

- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `与内置 id 冲突的注册项不出现（内置文案不被冒充）`
  - 原断言：`menu.rows.length === 10`。
  - 必须改的理由：同上，真源 9 项后冲突注册不新增行，总行数为 9。
  - 新期望证据：`menu.rows.length === 9`；首项仍为「应用」、冒充项不出现两条断言保留。

- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `分组分隔线：上一项 dividerAfter 决定下一行 separatorBefore`
  - 原断言：`assert.deepEqual(SEPARATOR_OWNERS, ['产品库', '数据分析'], '视频剪辑后、手机管理后各一条分隔线')`。
  - 必须改的理由：`origin/main` 的 #3816 把产品库并入资产库，菜单真源里不再有「产品库」，分隔线拥有者前移为「发布」与「数据分析」（`main` 上已是这个值，本分支的旧值来自合并前）。
  - 新期望证据：与 `origin/main` 一致为 `['发布', '数据分析']`；`EXPECTED_SEPARATORS` 与首行不画线两条断言保留。

- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `Alpha 内测项带行内标识，非 Alpha 项保持纯字符串文案（Issue #3823）`
  - 原断言（本任务上一版）：`plainLabels` 期望 `['应用', '视频剪辑', '产品库', '手机管理', '社交采收']` 共 5 项。
  - 必须改的理由：合并 `origin/main` 的 #3816 后菜单只剩 9 项、非 Alpha 项变为 4 项（产品库已并入资产库）。Alpha 项 5 项不受影响。
  - 新期望证据：`plainLabels` 期望 `['应用', '视频剪辑', '手机管理', '社交采收']`；`alphaLabels` 仍为 `['发布', '账号', '数据分析', '自动化', '任务表单']`，标识元素计数仍为 5。
