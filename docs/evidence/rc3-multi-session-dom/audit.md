# DSH 0.2.1-rc.3 多会话 DOM 契约漂移排查

基线：`main@c18764515`（前一修复已合入）；范围：`plugins/*/src`，排除 `lib/` 构建产物和测试。

## 结论

这不是单个页面的 CSS bug，而是**宿主升级后的多实例 DOM 契约漂移 / 跨会话状态泄漏**。

rc.3 官方右侧栏为每个访问过的 Session 保留挂载：非活动会话外层 `[data-sidebar-right-session]` 带 `hidden`（或 `aria-hidden`），内层面板仍保留 `data-sidebar-right-panel`、`data-sidebar-right-open` 等状态。OmniMux 大量代码仍假设「整个 document 只有一个右侧面板」，用 `document.querySelector` 取第一个匹配项；第一个匹配可能正好是上一个会话留下的隐藏面板，于是把别的会话的「已展开/全屏」当成当前会话状态。

当前源码只有本次修复的 `fullscreen-collapse-sync.js` 引用了 `[data-sidebar-right-session]`；其余右栏状态读取都没有按当前 Session 过滤。

## 统计

- **11 项发现，11 个源文件：0 个 P0、4 个 P1、7 个 P2。**
- 另有 **36 条未按会话限定的 `:has()` 选择器行，分布在 4 个文件**。

## 同类风险清单

| # | 优先级 | 位置 | 现有写法 | 后果 |
| --- | --- | --- | --- | --- |
| 1 | P1 | `plugins/omnimux/src/client/split-compact-layout.js:280-295`（observer 402-406） | 取第一个 `[data-sidebar-right-panel]` 的 mode/open；模块级缓存 `nativePresentation` | 隐藏旧面板打开时 `closed=false`，当前面板关闭不会解除中栏折叠；反向会误清折叠。observer 不监听 `hidden`/`aria-hidden` |
| 2 | P1 | `plugins/omnimux/src/client/rightbar-collapsed-fill.js:54-56,103,156-160` | `findPanel()` 取第一个 `[data-sidebar-right-panel]` | 收起中栏时把内联宽度/`data-omnimux-collapsed-fill` 写到隐藏旧面板，当前面板留黑带、输入框重叠；清理也清错对象 |
| 3 | P1 | `plugins/omnimux/src/client/composer-compact.js:46-119` | 16 条 `.dshDesktopFrame…:has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"]))` | 隐藏旧 push 面板让当前会话被当成 split，欢迎头被强制绝对定位、`composerHero > :first-child` 被隐藏，空会话布局跳动/错位 |
| 4 | P1 | `plugins/omnimux/src/client/session-guide/styles.js:92-136,3461-3462` | 14 条同类 `:has(...)` | 隐藏旧 push 面板把 starter guide 的 composer seat/stack/hero/card 强制成 split-compact 尺寸（`justify-content:flex-end`、680px cap、zero padding），空白会话引导被压到底部 |
| 5 | P2 | `plugins/omnimux/src/client/workbench/tab-viewport-reconciler.js:186-192`（observer 333-338） | `doc.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]')` | 隐藏旧面板使 `!panel` 早退失效，会话切换按别的会话面板执行 `closePanel`/`setFocus('chat')`；observer 缺 hidden/aria-hidden |
| 6 | P2 | `plugins/omnimux/src/client/welcome-greeting.js:44-50`（observer 139-151） | 取第一个面板判断 `isOpen`/`isFullscreen` | 欢迎头可能按旧会话 split 定位；切换会话不刷新 |
| 7 | P2 | `plugins/omnimux/src/client/hero-brand.jsx:33-36`（observer 40-44） | 同上 | React 英雄区 `is-split`/`is-centered` 错误 |
| 8 | P2 | `plugins/omnimux/src/client/workbench/sidebar-activation.js:206-215`（observer 429-436） | `readDomPanel` 取第一个面板 | 官方 `sidebarRight` 不可用时的左栏高亮/展开信号错误；observer 缺 hidden/aria-hidden |
| 9 | P2 | `plugins/omnimux/src/client/composer-quick-shortcuts/styles.js:530-531` | `.dshDesktopFrame…:has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omx-quick-shortcuts` | 隐藏旧 push 面板让当前快捷行被 `display:none` |
| 10 | P2 | `plugins/omnimux/src/client/conversation-box.js:233-236` | 4 条 `:has([data-sidebar-right-panel][data-sidebar-right-open])` 设三列 grid | 隐藏旧面板匹配时强制 `sidebar / 380px / 1fr`，当前会话无右栏会留空第三列/宽度错配 |
| 11 | P2 | `plugins/omnimux-assets/src/asset-hub/AssetHubPanel.jsx:86-96` | observer 只监听 `data-sidebar-right-panel`/`data-rightbar-fullscreen` | 会话切换只翻转 `hidden` 时全屏状态不刷新，返回后全屏按钮/图标过期 |

