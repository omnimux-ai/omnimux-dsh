# Spec: 项目 ↔ 工作区 B2（API 预检 + 独立/绑定 UI + 两级删除）

- 类型: 功能（API + 客户端 UI）
- 范围: `plugins/omnimux-workflow/src/projects/routes.ts`、`src/client/projects/{api.js,newProject.js,NewLocalProjectDialog.jsx,ProjectFolderCard.jsx,ProjectLibraryPage.jsx}`、`src/client/{api.js,locales.js,styles.js}`、对应测试
- 基线: main `f7a638b6`（B1/#4098 已合入；B2 只在其上接 API/UI）
- 风险: R2（涉及创建/删除的写路径与项目列表语义；删除为数据安全关键点）

## 1. 范围
B1 提供 `ensureProject`（S0–S4 / 幂等 / 事务 / 并发）与单一真源。B2 把模型接到 HTTP 与 UI：
- API：`POST /api/projects` 支持 `mode`/`workspaceDir`；新增**只读对齐预检**；错误码语义化；列表区分独立/关联工作区。
- UI：存放位置可选（默认独立项目）；选中目录先预检 → 中性状态 + 明确动作；两级删除；zh/en 文案。
- 不改 B1 的 schema 迁移与 `ensureProject` 状态机语义。

## 2. API 契约
### 2.1 `POST /omnimux-workflow/api/projects`
- `{ mode: 'independent', title }` → `ensureProject({mode:'independent'})`，返回 `{ project, action }`；重复调用 `action='existing'`（幂等，不新增文件夹/页）。
- `{ mode: 'workspace', workspaceDir, title }` → `ensureProject({mode:'workspace', workspaceDir})`；对目录执行 S0–S4：`initialized | adopted | repaired | adopted-files | converged | existing`，**已存在项目返回 200，绝不 409**。
- `mode` 非法 → 400 `invalid-mode`；`workspace` 缺 `workspaceDir` → 400 `invalid-workspace-dir`。
- 不带 `mode` 的旧调用保持原 `store.create(title, {projectRoot,canvasWorkspaceIds})` 行为（向后兼容）。
- I3：ensure 成功后就每个 page 检查画布文件；缺失则 `workspaceStore.create(page.title, canvasWorkspaceId)` 补一张空画布（打开时由 WorkspaceStore 懒拷贝到项目），避免首开 `workspace-not-found`；画布层不可用时忽略，不阻断项目写入。

### 2.2 `POST /omnimux-workflow/api/projects/preflight`（只读）
- 入参 `{ mode?, workspaceDir?, projectRoot?, title? }`；返回 `{ mode, state, action, root, workspaceDir, project }`。
- `state`：`S0 | S1 | S2 | S3 | S4 | independent`；`action`：`initialize | open | rebuild | repair | converge | create-independent`。
- **零写盘**：不 mkdir（**库根不存在时也不得创建**，`createProjectStore({ensureLibrary:false})`）、不写 project.json、不写 registry、不建画布；S4 只读检测重复索引但**不收敛**。
- S4 只判「本 root 重复」与「同 id 的双 root」；其它 root 自身的重复索引不属于本 root 的 S4（由它们各自 converge 处理）。
- 判定：S0 无档案无画布；S1 合法 v2；S2 v1/坏 JSON/容错结构；S3 无（或坏）档案但有 `.omnimux/canvases/*.json`；S4 registry 重复 root / 同 id 双 root；`independent` 默认库独立项目。
- `workspaceDir` 不存在/非目录 → 400 `invalid-workspace-dir`。

### 2.3 `DELETE /api/projects/:id`
- 默认「移出项目库」：摘 `project.json` + 索引；画布/资产/用户文件保留。
- `?mode=purge`「删除项目」：在移出基础上再删 `.omnimux/canvases/` 与 `assets.json`；若有 `workspaceStore`，**先摘项目档案、后**级联删除该页的 **home canvas 副本**（`WorkspaceStore.remove`），避免孤儿；项目根目录用户自有文件保留。
  - 顺序契约：`store.remove` 失败（路径/写安全）时 home canvas 必须原样保留，不得出现「项目还在、画布已删」的中间态；失败注入用例锁定该顺序。
