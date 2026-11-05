# 创作页打开：会话导航接缝迁移（Issue #3928）

## 目标

点击「项目库 › 某项目 › 创作页」卡片后，主区切到该创作页所属会话，右侧画布在同一动作内出现；打开失败时页面给出可见错误，不再静默无响应。根因是官方 DSH 自 `0.1.7` 起移除了 `sessions.open`，而工作流插件仍用它切会话：会话不切，`dsh-better-sidebar` 把画布 tab 排进非前台会话的 pending 队列，界面毫无变化。

## 新用户基线

全新用户在 OmniMux 桌面/网页壳里打开项目库并点击项目自带的创作页，即可复现与修复；不依赖开发机上的项目数据、凭据或本地模型。壳层缺 `uiWorkspace` 且也是旧版 `sessions.open` 时，插件返回「无法打开创作画布」的可见错误，而不是假装成功；没有项目/创作页时维持现有空态。

## 用户旅程

1. 项目库 → 点击项目文件夹卡片 → 二级页「创作页」。
2. 点击创作页卡片：卡片立即出现「打开中」遮罩；主区切到项目绑定会话；右侧栏出现画布 tab 并渲染对应画布工作区。
3. 若壳层既没有 `uiWorkspace.openSession` 也没有旧版 `sessions.open`，或画布 tab 未注册：遮罩复位，详情页显示「无法打开创作画布，请重试。」，不出现「什么都没发生」。

## 结构与实现

- `projectCanvas.js`：新增 `resolveSessionNavigation(ctx)`（优先 `uiWorkspace`/懒解析 getter，回退旧 `sessions.open`）与 `focusSessionForCanvas(ctx, sessionId)`（已在前台则跳过；返回是否可继续）。`activateProjectCanvas` 在 `openTab` 前调用它；拿不到切换能力且目标会话不在前台时返回 `false`，不再把 tab 排到看不见的会话里。
- `ProjectLibraryPage.jsx`：创作页打开、AI 应用「编辑」复用 `activateProjectCanvas`，不再各自调用 `sessions.open`；打开返回 `false` 或抛错时写可见错误；缺会话且创建失败时不以无 session scope 打开画布。
- `newProject.js` / `CanvasTab.jsx` / `AppTab.jsx`：同一条接缝（新建项目后打开画布、应用「编辑/创建副本」切会话），旧 `sessions.open` 直调移除。
- `client/index.js`：把 `getSessionNavigation: () => ctx.get('uiWorkspace')` 以懒解析方式传给项目页、画布 tab、应用 tab 与 `window.__omnimuxWorkflow` 接缝。
- 文案：新增 `projects.openCanvasFailed`（中英），沿用现有错误横幅，不新增弹窗。

## 命令

- `pnpm --filter omnimux-workflow test`
- `pnpm --filter omnimux-workflow typecheck`
- `node scripts/impact-matrix.mjs --git-diff --base origin/main`
- `pnpm test:worktree-web workflow`（工作树隔离真实浏览器）
- `pnpm verify:product-baseline`
- 工作树 `pnpm verify:app:live --mode=ui --journey=plugins/omnimux-workflow/tests/e2e/project-page-session-navigation.journey.mjs`：真实应用路径点击创作页，断言会话切换与画布出现，保存截图与结构报告
- `git diff --check`

## 风格与测试

- 复用 `getBetterSidebar` 与现有 `safeGetService` 风格的防御读取；不新增全局单例、不 import 其它插件内部实现。
- 单测覆盖：`uiWorkspace` 优先且先切会话再 openTab；无 `uiWorkspace` 时回退旧 `sessions.open`；两者皆无且目标会话不在前台时返回 `false` 且不 openTab；已在前台不重复切；`activateProjectCanvas` 既有行为不回归。
- 端到端覆盖：真实应用里项目详情点创作页 → 会话切到项目会话 → `[data-omnimux-canvas-tab]` 可见并挂载画布；负向（注入缺失切换能力的假壳不易构造）由单测覆盖。

## 边界与文档

