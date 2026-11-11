# 规格说明：项目—工作区—会话—创作页激活模型重构

Issue: 待建 · 模块: omnimux-workflow / omnimux · 风险等级: R3

## 新用户与产品基线

全新用户机器上没有任何工作区、会话、项目或本地缓存。用户从空状态创建第一个项目时，系统必须同时得到：一个已登记工作区、一个属于该工作区的会话、一个 v2 项目档案、一个默认创作页和一张真实画布。之后从项目库打开项目、切换会话、切换工作区、切换创作页，不得出现未分组会话、空白画布或跨工作区串台。

本计划不保留旧版项目数据兼容。开发与测试环境必须从初始化 profile 开始；不读取旧 `project.json`，不迁移旧 `sessionId` 或 `canvasWorkspaceIds`。

## 一、背景与问题

1. 项目与工作区本应按绝对路径 1:1 绑定，但实现里项目只靠 `sessionId` 软引用会话，会话被删除、归档、移出工作区或属于其他工作区时，项目打开会落在「未分组」或别的 workspace。
2. 创作画布的目标有 scope、tab.meta、pickedBySession、sessionBinding、localStorage、按会话 hash 六路来源，任一路残留都会造成串台或永久 loading。
3. `dsh-better-sidebar` 的 tab 状态按会话持久化，而创作画布是工作区级资源；新会话/切会话会丢失画布视图，无法实现「创作页和对话相互激活」。
4. `session-binding` 读取接口会隐式创建项目，违反读取无副作用；`ensureProjectBound` 还会另建默认库项目，制造重复项目与孤儿画布。

## 二、核心设计

### A. 单一身份模型

- 项目 `path` = 工作区 `path`；同一路径最多一个项目。
- 项目不保存 `sessionId`；一个工作区可有 N 个会话，打开项目时优先当前同工作区会话，否则最近活跃非归档会话，否则新建。
- 项目保存 `pages[]` 与 `activePageId`；每页 1:1 对应一个画布工作区 `ws_*`。
- 创作画布 tab 是工作区级视图：按工作区记录可见性，由 `CanvasPresenceController`投射到当前会话；其他工作台 tab 仍按会话持久化。
- 所有画布目标只由「当前会话 → 工作区 → 项目 → activePage」解析。

### B. 数据与接口

- `project.json` 升级到 v2：字段 `schemaVersion=2/id/title/createdAt/updatedAt/activePageId/pages[{id,title,createdAt,updatedAt,canvasWorkspaceId}]`；删除 `sessionId`、`canvasWorkspaceIds`。
- `GET /api/projects` 只读，返回 v2 项目；`GET /api/projects?path=` 作为只读解析入口；删除 `GET /api/projects/session-binding`。
- `PATCH /api/projects/:id` 只允许改名；删除 `sessionId` 绑定分支。
- 项目创建/打开统一走 `ProjectNavigationService`；项目流程禁止 `sessions.create({})`、`sessions.create({ cwd })`。
- 库外工作区使用按工作区路径生成的 scratch canvas，不写 `.omnimux`、不进入项目库。

### C. 激活规则

1. 点项目 = 切到项目所属工作区，并选中/创建一个属于该工作区的会话；打开该项目 `activePageId` 对应画布。
2. 同一工作区内新建或切换会话：只换对话线程，项目、`activePageId`、创作画布保持不变。
3. 切换工作区：项目、创作页、画布一起切；目标工作区无项目时显示未建项引导。
4. 画布内切换/新建创作页：更新项目 `activePageId`，同工作区所有会话共享。
5. 未建项工作区：显示引导，只有用户显式创建项目才写盘；读取不得自动建项。

## 三、验收标准

| 编号 | 场景 | 期望 |
|---|---|---|
| AC-01 | 空状态新建第一个项目 | 工作区、会话、项目、默认创作页、画布同时出现；会话 cwd = 工作区 path |
| AC-02 | 项目库点项目 | 切到项目所属工作区与可用会话；打开 activePage；不产生未分组会话 |
| AC-03 | 同工作区新建/切换会话 | 画布保留同一 activePage；输入框工作区已选中 |
| AC-04 | 切换另一个工作区 | 画布切到目标工作区项目页；不显示上一个工作区画布 |
| AC-05 | 原项目会话被删除/归档 | 再打开项目自动选其他可用会话或新建，不报「选择工作区」 |
| AC-06 | 画布内切页/新建页 | 项目 activePageId 更新；同工作区另一会话看到同一页 |
| AC-07 | 未建项工作区 | 显示未建项引导；显式创建后才写 project.json |
| AC-08 | 旧缓存注入 | localStorage 旧 `latest-active-canvas` 不改变任何目标解析 |