- `mode` 非 `purge` → 400 `invalid-mode`。
- 删了不复活：purge 后同 root `ensureProject` 必须重新 `initialized`（不得 `adopted-files` 复活旧画布）。

### 2.4 列表
- `GET /api/projects` 每项附 `bound: boolean` + `workspaceDir: string|null`（`bound = path` 不在默认库内，含符号链接库根的 realpath 判定）；UI 据此区分「独立项目 / 关联工作区」。

### 2.5 错误码
- 新增映射：`invalid-workspace-dir` 400、`invalid-mode` 400、`project-lock-timeout` 409、`project-lock-failed` 409；`EnsureProjectError` 与 `ProjectStoreError` 同级映射，未知错误仍 500。
- 客户端不再把 `project-exists` 当流程分支；`project-record-invalid` 保留可读文案。

## 3. UI 契约
- 新建弹窗：存放位置**可选**；未选目录 = 独立项目（默认库）；选中目录后调用预检并显示**中性提示**（`.omnimux-new-project-preflight`，非错误色），主按钮随 `action` 切换：`初始化 → 创建项目`、`open/converge → 打开该项目`、`rebuild → 重建并打开`、`repair → 修复并打开`。
- 不再有「已有项目…新建创作页」红字二次提交流程；`error` 只用于真实失败。
- 预检失败（目录无效/请求失败）：显示**中性失败提示**（`projects.preflight.failed`）并禁用提交，绝不回退成「将作为独立项目创建」。
- 项目卡片：徽标显示「独立项目」或工作区目录名（关联工作区）；菜单区分「移出项目库」（非危险）与「删除项目」（危险，`data-danger`），各自二次确认；删除项目确认文案明确写「删除画布与资产」。
- zh/en 文案齐全（`projects.independent/bound/removeFromLibrary*/purge*/openProject/rebuildAndOpen/repairAndOpen/preflight.*`）。

## 旧标准变更
- `plugins/omnimux-workflow/src/client/projects/NewLocalProjectDialog.test.mjs` :: `existing project prompt switches submit button and carries confirmedExisting on second submit`
  - 原断言：第一次提交返回 `{existing:true}` 后按钮切成 `projects.existingConfirmSubmit`，第二次提交携带 `confirmedExisting:true`。
  - 必须改的理由：B2 用「选目录 → 只读预检 → 中性状态 + 明确动作」替代旧「红字已有项目 + 二次确认」流程；`runNewProject` 不再返回 `existing` 分支，旧断言描述的流程已不存在。
  - 新期望证据：新增 `preflight 中性状态与明确动作：open/rebuild/repair 不再红字`（状态/动作/按钮/提交 payload 全断言，且断言不出现 `projects.existingConfirm`）与 `默认独立项目：无目录时不发预检、直接提交 independent`。

- `plugins/omnimux-workflow/src/client/projects/NewLocalProjectDialog.test.mjs` :: `error prop matching existingConfirm activates confirmedExisting state`
  - 原断言：`error` 命中 `projects.existingConfirm` 时自动进入确认态并发 `confirmedExisting:true`。
  - 必须改的理由：同一流程删除，`confirmedExisting` 状态已从组件移除；`error` 只表示真实失败。
  - 新期望证据：上述两条新用例；另在 `preflight 中性状态…` 中断言状态元素无 `omnimux-workflow-form-error` 类。

