# rc.3 多会话右栏 DOM 读取统一（Issue #4009）

## 目标

DSH `0.2.1-rc.3` 的右侧栏为访问过的每个 Session 保留挂载：非活动会话外层 `[data-sidebar-right-session]` 带 `hidden`/`aria-hidden`，内层面板仍保留 `data-sidebar-right-panel` / `data-sidebar-right-open`。OmniMux 多处仍按「document 只有一个右栏面板」读取，第一个匹配可能是隐藏旧会话，导致当前会话出现中栏空白、宽度/欢迎区/快捷行/全屏状态串台。

本任务把所有这类读取收敛到一个当前会话面板解析器，并用当前会话状态镜像替换 4 个样式文件共 36 条全局 `:has(...)`，消除跨会话状态泄漏。

## 新用户基线

全新用户安装、登录后：任意打开/切换多个会话与项目创作页，当前会话的右栏展开、全屏、中栏折叠和欢迎区布局只由当前会话面板决定；不依赖开发机项目、历史 localStorage 或手工清理 DOM。

## 用户旅程

1. 会话 A 打开右栏/全屏，切到会话 B（B 无右栏）：B 的中栏、欢迎区和快捷行不得沿用 A 的右栏状态。
2. 项目 A 创作页打开画布后切到其他会话再切回：A 的画布/中栏恢复三栏或按既有会话记忆恢复，不出现空白带。
3. 用户手动收起中栏后，普通页面节点的显示/隐藏或无关 DOM 插入不得清掉收起状态。
4. 打开/关闭右栏、全屏与退出全屏时，当前会话的 `data-omnimux-rightbar-open` / `data-omnimux-rightbar-fullscreen` 镜像必须与实际面板同步。

## 结构与实现

- 新增 `plugins/omnimux/src/client/workbench/current-panel.js`：
  - `isVisibleSidebarPanel(panel)`：排除 `[hidden]`/`aria-hidden="true"` 祖先和自身隐藏；
  - `panelSessionId(panel)`：读面板自身或 `[data-sidebar-right-session]` 祖先的会话 id；
  - `currentRightbarPanel(doc)`：优先 `ctx.sidebarRight.mounted`（`host-adapter`）匹配会话；未绑定或旧宿主无 session 标记时退回可见面板；全部隐藏返回 `null`；
  - `readCurrentRightbarState(doc)`：返回 `{ panel, open, fullscreen }`，供消费者统一使用。
- 新增 `plugins/omnimux/src/client/workbench/rightbar-state-mirror.js`：
  - 安装单例 observer，监听 `data-sidebar-right-panel`/`data-sidebar-right-open`/`hidden`/`aria-hidden`；
  - 将当前会话状态写到 `html[data-omnimux-rightbar-open]` / `html[data-omnimux-rightbar-fullscreen]`（布尔属性只写 `"true"`/移除）；
  - 只对 `[data-sidebar-right-session]` 包装的 `hidden`/`aria-hidden` 变化重算；普通节点增删不得清用户手动收起状态。
- 消费者替换：
  - `tab-viewport-reconciler.js`、`split-compact-layout.js`、`rightbar-collapsed-fill.js`、`geometry.js`、`sidebar-activation.js`、`welcome-greeting.js`、`hero-brand.jsx`、`AssetHubPanel.jsx` 统一使用 `currentRightbarPanel` / `readCurrentRightbarState`；相关 observer 增加 `hidden`/`aria-hidden`。
  - `composer-compact.js`、`session-guide/styles.js`、`composer-quick-shortcuts/styles.js`、`conversation-box.js` 的 36 条 `:has([data-sidebar-right-panel][data-sidebar-right-open]...)` 改为读取 `html[data-omnimux-rightbar-open]` / `[data-omnimux-rightbar-fullscreen]` 镜像。
- `plugins/omnimux/src/client/chrome.js`（或等价装配层）安装 `rightbar-state-mirror`，生命周期随 hub chrome 卸载。

## 命令

- `node --test plugins/omnimux/src/client/workbench/current-panel.test.js plugins/omnimux/src/client/workbench/rightbar-state-mirror.test.js`
- `pnpm --filter omnimux test`
- `pnpm verify:stages`
- `node --test scripts/verify-anti-slop.test.mjs`
- `pnpm verify:product-baseline`
- `node scripts/worktree-app-qa.mjs --journey plugins/omnimux-workflow/tests/e2e/project-page-three-column.journey.mjs`（真实应用旅程，另加多会话检查）
- `git diff --check`

## 风格与测试

- 纯客户端适配层修复，不 import 其它插件内部模块；helper 只依赖 `host-adapter` 和官方 DOM 标记。
- 单测新增多会话 JSDOM 夹具：旧 hidden fullscreen + 当前 push、旧 hidden push + 当前无面板、用户手动收起 + 无关节点隐藏。
- CSS 改造必须断言 36 条旧 `:has` 选择器不再存在，并断言镜像属性规则生效（静态检查 + 现有样式测试）。
- 应用级旅程验证：项目创作页打开后中栏宽 360/opacity 1、画布可见；切换会话后中栏状态不串台。

## 边界与文档

- 不改官方 DSH 源码、不改 `dsh-better-sidebar` 包；所有官方 DOM 只读。
- 不改变用户手动收起中间栏的持久化语义；无关节点变化不得触发折叠键清除。
- `docs/contracts/three-column-layout.md` K-1（中栏收起 + 左栏展开）单独按契约演示确认，本任务不碰。
- 更新 `docs/contracts/workbench-split.md` 的 Current session 小节，补「所有右栏状态读取必须走 currentRightbarPanel / 镜像属性」。

## 假设

- rc.3 官方会话包装确实带 `data-sidebar-right-session`，且非活动会话只以 `hidden`/`aria-hidden` 表示；官方 `ctx.sidebarRight.mounted` 能读到当前在屏会话。
- CSS 36 条 `:has` 规则只用于判断「当前会话右栏是否展开且非全屏」，替换为镜像属性不改变合法展开态语义。
- 不存在的旧宿主/测试夹具没有 session 标记时，helper 退回可见面板兜底，保持旧兼容。

## 证伪方式

- 多会话 JSDOM：旧会话隐藏 fullscreen 面板 + 当前 push 面板时，`readCurrentRightbarState` 必须返回当前 push；旧实现会返回 hidden fullscreen。若仍返回旧面板，说明会话匹配失败。
- 手动收起中栏后对无关普通节点 `hidden` 翻转，`data-omnimux-conversation-collapsed` 必须保留；若被清除，说明 observer 过滤未生效。
- 真实应用旅程：修复前旧会话全屏后切到无右栏会话时 frame 出现固定三列或中栏空白；修复后 `html[data-omnimux-rightbar-open]` 缺失/按当前会话变化且中栏宽度正确。若仍不变化，说明镜像未安装或 CSS 未替换完整。

## 旧标准变更

- `plugins/omnimux/src/client/composer-quick-shortcuts/styles.test.js` :: `非全屏（分栏/分屏）模式下强制隐藏快捷方式那一排（display: none !important）`
  - 原断言：两条期望选择器使用 `.dshDesktopFrame…:has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"]))`。
  - 必须改的理由：CSS 已改为读取当前会话镜像 `html[data-omnimux-rightbar-open="true"]:not([data-omnimux-rightbar-fullscreen="true"])`，旧选择器会匹配隐藏旧会话面板；断言需跟随真实实现口径。
  - 新期望证据：同一 `display:none!important` 断言绑定到新镜像选择器；新增 `rightbar-css-scoping.test.js` 断言四个样式文件不再含旧 `:has`。
