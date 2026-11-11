# 规格：project.json v2（删除 sessionId / canvasWorkspaceIds）

项目元数据只保留 `pages` 与 `activePageId`；`sessionId` 和 `canvasWorkspaceIds` 不再落盘、不再由客户端或路由读写。项目与工作区仍按路径 1:1 对应，工作区里的画布只能通过项目创作页表达。

## 新用户与产品基线

全新用户首次安装、没有旧项目文件。新建项目时只生成 `<项目根>/.omnimux/project.json`，结构为 v2：`schemaVersion/id/title/createdAt/updatedAt/activePageId/pages`。未绑定画布走用户级 `free/<canvasId>` 目录，不需要旧会话字段。

## 假设

旧项目文件只存在于开发机，仓内没有需要迁移的真实用户档案；读取侧遇到 v1 或更高版本直接跳过，不尝试兼容。项目列表、创作页、应用归属和画布边界判断都可以只依赖 `pages[].canvasWorkspaceId` 与 `activePageId` 完成。

## 证伪方式

如果全量 `omnimux-workflow test` 仍出现依赖 `project.sessionId` 或 `project.canvasWorkspaceIds` 的生产路径/测试失败，或新建项目的 `project.json` 仍写入这两个字段，则本规格不成立。

## 验收标准

| 编号 | 场景 | 期望 |
|---|---|---|
| AC-01 | 新建项目后读取 `project.json` | 只有 v2 字段，无 `sessionId`/`canvasWorkspaceIds` |
| AC-02 | 读取旧 v1 文件 | 返回 null 并跳过，不崩溃 |
| AC-03 | 项目列表/创作页/应用归属 | 全部按 `pages` 与 `activePageId` 工作 |
| AC-04 | 未绑定画布媒体生成 | 仍落用户级 free root，不建默认项目 |
| AC-05 | 全量工作流测试 | 3154 项通过 |

## 旧标准变更

- `plugins/omnimux-workflow/src/projects/projects.test.mjs` :: `T0 schema：冻结版本 + title 边界 + 高版本拒绝`
  - 原断言：版本 1 与 `sessionId/canvasWorkspaceIds` 字段。
  - 必须改的理由：schema 已升到 v2 并删除旧字段。
  - 新期望证据：版本 2、v2 合法对象、版本 3 拒绝。
- `plugins/omnimux-workflow/src/projects/projects.test.mjs` :: `T1 ProjectStore：扫描 list / Host mkdir+seed / remove 不 rm 项目根`
  - 原断言：`created.sessionId === null`、`bindSession` 与 `canvasWorkspaceIds` 反查。
  - 必须改的理由：项目已无 session 指针，反查改走 pages。
  - 新期望证据：`created.pages.length === 1`，按 page 的 canvasWorkspaceId 反查命中。
- `plugins/omnimux-workflow/src/projects/projects.test.mjs` :: `T01: ProjectStore 数据一致性与读时自愈机制 (repairProjectRecord)`
  - 原断言：空 pages 时优先保留 `canvasWorkspaceIds[0]` 并同步数组。
  - 必须改的理由：v2 没有该数组，自愈只能生成合法 ws id。
  - 新期望证据：生成合法 `ws_*` 且 activePageId 回落到 pages[0]。
- `plugins/omnimux-workflow/src/projects/projects.test.mjs` :: `T02: POST /pages 物理工作区自动创建与 session-binding 修正`
  - 原断言：`project.canvasWorkspaceIds.includes(...)`。
  - 必须改的理由：创作页只存在 pages 数组。
  - 新期望证据：`project.pages.some(page.canvasWorkspaceId === ...)`。
- `plugins/omnimux-workflow/src/projects/workspace-canvas-sync.test.mjs` :: `Agent 建画布时 allowCreateOutsideLibrary 自动就地在工作区建项`
  - 原断言：`bound.canvasWorkspaceIds.includes(...)`。
  - 必须改的理由：v2 用 pages 表达。
  - 新期望证据：`bound.pages.some(page.canvasWorkspaceId === ...)`。
- `plugins/omnimux-workflow/src/projects/workspaceProjectBinding.test.mjs` :: `A1：库内新工作区建画布 → 登记项目与首个创作页`
  - 原断言：`record.canvasWorkspaceIds` 与 `record.sessionId`。
  - 必须改的理由：v2 删除这两个项目字段。
  - 新期望证据：`record.pages.map(...)` 与 `path/title/activePageId`。
