# 规格：创作画布 ↔ 项目 ↔ 工作区 绑定（Issue #2104）

- 状态：实现中
- 归属包：`plugins/omnimux-workflow`（host 侧绑定 + 客户端跟随）；`plugins/omnimux`（工作台打开反馈）
- 相关取证：`.agent-reports/2026-09-16-project-canvas-relation/REPORT.md`

## 问题

工作区文件夹里创建了创作画布，但项目页看不到该项目：项目只在「执行子图含媒体生成节点」时由 `ensureProjectBound` 惰性创建；纯建画布不触发。画布页也不会跟随当前工作区。

## 术语

- **工作区文件夹**：DSH 会话的 `cwd`，同时是库根（默认 `~/Movies/OmniMux/Projects`）下一层的项目候选目录。
- **项目**：工作区文件夹内存在合法 `.omnimux/project.json` 的目录。
- **创作页**：`project.pages[]` 的一项，绑定一个画布工作区 `ws_*`。

## 目标行为

### G1 工作区内建画布 ⇒ 自动登记项目
Agent 通过 `workflow_create` 在当前会话所属工作区文件夹内创建画布后，该文件夹应被登记为项目：`project.json` 落在**既有文件夹**内，标题取文件夹名，`canvasWorkspaceIds` 含该画布，`pages[]` 至少一页指向该画布，`activePageId` 指向它。

### G2 一项目多创作页
同一工作区再建画布时，登记为该项目的新创作页，不覆盖既有页。

### G3 画布跟随工作区
切换工作区（=切换会话）后，画布页解析到该会话所属项目的当前创作页。

### G4 打开失败的可用反馈
`workbench_open_tab` 命中会话配额时返回面向用户的中文原因，不静默失败。

## 验收标准（可测）

| 编号 | 场景 | 期望 | 判据 |
| --- | --- | --- | --- |
| A1 | 会话 cwd 位于库根内、该目录无 `project.json`；`workflow_create` 建画布 | 目录内出现 `.omnimux/project.json` | `canvasWorkspaceIds` 含新画布 id；`pages[0].canvasWorkspaceId` 等于该 id；`title` 等于文件夹名 |
| A2 | 同一目录再建第二个画布并登记 | 项目两页 | `pages.length === 2`，两页 `canvasWorkspaceId` 互不相同，`activePageId` 指向新页 |
| A3 | 会话 cwd 在库根之外 | 不写入、不报错 | 返回 `null`；画布创建仍成功 |
| A4 | 目录已有 `project.json` | 复用而非覆盖 | 不抛 `project-exists`；既有 `pages` 保留 |
| A5 | 登记过程抛错 | 画布创建不受影响 | `workflow_create` 仍返回 workspace |
| A6 | 切换会话后画布页解析 | 目标是当前会话所属项目的当前创作页 | 客户端解析优先级含该结果 |
| A7 | `workbench_open_tab` 命中配额 | 中文可读原因 | 返回值含用户可读文案，非仅 `quota-exceeded` |

## 非目标

- 不新建第二套画布/项目存储；复用 `ProjectStore` / `WorkspaceStore` / `paths.ts` 守卫。
- 不做库外目录写盘；不改变「删除项目只摘 json、不 rm 用户文件夹」红线。
- 不改媒体生成触发的既有 `ensureProjectBound` 路径语义。

## 风险

- 跨插件取会话 cwd（`agents` 服务）在宿主不可用时，登记降级为 no-op，不得报错。
- 并发建画布可能竞争写 `project.json`：`create` 抛 `project-exists` 时按 A4 复用处理。