- 不改 `dsh-better-sidebar` 的排队语义，不改画布岛 bundle，不迁移 `omnimux-market`、`omnimux` 表单桥等其它插件的同类入口（另单跟进）。
- 更新 `docs/harness-pin.md` 的会话导航说明？不涉及 pin 变更；在 `plugins/omnimux-workflow/docs/ARCHITECTURE.md` 会话导航小节补一句现行接缝，避免下一次 RC 升级又找不到入口。

## 假设

- 当前壳层（`@deepseek-ai/dsh-client-ui-workspace`）提供 `uiWorkspace` 服务，且 `openSession(id)` 同步替换主区会话；`dsh-better-sidebar` 以挂载会话为准，会话切换后会把 pending 的画布 tab 落到可见面板。
- 项目 `project.json` 里保存的 `sessionId` 仍指向一个现存会话；若会话已被删除，官方 `openSession` 会拒绝对应 retain，此时助手层必须给出可见错误而不是白屏。

## 证伪方式

- 在真实应用旅程中，修复前点击创作页后 5s 内 `[data-omnimux-canvas-tab]` 数量为 0 且主区会话不变；修复后同一断言变为 1 且主区会话 cwd 等于项目路径。若修复后仍为 0，说明接缝解析或排队刷新不成立，假设被证伪。
- 单测中把 `uiWorkspace.openSession` 换成会抛错的实现，断言 `activateProjectCanvas` 返回 `false`、`openTab` 未被调用；若仍返回 `true`，说明「失败不静默」未实现。

## 补充事实（真实应用验收修正）

真实应用运行发现：切换会话后右栏 seat 尚未挂载时，`dsh-better-sidebar` 的原生写面**不排队而是直接抛** `sidebarRight: no session surface is mounted`。因此本单同时补上：

- `activateProjectCanvas` 首次 `openTab` 前不等待，被拒后等官方 `sidebarRight.mounted` 变成目标会话再重试一次；两次都失败返回 `false`（调用方给出可见错误），不把宿主异常抛给点击。
- 等待用官方 `sidebarRight.mounted` 快照订阅 + 轮询；命中/超时都解绑并清定时器，成功路径不重复 openTab。
- 项目打开失败（缺会话导航、会话创建失败、宿主拒绝画布）一律落到页面可见错误：创作页打开失败显示「无法打开创作画布」，新建项目成功但画布没开显示「项目已创建，但创作画布未能打开」。

## 旧标准变更

- `plugins/omnimux-workflow/src/client/projects/projectLibraryPage.apps.test.mjs` :: `点创作页卡片：打开期间显示「打开中」并忽略重复点击，结束后复位可再次打开`
  - 原断言：mock 的 `createProjectSession` 解析旧形状 `{ id: 'sess_open' }`，随后期望画布 tab 被打开
  - 必须改的理由：真实 `createProjectSession` 一直返回 `{ ok, cwd, workspaceId, sessionId }`；新链路校验 `ok` 与 `sessionId`（缺会话时失败必须可见），旧 mock 反映的是错误契约，会掩盖原 bug。
  - 新期望证据：mock 改为 `{ ok: true, sessionId: 'sess_open' }`；「打开中」遮罩、重复点击拦截、复位后再次打开的断言保持原样。
- `plugins/omnimux-workflow/src/client/projects/projectLibraryPage.test.mjs` :: `handleOpenPage passes { layout, betterSidebar, t } as first arg and canvasWorkspaceId in second arg`
  - 用例已改名为 `handleOpenPage passes the session-navigation seam and canvasWorkspaceId into activateProjectCanvas`。
  - 原断言：`activateProjectCanvas({ layout, betterSidebar, t })`
  - 必须改的理由：打开链路新增 `getSidebarRight`（等右栏 seat 挂载后补开 tab），deps 形状变化导致原正则必然失配；行为契约只增不减。
  - 新期望证据：断言 deps 同时含 `getSessionNavigation` 与 `getSidebarRight`；保留 `canvasWorkspaceId` 与 `projects.openCanvasFailed` 断言；行为覆盖见 `projectCanvas.test.mjs` 的「右栏 seat 挂载后才允许 openTab」用例组。
