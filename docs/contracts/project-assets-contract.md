---
title: "项目资产与主体库物理实体化合同"
id: "contract-project-assets"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-30"
updated: "2026-08-30"
authors: ["x", "agent-architect"]
subsystem: "omnimux-workflow"
tags: ["assets", "ingestion", "relative-path", "materialization"]
supersedes:
  - "plugins/omnimux-workflow/docs/contracts/workflow-media-asset-indexing.md"
  - "plugins/omnimux-workflow/docs/contracts/workflow-project-assets.md"
related:
  - "docs/specs/2026-08-30-omnimux-physical-materialization.md"
  - "docs/decisions/2026-08-30-physical-materialization.md"
  - "docs/contracts/asset-lineage-schema.json"
  - "docs/specs/2026-08-23-omnimux-local-project.md"
  - "docs/contracts/gxgen-workflow-migration.md"
---

# 项目资产与主体库物理实体化合同

> **权威**：L1。与本文件冲突时，以本文件 + 活代码为准。  
> **范围**：`omnimux-workflow` 画布 / 项目资产、`omnimux-assets` 全局主体库。  
> **不覆盖**：`omnimux-products` 产品主图、`omnimux-clip` OpenReel 内部媒体仓。

---

## 1. 红线

1. **导入即物化**。拖入、文件选择器、主体库投入、AI 节点成功产物，都必须在受管目录留下一份物理文件。禁止把外部绝对路径当作持久化真源。
2. **落地唯一性**。本地导入才从用户原始路径 copy 进对应受管仓（项目 `assets/imported/` 或全局 `data/files/<id>/`）。**AI 生成只在项目 `artifacts/` 留持久副本**。`$DSH_HOME/omnimux/workflow/executions/` 仅为可回收 tmp，不得成为第二 SSOT。禁止生成成功自动写入全局 `data/files/` 或 `$DSH_HOME/omnimux/assets/artifacts/`。用户显式「提升为角色」（promote）除外。instantiate 快照（全局母本 → 项目 `assets/subjects/<id>/`）是故意的第二份，不是双真源。
3. **项目内只存 POSIX 相对路径**。`.omnimux/assets.json`、`.omnimux/canvases/*.json`、`.omnimux/project.json` 不得持久化 `/Users/...`、`C:\...`、`file://`、`blob:`。
4. **用户原文件永不 `unlink` / `rename` / `move`**。受管副本（项目 `assets/`、`artifacts/`、全局 `data/files/`）只在删除**对应资产记录**时回收。
5. **删除整个项目**只摘会话与工作区账本，**禁止** `rm -rf` 用户作品包文件夹（沿用 `ProjectStore.remove`）。
6. **workflow 禁止 `import omnimux-assets`**。跨插件只走 Host HTTP。
7. **无绑定项目的画布不得 ingest**。返回 `400 project-required`，不得把媒体写进 `$DSH_HOME/omnimux/workflow/media/` 当作品。
8. **同名禁止静默覆盖**。目标名已存在则 `{base} ({n}).{ext}`。

运行时绝对路径只允许出现在：ingest 请求的 `sourcePath`、内存、一次性 probe。预览 URL 由 Host 按项目根或全局仓解析。

---

## 1.1 全局库保存位置的限定例外（Issue #766）

以下仅约束 `omnimux-assets` 全局库，不改变项目 ingest、instantiate、promote、项目生成物及删除规则：

- 一个解析后的 DSH Home 只有一个生效根；缺省仍是 `<Home>/omnimux/assets`。用户选择目录只授权扫描，确认已展示计划后才允许迁移。唯一根指针及恢复清单位于 `<Home>/omnimux/assets-storage`；坏配置、缺账本或离线不得回落默认空库。
- 目标既有文件允许在用户选定根中原位登记，不必复制到 `data/files/<id>/`；普通外部导入仍 copy。内容引用采用相对生效根的 POSIX 路径。必要绝对路径仅留根配置及本机受限事务日志，禁止写入项目内容账本。
- `adopted` 原位项删除只摘索引；`managed` 项只能在账本提交后，按文件清单、身份和哈希核验无其他资产、产物、目录或恢复引用时逐叶回收。不能递归删除整个 ID 目录或用户树，空的已知自建目录除外。
- 迁移覆盖仅限已确认普通文件冲突，先保存完整校验的恢复版本；目标旧记录仍引用旧内容版本。跳过必须保留来源且标记未迁入，不得指向目标异内容文件。结构冲突不能套用全部覆盖。
- 迁移成功至少 7 天后，目标在线、逐项复验、无未解决引用且明确确认清单，才允许回收清单中的旧源 managed 文件；不是无条件自动清理。原位项、未知所有权、硬链接及唯一版本禁止回收。
- 根切换须持久化提交意图及恢复回执，统一写 gate；全局安全 I/O 使用目录 FD/no-follow，不能以词法路径检查代替执行保护。根外原件始终只读，项目快照不会随全局切根回写。

