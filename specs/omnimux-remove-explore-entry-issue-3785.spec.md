# Spec: 移除「探索」常驻行与浮动菜单（入口已迁至官方「更多」菜单）

- Issue: #3785
- 风险级别: R1（客户端侧栏入口移除；触及 `docs/contracts/`；可逆）
- 宿主: OmniMux Dev 2.0.10 / dsh `0.2.1-rc.3`（submodule `1f81c047fc`）
- 依赖: #3774 / PR #3781（10 项已注册进官方「更多」菜单，已合入）

## 1. 目标与用户故事

「探索」常驻行与浮动菜单是官方没有「更多」菜单时的自绘入口。10 项已进官方「更多」菜单后，两处并存是重复入口，按用户决定移除自绘入口：

- 用户看侧栏：不再有「探索」行，也没有悬停/点击弹出的浮动菜单；
- 用户点「更多」：仍是那 10 项（应用 / 视频剪辑 / 产品库 / 发布 / 账号 / 手机管理 / 数据分析 / 自动化 / 任务表单 / 社交采收）；
- 第三方 / 个人插件经 `window.__omnimuxSidebar.registerExploreItem` 注册的项，渲染面从浮动菜单移到「更多」菜单，语义不变。

## 2. 现状与真源

| 事实 | 位置 | 本次动作 |
|---|---|---|
| 常驻探索行（rank 7.2）、浮动菜单、悬停意图延时、防溢出定位、文档级监听、探索样式 | `plugins/omnimux/src/client/sidebar-coordinator.js`（`ensureExploreRow` / `openExploreMenu` / `toggleExploreMenu` / `closeExploreMenu` / `computeExploreMenuPosition` / `EXPLORE_STYLES` / 悬停定时器 / `getExploreEntryForTests`） | **移除** |
| 10 项清单、运行时注册集合、合并函数 | 同文件 `EXPLORE_MENU_ITEMS` / `EXTRA_EXPLORE_ITEMS` / `resolveExploreMenuItems()` | **保留**（唯一真源） |
| 激活三段委托 | 同文件 `activateExploreItem(item)` | **保留** |
| 运行时注册接缝 | 同文件 `registerExploreItem(item)`（`window.__omnimuxSidebar`） | **保留**，渲染面改为「更多」菜单 |
| 官方「更多」菜单注册点 | `plugins/omnimux/src/client/explore-more-menu.jsx` | 保留；注释与文档同步 |
| 旧浮动菜单真实浏览器验收脚本 | `scripts/verify-explore-registration-browser.mjs`（881 行，驱动将被移除的 DOM） | **改造到新渲染面**（见 §3.4） |
| 合同 | `docs/contracts/sidebar-extra-entries.md` | 探索行 occupants、运行时注册、悬停展开三节改写 |

## 3. 实现设计

### 3.1 移除面（`sidebar-coordinator.js`）

删除：`EXPLORE_STYLES`、`createExploreIcon`、`ensureExploreRow`、`exploreEntryElement` 及其 `ROWS.push` 注册、`openExploreMenu` / `toggleExploreMenu` / `closeExploreMenu` / `closeExploreMenuIfOpen`、`computeExploreMenuPosition`、悬停常量与定时器（`EXPLORE_HOVER_*`、`scheduleExploreHover*`、`exploreHoverSuppressed`、`explorePointer*`）、`handleExploreFocusOut`、`exploreMenuElement`、文档级按下/按键监听里只服务浮动菜单的分支、`getExploreEntryForTests`、以及 `install()`/`runPlaceAll()` 中对探索行的调用。

保留：`EXPLORE_MENU_ITEMS`、`EXTRA_EXPLORE_ITEMS`、`resolveExploreMenuItems()`、`activateExploreItem()`、`registerExploreItem()`（注册/注销仍只改集合，不改 DOM）。

### 3.2 接缝语义（不变）

注册项仍在**菜单展开时**被读取（「更多」菜单每次展开重新挂载即读最新集合）；注销后下次展开即消失。`registerExploreItem` 的形状校验、字段白名单、id 冲突规则、返回注销函数全部不变。

### 3.3 测试

- `sidebar-coordinator.test.js`：删除探索行/浮动菜单用例；保留并调整运行时注册集合用例；新增回归用例「侧栏不得再出现探索行」（`ensureExploreRow` 不存在、DOM 无 `#omnimux-explore-entry`、无探索样式节点）。
- `explore-more-menu.test.js`：新增「运行时注册项出现在更多菜单末尾、注销后消失、与内置 id 冲突时不出现」。

### 3.4 浏览器验收脚本改造

`scripts/verify-explore-registration-browser.mjs` 目前把 `sidebar-coordinator.js` 打进页面、驱动已删除的浮动菜单。改造为驱动新渲染面：同一页面骨架内渲染 `createExploreMoreMenuContent({ MenuItemButton })`（React + 官方行原语替身），断言：