## 检查过、无发现

- `workbench/host-fullscreen.js`：`isVisibleSidebarPanel` 已正确排除 `[hidden]`/`aria-hidden` 祖先，是当前参考实现。
- `workbench/fullscreen-collapse-sync.js`：observer 已包含 `hidden`/`aria-hidden`，并检查 `[data-sidebar-right-session]`。
- `workbench/geometry.js:192`：首个 open panel 查询存在，但 `isLikelyWorkbenchPanel` 会拒绝零尺寸隐藏面板，残余风险只在隐藏包装不再塌缩时出现。
- `sidebar-toggle-topbar.js:475,1011`：`:has([data-sidebar-right-panel])` 只用于定位 frame，不读面板状态。
- `omnimux-inspiration/src/explore/useComposerDocking.js:649`：事件目标过滤，不读面板状态。
- 其他插件的 `src` 未发现 `data-sidebar-right-panel`/`data-rightbar-fullscreen` 选择器。

## 建议的统一修法

1. 在 `plugins/omnimux/src/client/workbench/` 增加唯一 `currentRightbarPanel(doc)`：优先 `ctx.sidebarRight.mounted` 匹配 `data-sidebar-right-session`；没有官方读面时才退回「不在 `hidden`/`aria-hidden` 祖先内的可见面板」。
2. 7 处直接取第一个面板的读取改为该 helper；`sidebar-activation` 有官方 `ctx.sidebarRight` 时不再读 DOM。
3. 把当前会话右栏状态镜像到 `html[data-omnimux-rightbar-open]` / `[data-omnimux-rightbar-fullscreen]`；36 条 `:has()` 改为读取镜像属性，CSS 不直接匹配所有会话面板。
4. 所有 observer 只监听 `[data-sidebar-right-session]` 包装的 `hidden`/`aria-hidden` 变化，或监听镜像属性；普通节点插入/隐藏不得触发 `sync()` 清掉用户手动收起状态。
5. 回归夹具固定三组：旧会话隐藏 fullscreen + 当前 push、旧会话隐藏 push + 当前无面板、用户手动收起中栏。每组断言当前面板状态、grid 三列宽度与折叠键。

## 四维评估

| 建议项 | 核心作用 | 优先级 | 必要性 | 潜在风险/代价 |
| --- | --- | --- | --- | --- |
| 统一 `currentRightbarPanel(doc)` 并替换单例读取 | 所有右栏状态读取绑定当前在屏会话 | P1 | 不做会继续出现跨会话空白/宽度错乱 | 中等改造面，需回归全屏/分栏/折叠 |
| 右栏状态镜像 html 属性，替代 36 条 `:has()` | CSS 不再误匹配隐藏会话面板 | P1 | 不做同类 CSS 状态可能随会话切换漂移 | 需逐条核对选择器，改动多但可分批 |
| 三组多会话回归夹具 | 把这类 bug 固化成回归测试 | P1 | 不做下次升级可能再次复发 | 维护成本低 |
| 处理 `docs/contracts/three-column-layout.md` K-1 | 消除已知等宽空白带 | P2 | 不做拖拽组合仍可能出现空白 | 会改变可见布局，契约要求先演示确认 |

## 建议实施顺序

- 第一批 P1：`split-compact-layout`、`rightbar-collapsed-fill`、`composer-compact`、`session-guide`（helper + CSS 镜像可一起做）。
- 第二批 P2：`tab-viewport-reconciler`、欢迎区/品牌、`sidebar-activation`、`composer-quick-shortcuts`、`conversation-box`、`AssetHubPanel` observer。
- K-1 单独按契约要求先演示确认后改，不混在本次修复里。