本节规定目标契约，不表示实现或 QA 已通过；实施缺口见 `docs/implementation/issue-766-assets-storage.md`。

## 2. 三级物理布局

```text
# Level 1 全局主体库（跨项目母本）
$DSH_HOME/omnimux/assets/
├── library.json
├── mappings.json                  # 遗留映射，只读迁入
├── data/files/<assetId>/<file>    # 全局受管副本
└── artifacts/                     # assets_upload 产物（一级页非主路径）

# Level 2–3 项目作品包（= dsh workspace.path = 会话 cwd）
<videos>/OmniMux/Projects/<可读名>/
├── 说明.md
├── assets/
│   ├── imported/                  # 外部导入深拷贝
│   └── subjects/<subjectId>/      # 全局主体实例化快照
├── artifacts/                     # 画布 AIGC / 合成产物
└── .omnimux/
    ├── project.json
    ├── assets.json                # 项目资产 SSOT（相对路径）
    └── canvases/<canvasId>.json   # 画布 DAG（刀 2 从 $DSH_HOME 迁入）
```

全局 `library.json` 的 `files[]` 记仓内相对路径（相对 `$DSH_HOME/omnimux/assets/`，例 `data/files/ast_xxx/hero.png`）。项目 `assets.json` 的条目记相对项目根的路径（例 `assets/imported/hero.png`）。

---

## 3. 路径解析

Host 必须用词法 containment + `realpathSync` 双重守卫（复用 `plugins/omnimux-workflow/src/projects/paths.ts` 的 `isInsideDir`）。

| 函数 | 规则 |
|---|---|
| `resolveProjectPath(root, rel)` | `rel` 不得是绝对路径；解析后必须落在 `root` 内 |
| `toProjectRelativePath(root, abs)` | `abs` 必须已在 `root` 内；输出强制 `/` |
| 逃逸 / `..` 段 | `400 path-denied` |

全局仓同样：解析 `data/files/<id>/...` 不得逃出 `$DSH_HOME/omnimux/assets/`。

---

## 4. Ingestion Pipeline

外部文件进入项目：

1. 校验已绑定项目根；源是普通文件；MIME/扩展名白名单（image/video/audio/doc）。
2. 预检：`free >= incomingBytes * 1.5 + 500MB`，否则 `413 disk-space-insufficient`。
3. 目标默认 `assets/imported/`；同名递增。
4. `stream.pipeline` 分块拷贝（建议 64KB）；单文件 > 10MB 或批量时发进度事件。
5. 原子追加 `.omnimux/assets.json`（独立 `rev`，不抬 canvas version）。
6. 返回 `id` + `relative_path`。Client 用该相对路径建节点，**不再**把 `sourcePath` 写入 canvas。

进度事件：`omnimux:assets:ingest-progress`

```json
{
  "taskId": "task_ingest_…",
  "workspaceId": "ws_…",
  "assetId": "ast_…",
  "fileName": "raw.mp4",
  "loadedBytes": 52428800,
  "totalBytes": 104857600,
  "percentage": 50,
  "speedBytesPerSec": 26214400,
  "status": "transferring"
}
```

`status`：`pending` | `transferring` | `checksumming` | `completed` | `failed`。

---

## 5. REST（沿用现网前缀，禁止 `/api/projects/:id`）

Canonical：`/omnimux-workflow`；legacy `/dsh-workflow` in-memory 改写。写操作 `assertLocalWrite`。

| 方法 | 路径 | 行为 |
|---|---|---|
| GET | `/api/workspaces/:id/assets` | 读 `<ProjectRoot>/.omnimux/assets.json`；缺/坏 → `{schemaVersion:1, rev:0, folders:[], items:[]}`。无绑定项目 → `400 project-required`。无画布文档且无项目根 → `404 workspace-not-found` |
| PUT | `/api/workspaces/:id/assets` | `{expectedRev, folders, items}`；条目必须带 `relative_path`；错 rev → 409 |
| POST | `/api/workspaces/:id/assets/mkdir` | 建文件夹记录；同层重名 409 `name-conflict` |
| POST | `/api/workspaces/:id/assets/ingest` | `{paths: string[], parentId?, expectedRev?}` 物理拷贝后登记 |
| POST | `/api/workspaces/:id/assets/index` | **废弃**。新实现应 410 `ingest-required`，或内部转 ingest（不得再只记绝对路径） |
| POST | `/api/workspaces/:id/assets/instantiate` | `{globalSubjectId, targetCanvasId?, position?}` 把全局仓文件深拷贝到 `assets/subjects/<id>/` |
| GET | `/api/project-file?rel=` | 只服务当前项目根内相对路径；Range 206 允许 |
| GET | `/api/local-file?path=` | **仅** ingest 前 probe / 读源文件。禁止作为节点持久化 URL |