- `plugins/omnimux-workflow/src/projects/workspaceProjectBinding.test.mjs` :: `A5：宿主会话解析不可用/抛错时降级为 null`
  - 原断言：`record.canvasWorkspaceIds`。
  - 必须改的理由：v2 用 pages。
  - 新期望证据：`record.pages.map(...)` 包含目标画布。
- `plugins/omnimux-workflow/src/workflow/execution-routes.test.mjs` :: `unbound media generate → 惰性种子项目 200；text generate 仍可通过`
  - 原断言：未绑定媒体生成自动建项目并写 `canvasWorkspaceIds`。
  - 必须改的理由：产品已改为用户级 free root，不建项目。
  - 新期望证据：执行 200、项目列表 0、产物在 `free/<ws>/artifacts`。
- `plugins/omnimux-workflow/src/workflow/agent-tools.test.mjs` :: `workflow_run unbound media generate 惰性种子项目且幂等`
  - 原断言：工作流执行自动建种子项目。
  - 必须改的理由：同上，改走 free root。
  - 新期望证据：项目列表 0、产物在 free root。
- `plugins/omnimux-workflow/src/workflow/routes.smoke.test.mjs` :: `project assets.json GET/PUT/mkdir via dispatcher (canonical + legacy)`
  - 原断言：未绑定画布资产 GET 返回 400 project-required。
  - 必须改的理由：未绑定画布有用户级 free root，应返回空资产。
  - 新期望证据：GET 返回 200 且 items 为空。
- `plugins/omnimux-workflow/src/client/projects/appLibrary.test.mjs` :: `projectId 命中不到时，回落到 canvasWorkspaceIds / pages 反查（兼容旧记录）`
  - 原断言：支持 `canvasWorkspaceIds` 反查。
  - 必须改的理由：v2 项目只有 pages。
  - 新期望证据：仅按 pages 反查。
- `plugins/omnimux-workflow/src/client/projects/appLibrary.test.mjs` :: `projectOwnsWorkspace 认 canvasWorkspaceIds 与任一创作页`
  - 原断言：数组与 pages 都认。
  - 必须改的理由：v2 只认 pages。
  - 新期望证据：仅 pages 命中。
- `plugins/omnimux-workflow/src/client/projects/appOwnershipFork.test.mjs` :: `createProjectForkFromManifest 创建副本全流程`
  - 原断言：项目夹具使用 `canvasWorkspaceIds`。
  - 必须改的理由：副本项目响应只含 pages。
  - 新期望证据：夹具改为 pages，流程仍通。
- `plugins/omnimux-workflow/src/client/projects/appOwnershipFork.test.mjs` :: `为预置应用创建独立项目工程与打组工作区`
  - 原断言：项目夹具使用 `canvasWorkspaceIds`。
  - 必须改的理由：同上。
  - 新期望证据：pages 夹具下仍创建成功。
- `plugins/omnimux-workflow/src/client/projects/appOwnershipFork.test.mjs` :: `支持自定义 projectTitle 和自选工作区 projectRoot`
  - 原断言：项目夹具使用 `canvasWorkspaceIds`。
  - 必须改的理由：同上。
  - 新期望证据：pages 夹具下仍创建成功。
- `plugins/omnimux-workflow/src/client/projects/appOwnershipFork.test.mjs` :: `传入未规范化的快照时，createProjectForkFromManifest 自动自愈连线与节点`
  - 原断言：legacy project 使用 `canvasWorkspaceIds`。
  - 必须改的理由：v2 项目只读 pages。
  - 新期望证据：legacy 项目改为 pages 后仍自愈。
- `plugins/omnimux-workflow/tests/app-edit-and-fork-flow.e2e.test.mjs` :: `E2E: 场景 3 & 4 - 应用归属自适应分诊、副本创建与工作流组打包`
  - 原断言：项目夹具使用 `canvasWorkspaceIds`。
  - 必须改的理由：v2 项目只读 pages。
  - 新期望证据：pages 夹具下流程不变。
- `plugins/omnimux-workflow/tests/app-edit-and-fork-flow.e2e.test.mjs` :: `E2E: 场景 7 - 官方预设工程与历史遗留拓扑在副本创建时自愈连线 Handle (out/in) 且模型层级与卡槽合规 (Issue #2648)`
  - 原断言：项目夹具使用 `canvasWorkspaceIds`。
  - 必须改的理由：同上。
  - 新期望证据：pages 夹具下仍生成合法拓扑。
