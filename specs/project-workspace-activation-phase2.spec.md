# 阶段 2 规格：收口项目—工作区模型并修复 stage 契约回归

Issue: 待建 · 模块: omnimux-workflow / omnimux · 风险等级: R3

## 新用户与产品基线

全新用户机器：无项目库条目、无会话、工作区列表最多一条空工作区。用户从「新建项目」开始，必须同时得到工作区（path=项目根）、会话（cwd=项目根）、v2 项目档案、默认创作页和一张真实画布。之后打开项目、同工作区新建会话、切换工作区、切换创作页，都不得出现未分组会话、空白画布、跨工作区串台。

本阶段不做旧数据迁移：旧格式 `project.json`（含 `sessionId` / `canvasWorkspaceIds`）直接不被 v2 解析器接受，扫描时跳过。

## 一、背景

阶段 1（提交 `531813dd2`）已把项目打开改为工作区锚定，新增 `WorkspaceContextStore`、`ProjectNavigationService`、`CanvasPresenceController`，并删除了 `CanvasTab` 的会话级画布路由。但仍有三个缺口：

1. `pnpm verify:stages` 的 workflow 阶段失败：`api.getUiContext().sessionId` 返回 `default`，期望当前夹具会话。这是阶段 1 引入的回归，阻塞合并。
2. 旧入口未收口：`AppTab`（AI 应用编辑/副本）、`ensureProjectBound`（媒体生成前在默认库新建项目）、`GET /api/projects/session-binding`（读取即建项）仍会制造未分组会话或野生项目。
3. 项目档案仍是 v1（`sessionId` + `canvasWorkspaceIds`），与新模型两套并存。

## 二、范围与验收

### A. 修复 stage 契约回归（P0，阻塞）

- 现象：workflow 阶段在「切换会话后断言 UI 上下文」处失败，`sessionId` 为 `default`。
- 必须根因定位，不得通过放宽夹具断言、跳过该阶段或删除断言来「修好」。
- 若根因在阶段 1 新增的客户端模块与宿主绑定顺序，允许调整创建时机与订阅面（例如 presence 改为按需创建、只用 `betterSidebar.getSnapshot().sessionId`），但不得移除画布跟随工作区能力。
- 验收：`pnpm verify:stages` 全绿；`pnpm --filter omnimux-workflow test` 全绿。

### B. 初始化状态 E2E（P0）

新增 `plugins/omnimux-workflow/tests/e2e/project-workspace-activation.journey.mjs`，在 `verify:app:live --mode=ui` 的全新 `DSH_HOME` 上运行：

| 步骤 | 期望 |
|---|---|
| 起点 | 项目库为空；无画布 tab；无 `omnimux:latest-active-canvas` |
| 新建项目 | 出现新工作区（path=项目根）、会话（cwd=项目根）、项目、默认创作页、画布 tab 且岛已渲染 |
| 项目库点该项目 | 主区切到该项目会话；画布显示 `activePageId` |
| 同工作区新建会话 | 画布仍是同一页；输入框工作区已选中 |
| 打开第二个项目 | 画布切到第二个项目页；不显示第一个项目画布 |
| 未建项工作区开画布 | 显示未建项引导；磁盘无 `.omnimux` |

同时重写 `tests/e2e/project-page-session-navigation.journey.mjs`：删除 `project.sessionId` 断言，改为「会话 cwd = 项目 path」「画布 pageId = activePageId」。

证据落到 `docs/evidence/2026-11-1x-project-workspace-activation/`（截图 + JSON），并 `git add -f`。

### C. 旧入口收口（P0）

| 入口 | 期望 |
|---|---|
| `AppTab` 编辑/副本 | 走 `ProjectNavigationService`；删除 `latest-active-canvas` 写入与 `active-canvas-changed` 派发 |
| `newProject.openOnSession` | 同上，只保留 `activateProjectCanvas` + 上下文刷新 |
| `ensureProjectBound` | 未绑定画布不再在默认库建项目：有会话 cwd 就就地建/绑；无 cwd 则 `project-required` 可见失败 |
| `GET /api/projects/session-binding` | 删除路由与客户端函数；Agent 侧 cwd 绑定保留 |

### D. 项目 schema v2（P1）

- `schemaVersion = 2`，字段仅 `id/title/createdAt/updatedAt/activePageId/pages[]`；删除 `sessionId`、`canvasWorkspaceIds`。
- `ProjectStore.create` 只收 `{ projectRoot? }`；`bindSession` 删除；`findByCanvasWorkspaceId` 只扫 `pages`。
- 消费点（`appLibrary`、`newProject.activeCanvasId`、`publishProjectBinding`、`agentToolShared`、`agentReadTools`、`client/api.js` typedef）全部改读 `pages`。
- 验收：`rg "project\.sessionId|canvasWorkspaceIds" plugins/omnimux-workflow/src` 只剩迁移说明注释；测试、typecheck 全绿。

### E. 画布关闭状态（P1）

- 画布 tab 描述符加 `onClose`，用户关闭后按工作区记为隐藏；切换会话不再自动弹回；从项目页打开时恢复。
- 验收：单测覆盖「关闭后切会话不自动打开」「项目页重新打开恢复」。

## 三、测试与验证

1. 单测：stage 回归的根因用例、`ProjectNavigationService`、`CanvasPresence`、schema v2 解析、旧入口不再读 `project.sessionId`。
2. 浏览器：两条 journey（见 B）+ `pnpm test:worktree-web workflow`。
3. 命令集：`pnpm --filter omnimux-workflow test`、`typecheck`、`pnpm test:agent-tools`、`pnpm verify:stages`、`pnpm verify:product-baseline`、`git diff --check`。