## 四、测试与验证

1. 单元：`ProjectStore` v2、`WorkspaceContextStore`、`ProjectNavigationService`、`CanvasPresenceController`、`CanvasTab` 目标解析。
2. E2E：fresh profile 从空状态走完 AC-01 至 AC-08；不得预置项目/工作区/session。
3. 命令：`pnpm --filter omnimux-workflow test`、`pnpm --filter omnimux-workflow typecheck`、`pnpm verify:stages`、`node --test scripts/verify-anti-slop.test.mjs`、`pnpm verify:product-baseline`、工作树真实浏览器 journey。

## 五、非目标

- 不改官方 DSH 源码，不 fork `dsh-better-sidebar`，不把画布搬到 `shell.overlay`。
- 不做旧项目数据迁移。
- 不改模型路由、鉴权、计费、发布流程。

## 假设

全新用户从空 profile 开始使用；没有旧 `project.json`、旧工作区账本或旧 localStorage 需要迁移。画布仍放在右侧工作台，官方 `uiWorkspace.openSession` 与 `sidebarRight.mounted` 服务可用。库外工作区允许 scratch canvas，但不写入项目元数据。

## 证伪方式

若 fresh profile 下 AC-01 至 AC-08 任一场景仍出现未分组会话、画布目标来自旧缓存、或同工作区两个会话看到不同 activePage，则本规格的核心不变量不成立。若项目流程出现 `sessions.create({})`/`sessions.create({ cwd })` 或 `project.sessionId` 仍被读取，则实现未达到本规格。

## 旧标准变更

- `plugins/omnimux-workflow/src/client/projects/canvasTab-session.test.mjs` :: `源码契约：无 targetWorkspaceId 不渲染 CanvasBridge`
  - 原断言：匹配 `targetWorkspaceId ?` 的旧三元守卫与旧加载态结构。
  - 必须改的理由：新实现用 `targetWorkspaceId && !isLoading` 并引入 WorkspaceContextStore；旧断言锁死缓存路由旧实现。
  - 新期望证据：断言目标守卫与新加载态存在，CanvasBridge 仍必须在守卫之后。
- `plugins/omnimux-workflow/src/client/projects/canvasTab-session.test.mjs` :: `源码契约：注册 Context Contributor 携带 canvas workspaceId`
  - 原断言：旧注释与同类源码匹配。
  - 必须改的理由：目标来源从会话级 `sessionBinding` 改为工作区上下文，需要验证新目标变量。
  - 新期望证据：断言 `useWorkspaceContext` 与 `resolveWorkspaceContextPage`，并断言旧 `fetchSessionProjectBinding`/`pickedBySession` 不再出现。
- `plugins/omnimux-workflow/src/client/projects/canvasTab-session.test.mjs` :: `源码契约 & 行为：CanvasTab 安全注入 workspaces 服务，防御 Cordis 门禁异常 (#2382)`
  - 原断言：旧 props 注入与 safeGetService 源码片段。
  - 必须改的理由：服务读取逻辑保留，但测试文件重写为新上下文契约后不再单独复制旧实现断言。
  - 新期望证据：保留 `safeGetService`、`propWorkspaces` 与 `effectiveWorkspaces` 断言。
- `plugins/omnimux-workflow/src/client/projects/canvasTab-session.test.mjs` :: `源码契约 & 行为：CanvasTab 事件监听器严格校验 sessionId，杜绝无 sessionId 误放行与跨会话污染`
  - 原断言：要求 CanvasTab 监听 `omnimux:active-canvas-changed` 并做 sessionId 守卫。
  - 必须改的理由：新模型删除全局画布事件，改由 WorkspaceContextStore 订阅与回调驱动；继续要求旧事件会锁死双源路由。
  - 新期望证据：断言 CanvasTab 不包含 `omnimux:active-canvas-changed`，目标只来自 `WorkspaceContextStore`。
- `plugins/omnimux-workflow/src/client/projects/canvasTabRouting.test.mjs` :: `AC-06: 【缺陷 1 & 2 整改】CanvasTab 源码契约闭环校验（会话比对与事件守卫）`
  - 原断言：要求旧 `isTabMetaValidForSession` 与事件守卫源码。
  - 必须改的理由：新模型以工作区上下文为唯一来源，旧 tab.meta 会话守卫不再承担路由职责。
  - 新期望证据：改为断言 `useWorkspaceContext`/`resolveWorkspaceContextPage`，且不出现旧 `pickedBySession` 或 `active-canvas-changed`。
