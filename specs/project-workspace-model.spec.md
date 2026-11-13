# Spec: 项目 ↔ 工作区 数据/契约层（B1：ensureProject S0–S4）

- 类型: 功能（数据模型 + 契约层）
- 范围: `plugins/omnimux-workflow/src/projects/{schema.ts,ProjectStore.ts,ensureProject.ts}`、`projects.test.mjs`
- 风险: R2（单一真源/事务/并发属数据安全关键点；不改 routes/client）

## 1. 背景与产品模型
PRD `project-workspace-model` v2（用户已拍板）：**项目可独立、绑定可选**。
- 独立项目：`root` 在默认库，不绑定任何工作区（0 工作区）。
- 绑定项目：`root` 就是所选工作区目录（由路径派生，不做双根/逻辑指针）。
- 基数：`Workspace 1 — 0..1 Project` / `Project 1 — 0..1 Workspace` / `Project 1 — 1..N Page`。
- A（#4092）的 v1→v2 读迁移是本层 S2 的前提，本层**复用 `parseProject`，不复制第二份迁移逻辑**。

## 2. 单一真源
- 权威 = `<root>/.omnimux/project.json`（合法 + `pages[]`）+ `<root>/.omnimux/canvases/<canvasWorkspaceId>.json`。
- `.external-projects.json` 降为**可重建索引**：文件优先；扫描时自愈（有文件补索引、无文件删索引、坏档案保留登记 + diagnostic；均不动用户文件）。
- 不变量：一个 root 最多一个 project.json；pages ≥1；activePageId ∈ pages；page.canvasWorkspaceId 非空。

## 3. `ensureProject({ mode, workspaceDir?, title? })` 状态机
唯一入口（`ProjectStore.ensureProject`，实现于 `ensureProject.ts`）：

| 状态 | 目录现状 | 动作 | 返回 action |
|---|---|---|---|
| S0 | 无 project.json 且无画布文件 | 原子写 project.json + 首创作页（有效 canvasWorkspaceId） | `initialized` |
| S1 | 有合法 project.json | 采纳并登记（缺 canvasWorkspaceId/activePageId 时补齐） | `adopted` |
| S2 | project.json 为 v1 / 坏 JSON / 不支持版本 | 复用 `parseProject` 迁移或按画布容错重建并写回 v2 | `repaired` |
| S3 | 无/坏档案但存在 `.omnimux/canvases/*.json` | 以画布文件重建 pages，**保留原 canvasWorkspaceId**，不覆盖文件 | `adopted-files` |
| S4 | registry 指向同一 root 的重复记录 / 同 id 双 root | 以文件为准收敛索引（文件全部保留） | `converged` |
| — | 同一调用重复执行 | 幂等返回同一 project.id / 同一 root | `existing` |

- **S2 绝不抛 `project-exists`、不返回 409**；错误码语义化（`title-*` / `invalid-workspace-dir` / `project-lock-timeout` / `project-lock-failed`）。
- independent 模式：root = `<libraryRoot>/<sanitizeFolderName(title)>`（确定性 → 重复调用同一 root），不登记外置索引。
- workspace 模式：root = `realpath(workspaceDir)`；root 在库外时登记进 registry（索引，可重建）。

## 4. 事务（无半成品）
- 落盘统一走既有 `persistProject` → 临时文件 + `rename` 原子替换。
- 失败注入（`.omnimux` 只读）下：拿不到锁/写盘失败 → 抛错，目录**没有 project.json**；恢复后重试得到合法档案。
- 不存在「半写坏档案」：rename 前目标文件不存在，rename 后必为完整 JSON。

## 5. 并发
- 进程内：`resolve(root)` 粒度 mutex 串行化（同一 root 的 ensure 排队）。
- 跨进程：`<root>/.omnimux/.lock`（`wx` 创建、25ms 轮询、超时抛 `project-lock-timeout`、`finally` 必释放）。
  - **回收判定以持有者 pid 为准（评审 F1）**：pid 已不存在（ESRCH）→ 死锁立即回收；pid 存活（或 EPERM/不可判定）→ **不按 mtime 年龄抢占**，等超时或持有者释放；仅「pid 不可解析且超过 `min(lockStaleMs, 1s 宽限)`」才按年龄回收。
  - 默认 `lockStaleMs(30s) > lockTimeoutMs(10s)`；避免「合法慢持有者 >stale 被回收 → 两个 project id」的抢占。
  - 不可解析锁（崩溃残留）按 **1s 宽限**回收（评审 F1b）：有效锁是 `wx` 原子创建的完整 JSON，坏文件只可能是崩溃残留；不能等 30s（首次打开必超时），也不能 0（写入瞬间可能读到半文件）。
  - 回归覆盖：仓规测试门禁禁止测试内 spawn 外部进程（`runtime-code-execution-import-needs-review`，不可声明），故以「活 pid（本进程）持锁 + mtime 很旧 → 必须超时且不写盘」「死 pid 锁 → 立即回收」两条确定性用例覆盖同一规则。