1. 未注册时 10 行，文案与顺序等于 `resolveExploreMenuItems()`；
2. `registerExploreItem` 注册后重渲染 → 11 行且新项在末尾；
3. 注销后重渲染 → 回到 10 行；
4. 非法输入不注册、不抛错、菜单不变；
5. 点击行调用激活委托（workbench stub）。

若改造不可行，则退役该脚本并在合同/证据中写明替代证据（应用级真实浏览器 journey + 单测），不得留下驱动已删除 DOM 的脚本。

## 4. 范围 / 非目标

范围：上述 4 项 + 单测 + 合同 + spec。

非目标：不改官方 `packages/`；不改「更多」菜单 10 项清单/顺序/分组；不恢复 Apps 货架；不删除运行时注册接缝；不改其它侧栏行的 rank 与行为；不动 Electron 壳层。

## 5. 验收标准（可观察）

- [ ] DOM 无 `#omnimux-explore-entry` / `#omnimux-explore-menu`；探索样式节点不再注入；无探索相关文档级监听。
- [ ] 官方「更多」菜单仍含 10 项，顺序与分组分隔线不变。
- [ ] `registerExploreItem` 注册项出现在「更多」菜单末尾；注销后消失；非法输入不注册不抛错。
- [ ] 点击「更多」菜单项仍走既有三段委托。
- [ ] 隔离 worktree 真实浏览器证据（截图 + 结构化报告）。
- [ ] 单测与所选静态检查通过；合同同步。

## 假设

- 假设 A：移除自绘入口不影响「更多」菜单与收敛行点击委托——两者不共享 DOM，只共享清单与激活函数。
- 假设 B：运行时注册接缝在「更多」菜单里语义不变（展开时读取最新集合、注销即消失、非法输入静默拒绝）。
- 假设 C：官方「更多」菜单是这 10 项在侧栏的唯一入口，移除后产品基线里没有指向未安装插件的死条目新增（沿用既有白名单语义，不新增/不删项）。

## 证伪方式

- 证伪 A：移除后「更多」菜单少项或点击失效 → 说明存在隐藏耦合（例如渲染依赖探索行存在），改回共用同一真源，而不是把浮动菜单加回来。
- 证伪 B：真实浏览器里注册后菜单不更新、或注销后仍显示 → 把「展开时读取」改成显式订阅（`registerExploreItem` 触发重渲染），并同步改合同与测试。
- 证伪 C：真实应用里移除后侧栏出现空洞/布局错位，或其它行 rank 变化 → 回看 `runPlaceAll` 的锚点与 rank 表，按行归属修正，不用 CSS 遮挡。

## 旧标准变更

本任务移除自绘「探索」行与浮动菜单，`plugins/omnimux/src/client/sidebar-coordinator.test.js` 中驱动该 DOM 的用例必须调整；下列声明是唯一放行通道，逐条点名（前 11 条整例删除，后 5 条保留用例、改写断言为直接调用真源 `resolveExploreMenuItems()` / `activateExploreItem()`）：

- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `品牌按钮不得抢占新对话锚点，常驻探索行紧挨新对话且不插在品牌钮后`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `探索行 rank 严格为 7.2，位于最下方，且技能专家（rank 4.1）常驻保留`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `探索行折叠态展示为居中图标，隐藏文案标签`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `点击探索行弹出浮动菜单，包含 Spec 锁定 10 项白名单与纯矢量 SVG`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `点击菜单项激活对应 Tab 并关闭菜单，支持委托收敛元素 click`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `按 Escape 键或点击外部可关闭探索浮动菜单`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `computeExploreMenuPosition 具备视口防溢出几何计算`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `computeExploreMenuPosition 用实测菜单尺寸定位：长菜单底边必须留在视口内`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `探索入口悬停即展开：意图延时后出现，扫过不误触，移入菜单不闪断`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `探索入口：点击仍可开关，点击收起后悬停不立即重开`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `探索入口：Esc 与焦点移出收起，收起时不留挂起定时器`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `仅 below 行（无 inline）时保持原有锚点行为，探索行首发居前`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `desktop 外壳包住内层 pane 时仍把 extra row 插在新对话下方`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `激活 apps 项时其 element.click 仅被调用一次，绝无重复点击`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `探索菜单运行时注册接缝：未注册与内置 10 项完全一致，注册后追加且可注销`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `探索菜单运行时注册接缝：action 优先于 tabId，非法形状与 id 冲突不产生脏项`
- `tests/e2e/guard-no-transparent-popover.test.mjs` :: `硬门禁 2: sidebar-coordinator.js 探索菜单纯实体深色背景断言 (解决透光透字缺陷)`
- `tests/e2e/sidebar-explore-convergence.e2e.test.mjs` :: `E2E: 验证左侧侧边栏非核心及内测插件收敛至探索菜单且探索位于最下方`
- `tests/e2e/sidebar-explore-convergence.e2e.test.mjs` :: `E2E: 探索菜单运行时注册接缝——注册项追加在末尾、点击走 tabId 兜底、注销后消失`
- `tests/e2e/sidebar-explore-convergence.e2e.test.mjs` :: `E2E: 探索入口悬停即展开——接线、延时与幂等收起契约`
- `tests/e2e/explore-menu-resize-handle.e2e.test.mjs` :: `E2E: 分隔线手柄层级高于探索浮层菜单，分割线全段可拖`