- `plugins/omnimux-workflow/src/client/projects/canvasTabRouting.test.mjs` :: `AC-08: 【二轮复审 缺陷 1】CanvasTab 优先级调整：显式 scope 优先于 activeCanvasWsId 缓存与 validTabWsId`
  - 原断言：要求旧 `explicitWorkspaceId` 七段优先级。
  - 必须改的理由：六路优先级链整体删除，画布目标改由 `WorkspaceContextStore` 单一解析。
  - 新期望证据：测试 `resolveWorkspaceContextPage` 的 activePage/pageId 解析，并断言 CanvasTab 不再出现旧优先级变量。
- `plugins/omnimux-workflow/src/client/projects/canvasTabRouting.test.mjs` :: `AC-09: 【二轮复审 缺陷 2】ProjectLibraryPage handleOpenPage 移除异步提前派发，委托 activateProjectCanvas`
  - 原断言：要求 `handleOpenPage` 直接调用 `activateProjectCanvas`。
  - 必须改的理由：打开链路统一收敛到 `ProjectNavigationService.openPage`。
  - 新期望证据：断言 `navigation.openPage` 调用、无 `selectedProject.sessionId`、无旧全局事件。
- `plugins/omnimux-workflow/src/client/projects/projectLibraryPage.test.mjs` :: `handleOpenPage passes the session-navigation seam and canvasWorkspaceId into activateProjectCanvas`
  - 原断言：要求直接调用 `activateProjectCanvas` 与旧事件广播。
  - 必须改的理由：项目导航统一走 `ProjectNavigationService`，旧直调会绕过工作区解析。
  - 新期望证据：断言 `navigation.openPage` 与 `projects.openCanvasFailed`，并断言旧 sessionId/事件不存在。
- `plugins/omnimux-workflow/src/client/better-sidebar-inject.test.mjs` :: `inject 回调注册的标签与全局绑定随注入生命周期释放，而不是等根插件卸载`
  - 原断言：注入生命周期内 effect 数量为 4。
  - 必须改的理由：新增 `CanvasPresenceController` 生命周期 effect。
  - 新期望证据：数量为 5，并仍断言三个标签注册与解绑。
- `plugins/omnimux-workflow/src/client/projects/projectLibraryPage.apps.test.mjs` :: `卡片「编辑」打开所属项目画布并把工作流组写进 tab meta，且不提前广播无 sessionId 事件`
  - 原断言：mock 旧 `activateProjectCanvas`/`sessionId` 链路。
  - 必须改的理由：编辑入口改走 `ProjectNavigationService.openProject`，测试需提供工作区账本和会话快照。
  - 新期望证据：仍断言画布 tab 打开与 focusGroup meta，不出现未带 sessionId 的全局事件。
- `plugins/omnimux-workflow/src/client/projects/projectLibraryPage.apps.test.mjs` :: `旧记录没有 projectId 时按 workspaceId 反查所属项目并落到同一个会话`
  - 原断言：依赖旧 `canvasWorkspaceIds` 回退与 `sessions.open`。
  - 必须改的理由：新模型按项目 `pages` 与工作区 path 解析。
  - 新期望证据：测试夹具提供 `path/pages`，断言打开画布 tab。
- `plugins/omnimux-workflow/src/client/projects/projectLibraryPage.apps.test.mjs` :: `点创作页卡片：打开期间显示「打开中」并忽略重复点击，结束后复位可再次打开`
  - 原断言：mock 旧 `createProjectSession` 与直接 `activateProjectCanvas`。
  - 必须改的理由：点击创作页改走 `ProjectNavigationService.openPage`。
  - 新期望证据：保留「打开中」、重复点击拦截与复位断言，改为 mock 工作区/会话服务。
- `plugins/omnimux-workflow/tests/ai-app-library.e2e.test.mjs` :: `旅程 1→7：一次会话走完分类切换、空态、网格、过滤、开标签页、菜单、删除与编辑`
  - 原断言：测试夹具给旧项目记录直接打开画布。
  - 必须改的理由：新模型要求项目有 path、workspace 账本与会话快照。
  - 新期望证据：夹具补 path/workspace/sessions 后，编辑仍打开画布并写 focusGroup meta。