- `plugins/omnimux-workflow/src/client/projects/NewLocalProjectDialog.test.mjs` :: `remove returns to drop zone; pick directory fills card`
  - 原断言：选中目录后提交 `{title, projectRoot}`。
  - 必须改的理由：B2 选中目录即「绑定/对齐工作区」，提交改为 `{title, mode:'workspace', workspaceDir}`，不再伪造 `projectRoot` 流程分支。
  - 新期望证据：断言 `mode==='workspace'`、`workspaceDir==='/tmp/omnimux-test'`、无 `projectRoot`；预检请求在选目录后触发。

- `plugins/omnimux-workflow/src/client/projects/newProject.test.mjs` :: `adds a page on the current folder instead of creating another project`
  - 原断言：已有项目时自动 POST 新创作页（`action='page-added'`、`posts[0].title='创作页 2'`）。
  - 必须改的理由：B2 打开既有项目不再隐式加页（加页是显式动作）；改为提交 `{mode:'workspace', workspaceDir}` 并对齐/打开。
  - 新期望证据：改写为 `adopts a project on the current folder without adding a page`：断言 `action='existing'`、`mode/workspaceDir`、`pagePosts===0`。

- `plugins/omnimux-workflow/src/client/projects/newProject.test.mjs` :: `asks before adding a page when switching to another existing project folder`
  - 原断言：切到另一个已有项目目录时返回 `{ok:false, existing:true}`，确认后才加页。
  - 必须改的理由：红字确认分支删除；既有项目直接打开（`action='open'`），不自动加页。
  - 新期望证据：改写为 `opens an existing project in another folder without a red-text confirm`：`ok=true`、`action='open'`、`existing===undefined`、`pagePosts===0`。

- `plugins/omnimux-workflow/src/client/projects/ProjectFolderCard.menu.test.mjs` :: `more-menu items use the leadingIcon slot contract, never children/.label`
  - 原断言：菜单固定 2 项，第二项 `projects.delete` 且危险。
  - 必须改的理由：两级删除把删除拆成「移出项目库（非危险）」+「删除项目（危险）」，菜单变 3 项。
  - 新期望证据：3 项、标签 `projects.rename/removeFromLibrary/purge`、`remove` 无 `data-danger` 且带 `data-omnimux-folder-remove`、`purge` 带 `data-danger` 与 `data-omnimux-folder-purge`。

- `plugins/omnimux-workflow/src/client/projects/ProjectFolderCard.menu.test.mjs` :: `more-menu keyboard path: initial focus, arrows, Home/End, Escape refocus, Tab close, outside click`
  - 原断言：ArrowDown/ArrowUp 在 2 项间循环，Home/End 落 0/1。
  - 必须改的理由：菜单 3 项后索引与循环终点变化。
  - 新期望证据：3 项下 ArrowDown 依次 1→2→0 循环、ArrowUp 从 0 落 2、End 落 2；其余键盘路径（Escape/Tab/外部点击）原样。

## 4. 验证
- 单测：`projects.test.mjs`（预检 S0–S4 + 零写盘 / POST mode 幂等与非 409 / I3 补空画布 / 两级删除 + 删了不复活 / 列表 bound）；`NewLocalProjectDialog.test.mjs`（默认独立、四态动作、无红字）；`newProject.test.mjs`（独立/工作区提交与打开、不自动加页）；`ProjectFolderCard.menu.test.mjs`（3 项、两级删除、键盘）；`project-locales.test.mjs`（zh/en 新键与文案区分）。
- 全量 workflow 测试 + typecheck；门禁在**已提交 HEAD** 上跑（base `938b0b3d`）：旧标准声明校验、diff-aware L0、verify:stages、anti-slop、boundaries、product-baseline、plugin-load、model-contracts。
- 证伪：回退「只读预检 → 中性状态/动作」与「两级删除」时对应用例必须变红（PR 附真实输出）。

## 5. 非目标
- 不改 `ensureProject` 状态机与 v1→v2 迁移（B1）；不改画布 ReactFlow 内核；不做云端同步；不在本任务做 Dev 实机验收（归桌面端 B3）。