- 两并发 ensure 同一工作区 → 同一 project id、1 个 project.json、1 个创作页（后到者重读并复用）。

## 6. `remove()` 语义（本次收窄）
只删除 `<root>/.omnimux/project.json` 并从 registry 摘索引；**保留**用户文件夹、`.omnimux/canvases/` 画布、`assets.json` 与生成物。
理由：画布文件属于用户创作数据，旧实现 `rm -rf .omnimux` 会连带删除用户画布，与「remove 不 rm 用户文件」红线不符。

## 7. 验证（真实命令见 PR）
- 单测：S0 / S1（含幂等）/ S2（v1、坏 JSON）/ S3（保留画布 id、文件不被覆盖）/ S4（registry 收敛）/ independent 幂等 / 并发 / 锁超时与过期回收 / 失败注入 / registry 自愈（删索引、补索引）/ remove 保留用户文件。
- 全量：`projects.test.mjs` + workflow 全量（node 24.18.1 = CI 版本）。
- 门禁：`verify:stages` / anti-slop / `check:boundaries` / diff-aware L0 / 旧测试标准声明校验，均在**已提交 HEAD** 上跑。
- 证伪：去掉本层实现（切回 base `37476cd7`）后新增用例必红。

## 旧标准变更

- `plugins/omnimux-workflow/src/projects/projects.test.mjs` :: `T1 ProjectStore：扫描 list / Host mkdir+seed / remove 不 rm 项目根`
  - 原断言：`assert.equal(existsSync(join(projectRoot, '.omnimux')), false)` —— 要求 `remove()` 删掉整个 `.omnimux` 目录。
  - 必须改的理由：该目录同时存放 `.omnimux/canvases/<canvasWorkspaceId>.json`（用户创作页画布）与 `assets.json`；整目录删除会把用户画布一并删掉，与本模型「单一真源里画布文件属于用户数据」「remove() 不 rm 用户文件」的红线冲突。本次把 `remove()` 收窄为只摘 `project.json` + 索引，故旧断言不再成立；这不是放宽标准，而是断言点随产品红线前移。
  - 新期望证据：改为两条更具体的断言 —— `project.json` 必须不存在（`existsSync(.../.omnimux/project.json) === false`）、`.omnimux` 目录必须仍在（画布等用户数据保留）；同用例继续校验用户文件夹与 `user-notes.txt` 保留、`store.get(id)` 抛 `project-not-found`、`list()` 数量下降。另有新增用例 `B1 remove()：只摘项目档案，不删画布/用户文件夹` 直接断言画布文件在 remove 后仍存在。实跑：`projects.test.mjs` 30/30 通过。

## 8. I3/I4 归属与 B2 遗留

- **I4（一个 canvasWorkspaceId 最多映射一个 page）：B1 落实**。`ensureProject` 归一重复引用（保留首个 page 的原 id，其余生成新 `ws_` id 并写回 v2），新增用例 `B1 I4：重复 canvasWorkspaceId 归一`。
- **I3（画布缺失时补空画布、不失败）：B1 只保证 `page.canvasWorkspaceId` 非空**；空画布文件由画布层（`WorkspaceStore` / B2 路由）在该 page 首次打开时创建。B1 数据层不依赖画布存储，避免把 snapshot schema 耦合进 ProjectStore。
- **F2（remove 收窄后，同 root 重建会被 S3 采纳旧画布）**：B1 只保证不删用户文件；删除文案与「彻底删除」选项由 B2 承接。
- **F4（independent 同标题折叠为一个项目）**：幂等优先的产品语义（spec §2 已写明）；B2 UI 需提示同名或提供改名/另选目录。
- **F5/F6 已在 B1 修复**：F5 改为先落盘再改 registry 索引；F6 scan 同时按 lexical 与 realpath 判定目录是否在库内。

## 9. 非目标
- 不改 routes/client（B2）、不做双根逻辑指针、不做云端同步、不改画布 ReactFlow 内核。