全局：

| 方法 | 路径 | 行为 |
|---|---|---|
| GET | `/omnimux/assets/library` | 列表；`files` 对可见副本给出 preview URL |
| POST | `/omnimux/assets/library` | 创建主体：把入参路径 copy 进 `data/files/<id>/`。若 body 含 `sourceWorkspaceId` + `relative_path`，从项目受管文件 promote |
| GET | `/omnimux/assets/library/preview` | 读全局仓内文件，不读用户桌面原路径 |
| DELETE | 资产记录 | 删 `library.json` 行 **并** 回收 `data/files/<id>/`；仍不碰用户原文件 |

错误码：`project-required` 400 · `path-denied` 400 · `invalid-path` 400 · `not-a-file` 400 · `blob-url-forbidden` 400 · `disk-space-insufficient` 413 · `name-conflict` 409 · `version_conflict` 409 · `ingest-required` 410 · `workspace-not-found` 404 · `picker-unsupported` 501。

---

## 6. 账本字段

项目 `assets.json` item：

```jsonc
{
  "id": "ast_…",
  "name": "hero.png",
  "type": "image",          // image | video | audio | doc
  "parentId": "fld_…",
  "relative_path": "assets/imported/hero.png",
  "size": 20480,
  "updatedAt": 0,
  "lineage": null           // 见 asset-lineage-schema.json；导入可空
}
```

画布节点 data（导入 / 生成）：

- 持久化：`assetId`、`relativePath`、`nodeKind`（`import` | `generate`）
- 禁止持久化：`realPath` / `real_path` 绝对路径、`blob:`、`/api/local-file?path=`
- 预览：Client 派生 `GET /omnimux-workflow/api/project-file?rel=`

全局资产 `files[]`：`id`、`relative_path`（相对全局仓根）、`original_name`。兼容读旧 `real_path`：打开时惰性 copy 进仓；源消失则 `visible: false`。

---

## 7. 双向流转

**全局 → 项目（instantiate）**：copy `$DSH_HOME/omnimux/assets/data/files/<id>/` → `<ProjectRoot>/assets/subjects/<id>/`。项目内修改不回写全局。账本可记 `snapshot.globalSubjectId`。

**项目 → 全局（promote）**：copy 项目受管文件 → `data/files/<newId>/`，登记 `library.json`。项目内副本保留。

**生成物**：执行成功后落 `<ProjectRoot>/artifacts/<timestamp>_<nodeId>.<ext>`，登记 `assets.json`，`lineage` 尽量填满。执行态临时文件可暂存 `$DSH_HOME/omnimux/workflow/executions/`，成功后 **move**（copy 成功再删 tmp）进项目 `artifacts/`。tmp 不得成为第二 SSOT，也不得自动 copy 进全局 `data/files/` 或 `/omnimux/assets/artifacts`。

---

## 8. 存量

打开项目时按条惰性升级：发现绝对路径则 copy 到 `assets/imported/` 并改写相对路径。缺源文件 → `offline` / `isMissing`，不扫全盘、不在启动时搬 GB 视频。旧 `$DSH_HOME/.../workspaces/<id>/canvas.json` 在首次绑定项目时复制到 `.omnimux/canvases/`（元数据，不是媒体）。

---

## 9. 选择器四源

| Tab | 数据 | 选定后 |
|---|---|---|
| canvas | 当前画布已有媒体节点 | 连线，不 copy |
| project | `.omnimux/assets.json` | 插节点，引用已有相对路径 |
| library | `GET /omnimux/assets/library` | instantiate 深拷贝 |
| local | 系统选择器 / 拖拽 | ingest 深拷贝 |

阶段 1 至少打通 local + project；library / canvas 可随后。视觉大改不是本合同范围。

---

## 10. 删除矩阵

| 动作 | 用户原文件 | 项目受管副本 | 全局 `data/files` | 作品包文件夹 |
|---|---|---|---|---|
| 删项目资产记录 | 不动 | 删除该相对路径文件 | 不动 | 不动 |
| 删全局主体记录 | 不动 | 已实例化的项目快照保留 | 删除该 id 目录 | 不动 |
| 删整个项目 | 不动 | 留在磁盘 | 不动 | **禁止 rm** |
| 画布删节点 | 不动 | 不自动 GC（P2） | 不动 | 不动 |