后四个用例整文件重写为「退役 + 收敛语义」回归：`sidebar-explore-convergence.e2e.test.mjs` 保留「核心常驻项不收敛 / 其余 omnimux 插件收敛 / 10 项白名单与无 Emoji / 合同不再登记探索行、改登记官方『更多』菜单」并把浮动菜单的 DOM 旅程删掉（其覆盖已由 `plugins/omnimux/src/client/explore-more-menu.test.js`、`scripts/verify-explore-registration-browser.mjs` 与应用级 journey 承担）；`explore-menu-resize-handle.e2e.test.mjs` 改为断言浮层样式与 `.dshDesktopResizeHandle` 提层补丁都已随浮层退役（挡回退）。

门禁侧说明：`scripts/guard-no-transparent-popover.mjs` 的第一段（`isSidebarCoordinator` 分支，含 `EXPLORE_MENU_MUST_EXIST` / `POPOVER_NO_BACKDROP_BLUR` / `NO_BARE_BG_ELEVATED` / `POPOVER_NO_BG_OVERLAY_DISCOLORATION` / `EXPLORE_MENU_MUST_BE_DARK_SOLID_LAYER`）只守卫 `.omnimux-explore-menu` 浮层样式块；该浮层已随本任务删除，守卫对象不存在 → 该段与 `硬门禁 2` 一并退役（保留全库扫描 `硬门禁 1` 与故障注入 `硬门禁 3`，通用浮层规则在第二段仍在）。不得为凑绿保留死样式。

替换证据：同文件新增回归例断言侧栏不再渲染探索行、源码不再残留浮动菜单实现（DOM 无 `#omnimux-explore-entry` / `#omnimux-explore-menu`、探索样式节点不注入、已删导出为 `undefined`）；10 项渲染、分组与点击的覆盖移到 `plugins/omnimux/src/client/explore-more-menu.test.js`（官方「更多」菜单面）。被改写的 5 条只去掉探索 DOM 断言，保留锚点、注册集合、激活委托的语义断言。

跨插件 e2e 边界（本任务**不改**，如实记录）：`plugins/omnimux-workflow/tests/e2e/preset-operation-3206.journey.mjs` 的第二段仍在 `clickExact('探索')` 后查 `.omnimux-explore-menu`，并期望清单里含 `Google Vids` 与 `快讯中枢`。这两项从未出现在产品内置白名单（`快讯中枢` 只由 `scripts/verify-explore-registration-browser.mjs` 在它自己的页面里临时注册），故该旅程在本改动之前就已不成立；本改动又移除了它依赖的 DOM。该文件没有 `test`/`it` 具名用例（断言全部为旅程内 `check()`），`scripts/guard-anti-cheat.mjs` 的「## 旧标准变更」通道只对具名用例开放，**匿名断言削弱是硬拒绝**，因此本任务无法就地改写它。处置：保持原样并在 PR/报告里记为待 workflow owner 重定向（把第二段改为驱动官方「更多」菜单并改用真实 10 项清单），或由该 owner 把旅程断言升级为具名用例后再走声明通道。它不在 `pnpm --filter omnimux-workflow test` 的 glob（`src/**` + `tests/*.test.mjs`）内，默认套件与 CI 不受影响。

## 8. 证据计划

- 单测：`node --test plugins/omnimux/src/client/sidebar-coordinator.test.js plugins/omnimux/src/client/explore-more-menu.test.js`；`pnpm --filter omnimux test`。
- 静态：`pnpm check:boundaries`、`pnpm verify:stages`、`node scripts/verify-slot-contracts.mjs`、`node --test scripts/verify-anti-slop.test.mjs`、`node scripts/verify-silent-catch.mjs`。
- 浏览器：隔离 worktree 应用级 QA（`node scripts/worktree-app-qa.mjs --request <json>`，taskPlugins `["omnimux-inspiration"]`，动态端口、自清理）：断言侧栏无探索行、官方「更多」菜单仍 10 项、运行时注册项出现/注销消失；截图留存。已知门禁限制见 #3774 证据报告（侧栏支持包 peer）。
- 改造后的 `scripts/verify-explore-registration-browser.mjs` 自证（退出码 + 证据 JSON/PNG）。

## 9. 文档影响

`docs/contracts/sidebar-extra-entries.md`：occupants 表移除 `[data-omnimux-explore-entry]`；「探索菜单运行时注册」节改写为「官方『更多』菜单运行时注册」；「探索入口的展开方式」节删除（悬停展开随浮动菜单一并退役）；「官方『更多』菜单」节补一句「自绘探索入口已退役，本菜单是唯一入口」。本 spec 位于任务 worktree。