- `plugins/omnimux-workflow/src/client/projects/projectCanvas.test.mjs` :: `activateProjectCanvas no-ops tab mutations when sidebar service is missing`
  - 原断言：失败时 `layout.closeDetails` 被调用（`details = ['close']`）
  - 必须改的理由：切换/打开失败前不再先关宿主详情面板（失败不制造副作用），行为更严格。
  - 新期望证据：失败时 `details = []`，另有「两次都被拒绝时返回 false」用例覆盖失败可见化。
- `plugins/omnimux-workflow/src/client/projects/projectCanvas.test.mjs` :: `activateProjectCanvas 先 openTab，会话未对齐时不阻塞且不把 meta 写到当前会话`
  - 原断言：目标会话非前台时直接 openTab
  - 必须改的理由：现行宿主在目标会话非前台时会拒绝 openTab，用例需显式提供 `sessionNavigation` 假服务来保留「先 openTab、异步对齐」的时序契约。
  - 新期望证据：同用例仍断言 openTab 先于对齐、不写 meta、不广播；新增独立用例覆盖右栏 seat 拒绝与重试。
- `plugins/omnimux-workflow/src/client/projects/projectCanvas.test.mjs` :: `activateProjectCanvas 在 openTab 之后异步对齐会话，对齐成功才补 meta 与广播`
  - 同上：补 `sessionNavigation` 假服务，断言顺序 `openTab → openTab → updateTab` 不变。
- `plugins/omnimux-workflow/src/client/projects/projectCanvasAlignment.test.mjs` :: `超时窗口内零写入，目标会话成为前台后才补 openTab + meta + 广播，随即解绑`、`同一会话重复激活时只保留最新目标：旧监听被解绑，不覆盖新画布`、`侧栏服务换绑/卸载时解绑补位监听，之后不再写 meta`
  - 原断言：非前台目标直接 openTab 并挂补位监听
  - 必须改的理由：现行宿主要求先可切会话，用例补 `sessionNavigation` 假服务以继续验证「最终一致」本身。
  - 新期望证据：三条用例的 openTab/meta/广播/解绑断言保持原样。
- `plugins/omnimux-workflow/src/client/projects/newProject.test.mjs` :: `POST title only then workspaces.create({ path }) then sessions.create({ workspaceId })`
  - 原断言：`sessions.open` 被调用（`opens = ['sess-9']`）
  - 必须改的理由：`sessions.open` 已从 DSH 移除，新链路在会话已在前台时不该再调用旧 API。
  - 新期望证据：`opens = []`；创建链路断言（POST → workspace → session → PATCH）保持不变。
- `plugins/omnimux-workflow/src/client/projects/newProject.test.mjs` :: `un-collapses conversation after sessions.open (enter-conversation intent)`
  - 用例已改名为 `un-collapses conversation when the project canvas opens (enter-conversation intent)`。
  - 原断言：`open:sess-enter` 先于折叠解除与 split
  - 必须改的理由：旧 API 移除后不再有 `sessions.open` 调用点，改验「画布 tab 打开 + 解除折叠 + split」三件事都发生。
  - 新期望证据：断言 `openTab`、`collapsed:false:sess-enter`、`focus:split` 均出现。
- `plugins/omnimux-workflow/src/client/projects/newProject.test.mjs` :: `un-collapses conversation after opening the fresh session`
  - 同上：去掉 `open:` 断言，保留 `openTab` / 折叠 / split 断言。
- `plugins/omnimux-workflow/src/client/projects/appTabSessionSwitch.regression.test.mjs` :: `统一的会话切换辅助真正调用 sessions.open(sessionId)`
  - 用例已改名为 `统一的会话切换辅助调用 focusSessionForCanvas，而不是已移除的 sessions.open`。
  - 原断言：AppTab 源码含 `sessions.open(sessionId)`
  - 必须改的理由：该 API 已不存在，继续断言等于要求代码继续用坏接缝。
  - 新期望证据：断言 AppTab 含 `focusSessionForCanvas(`、传入 `getSessionNavigation`，且不再出现 `sessions?.open(`。
