# 规格说明：ProjectStore 数据一致性自愈机制与创作页路由重构

## 1. 目标（Objective）
- **核心目标**：实现 OmniMux 后端项目数据层（`ProjectStore`）与路由层（`routes.ts`）的严密一致性与自愈保障，彻底消除创作页画布工作区丢失、`canvasWorkspaceId` 为空以及绑定不一致的问题。
- **业务价值**：在用户查看项目列表、获取单个项目详情、切换创作页或按工作区反查项目时，自动修复历史遗留脏数据，确保每个创作页具备强有效合法的 `canvasWorkspaceId`，并在新建创作页时无缝创建物理工作区。

## 2. 命令（Commands）
- 构建命令：`pnpm --filter omnimux-workflow run build`
- 测试命令：`pnpm --filter omnimux-workflow test` 或 `node --test plugins/omnimux-workflow/src/projects/*.test.mjs`

## 3. 架构与数据契约变更（Contracts & Schema）
1. `plugins/omnimux-workflow/src/projects/schema.ts`：
   - `projectPageSchema` 中的 `canvasWorkspaceId` 约束调整为必填且非空：`z.string().min(1)`。
   - 保留宽松容错解析作为内部兼容兜底，确保磁盘老旧脏文件进入 `ProjectStore` 时能够被读取并进入读时自愈流水线。
2. `plugins/omnimux-workflow/src/projects/ProjectStore.ts`：
   - 新增统一自愈方法 `repairProjectRecord(record: ProjectRecord): ProjectRecord`：
     - a. 若 `record.pages` 为空，补全首个创作页，生成唯一合法的 `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`（优先保留已有 `canvasWorkspaceIds[0]`）；
     - b. 遍历 `record.pages`，对任何缺失或空串的 `canvasWorkspaceId` 分配全新的 `ws_*` ID；
     - c. 收集所有页面的 `canvasWorkspaceId`，更新并去重同步至 `record.canvasWorkspaceIds` 数组中；
     - d. 校验 `record.activePageId`，若为空或不存在于 `pages` 中，安全回落至 `pages[0].id`；
     - e. 若发生任何修复变更，立即调用 `persistProject(dir, nextProject)` 进行原子写盘持久化；
     - f. 在 `get(id)`、`list()`、`setActivePage(projectId, pageId)`、`findByCanvasWorkspaceId`、`findByRoot` 中全面贯穿自愈。
   - 重构 `addPage(projectId: string, pageTitle: string, opts = {})`：
     - a. 确保新页面必有合法的 `canvasWorkspaceId`（若 `opts.canvasWorkspaceId` 为空则生成）；
     - b. 将该 `canvasWorkspaceId` 添加进 `project.canvasWorkspaceIds` 数组中并去重；
     - c. 将 `project.activePageId` 设置为新页面的 `pageId`；
     - d. 持久化原子写盘。
3. `plugins/omnimux-workflow/src/projects/routes.ts`：
   - 在 `POST /omnimux-workflow/api/projects/:projectId/pages` 集合路由处理中：
     - a. 若请求未携带 `canvasWorkspaceId`：
       - 若 `opts.workspaceStore` 存在，调用 `const newWs = opts.workspaceStore.create(title);`，使用 `newWs.id` 作为 `canvasWorkspaceId`；
       - 若 `opts.workspaceStore` 不存在，生成合法的 `ws_*` ID；
     - b. 调用 `store.addPage(projectId, title, { canvasWorkspaceId, loadMemory })`；
     - c. 返回 `{ status: 200, body: { project: updatedProject, page: newPage } }`。
   - 在 `GET /omnimux-workflow/api/projects/session-binding` 路由处理中：
     - a. 确保 `activePage` 优先使用 `activePage?.canvasWorkspaceId`，由自愈逻辑保证 `activePage.canvasWorkspaceId` 必存在，不再盲目取 `record.canvasWorkspaceIds?.[0]`。

## 4. 用户旅程与交互场景（User Journey & Scenarios）
- **场景 1：历史遗留项目无 pages 字段被打开**
  - 用户在项目库中点击打开一个历史旧项目（`pages: undefined`）。
  - 后端在 `get` 时触发自愈，补全首个创作页，`canvasWorkspaceId` 绑定已有画布或生成新画布，写盘持久化。
  - 用户无缝进入创作页，画布不会报空白或 404。
- **场景 2：历史项目某创作页 canvasWorkspaceId 为空**
  - 某个创作页在旧版本中保存了空串或缺失 `canvasWorkspaceId`。
  - 读时自愈机制在扫描列表或获取项目时自动分配全新的合法 `ws_*` 并持久化，去重更新 `canvasWorkspaceIds`。
- **场景 3：客户端调用 POST /pages 新建创作页**
  - 用户在画布顶部点击「+」添加新创作页。
  - 路由自动调用底层 `workspaceStore.create(title)` 创建真实物理画布，并将创建好的 `newWs.id` 赋给新创作页。
  - 接口返回 `{ project, page }`，客户端立即获知新页面的 ID 与 `canvasWorkspaceId`。

## 5. 验收标准与测试策略（Acceptance Criteria & Testing Strategy）
1. 单元测试覆盖：
   - 验证 `projectPageSchema` 拒绝缺失或空串 `canvasWorkspaceId` 的输入。
   - 验证 `repairProjectRecord` 在以下场景中的自愈与原子写盘：
     - `pages` 为空数组或缺失；
     - `pages` 中包含缺少或空串 `canvasWorkspaceId` 的项；
     - `canvasWorkspaceIds` 与 `pages` 中的 `canvasWorkspaceId` 不一致时去重同步；
     - `activePageId` 为空或指向已删除页面时的安全回落。
   - 验证 `addPage` 生成合法 `canvasWorkspaceId` 并更新 `activePageId` 与 `canvasWorkspaceIds`。
   - 验证 `POST /projects/:id/pages` 在注入 `workspaceStore` 时的物理画布创建与返回值结构 `{ project, page }`。
   - 验证 `GET /session-binding` 优先采用 `activePage.canvasWorkspaceId`。