## 四、非目标

- 不改官方 DSH 源码，不 fork `dsh-better-sidebar`，不把画布搬到 `shell.overlay`。
- 不做 v1 数据迁移、不做云端协作。
- 不改模型路由、鉴权、计费、发布流程。

## 假设

stage 夹具跑在 jsdom 无头宿主上，用 mock 的 `betterSidebar` / `sidebarRight` / `sessions`；它不挂载任何业务 Tab。真实桌面/网页宿主提供 `uiWorkspace.openSession`、`sidebarRight.mounted` 与 `betterSidebar.subscribeState`。初始化状态由 app QA 的全新 `DSH_HOME`（一个空工作区、零会话、零项目）代表。

## 证伪方式

若修复后 `pnpm verify:stages` 仍在该断言失败，或需要放宽断言才能通过，则 A 不成立。若初始化旅程里出现未分组会话、画布目标来自 `latest-active-canvas`、或同工作区两个会话看到不同 `activePageId`，则 B/C 不成立。若 `rg` 仍能命中生产代码里的 `project.sessionId` / `canvasWorkspaceIds` 读取点，则 D 不成立。
## 旧标准变更

- `plugins/omnimux-workflow/src/client/projects/appTabSessionSwitch.regression.test.mjs` :: `统一的会话切换辅助调用 focusSessionForCanvas，而不是已移除的 sessions.open`
  - 原断言：要求 AppTab 保留 `focusAppSession`/`focusSessionForCanvas`。
  - 必须改的理由：编辑/副本入口统一改走 `ProjectNavigationService`，不再直接切会话。
  - 新期望证据：断言 `createProjectNavigation`、`navigation.openProject`，且不再出现 `project.sessionId`/`focusAppSession`。
- `plugins/omnimux-workflow/src/client/projects/appTabSessionSwitch.regression.test.mjs` :: `「编辑」入口：先切会话，切换失败明确降级且不弹成功提示`
  - 原断言：要求 `focusAppSession(project?.sessionId)` 先于 `activateProjectCanvas`。
  - 必须改的理由：新入口由项目导航统一解析工作区/会话，旧的 sessionId 指针已废弃。
  - 新期望证据：断言 `navigation.openProject(project, ...)`、`focusGroupId: target.groupId`，且无 `latest-active-canvas`/`active-canvas-changed`。
- `plugins/omnimux-workflow/src/client/projects/appTabSessionSwitch.regression.test.mjs` :: `「创建副本」入口：先切会话，切换失败不弹成功提示`
  - 原断言：要求 `sessionReady = focusAppSession(project?.sessionId)` 与条件激活。
  - 必须改的理由：副本入口同样改走项目导航。
  - 新期望证据：断言 `navigation.openProject(project, ...)`、`focusGroupId: groupId` 与失败文案。
- `plugins/omnimux-workflow/src/client/projects/canvasTabRouting.test.mjs` :: `AC-03: activateProjectCanvas 穿透单例更新 meta 并广播 omnimux:active-canvas-changed`
  - 原断言：要求派发 `omnimux:active-canvas-changed`。
  - 必须改的理由：全局画布事件已删除，目标改由上下文/画布 presence 驱动。
  - 新期望证据：断言不再派发事件（`events.length === 0`），仍断言 meta 穿透。
- `plugins/omnimux-workflow/src/client/projects/canvasTabRouting.test.mjs` :: `AC-07: 【缺陷 3 整改】activateProjectCanvas 完整携带 sessionId 与 projectId 等上下文`
  - 原断言：要求事件载荷携带 sessionId/workspaceId。
  - 必须改的理由：事件已删除。
  - 新期望证据：断言事件数为 0，meta 仍携带完整上下文。
- `plugins/omnimux-workflow/src/client/projects/projectCanvas.test.mjs` :: `activateProjectCanvas 传递 canvasWorkspaceId 到 scope、meta、updateTab 并广播 active-canvas-changed`
  - 原断言：要求广播事件及载荷。
  - 必须改的理由：全局画布事件已删除。
  - 新期望证据：改为断言不派发事件，保留 scope/meta/updateTab 断言。
- `plugins/omnimux-workflow/src/client/projects/projectCanvas.test.mjs` :: `activateProjectCanvas 在 openTab 之后异步对齐会话，对齐成功才补 meta 与广播`
  - 原断言：要求对齐后广播事件。
  - 必须改的理由：事件已删除。
  - 新期望证据：仍断言对齐后补 openTab/updateTab，事件数为 0。
- `plugins/omnimux-workflow/src/client/projects/projectCanvasAlignment.test.mjs` :: `超时窗口内零写入，目标会话成为前台后才补 openTab + meta + 广播，随即解绑`
  - 原断言：要求补位后广播事件。
  - 必须改的理由：事件已删除。
  - 新期望证据：仍断言补位后 openTab/updateTab 与解绑，事件数为 0。

- `plugins/omnimux-workflow/src/workflow/routes/projectAssetsBinding.test.mjs` :: `instantiate: unbound canvas binds one reusable project and preserves graph`
  - 原断言：未绑定画布会自动创建一个可复用项目并写入项目资产。
  - 必须改的理由：产品已确定未绑定画布走用户级 free root，不创建默认项目。
  - 新期望证据：状态 200、`projectStore.list().length === 0`、资产落在 free root。
- `plugins/omnimux-workflow/src/workflow/routes/projectAssetsBinding.test.mjs` :: `ingest: unbound canvas binds one reusable project and preserves graph`
  - 原断言：同 instantiate 的自动建项目语义。
  - 必须改的理由：同上，改走 free root。
  - 新期望证据：状态 200、无项目记录、资产可从 free root 读取。
