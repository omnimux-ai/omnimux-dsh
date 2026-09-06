# Canvas HTTP API 契约（/omnimux-workflow/*）

> Host 路由（src/workflow/routes/canvasRoutes.ts）与 island api client（src/canvas/bridge/apiClient.ts）共同的契约。常量单一事实来源：`src/shared/api.ts`。
>
> **Canonical 前缀**：`/omnimux-workflow`。M1 前缀 `/dsh-workflow` 由 dispatcher **in-memory 改写**（不 301）到 canonical 后再匹配，旧会话/书签继续可用。下文路径一律写 canonical；legacy 同等改写，含本节新增的 pick / local-file / probe。

## 总则

- 所有响应为 JSON（bundle/媒体路由/`GET /api/local-file` 除外），错误形如 `{ error, message }`
- 写操作（POST/PUT/PATCH/DELETE）经 `assertLocalWrite`：仅接受同机回环来源（origin/referer hostname ∈ {127.0.0.1, localhost, ::1, [::1]}；sec-fetch-site=cross-site 拒绝）
- **`GET /api/local-file` 同样必须 loopback**（R1：任意本地路径流式）。非 loopback → 403 `not-local`
- 响应文本过 secret-emission guard（含 `access_token` / `sk-…` 模式时拒绝发送）
- 本地导入索引的字段、状态机与安全闸见 [workflow-media-asset-indexing.md](./workflow-media-asset-indexing.md)

## 路由

### GET /omnimux-workflow/canvas.js
画布 island bundle（lib/canvas.js，IIFE，global `__dshWorkflowCanvas`）。`Cache-Control: no-cache`；由 manifest hash 做 `?v=` 缓存戳。

### GET /omnimux-workflow/api/manifest
```json
{ "canvasHash": "9f2a1c…" }   // sha256(canvas.js) 前 16 位，5s 缓存
```

### GET /omnimux-workflow/api/workspaces
```json
{ "workspaces": [ { "id": "ws_…", "name": "…", "version": 3, "nodeCount": 5, "updatedAt": "…" } ] }
```

### POST /omnimux-workflow/api/workspaces
Body：`{ "name"?: string }` → `{ "workspace": CanvasWorkspaceSnapshot }`（version 从 0 起）

### GET /omnimux-workflow/api/workspaces/:id
`{ "workspace": CanvasWorkspaceSnapshot }`；不存在 → 404 `workspace-not-found`

### PUT /omnimux-workflow/api/workspaces/:id
Body：`SaveCanvasWorkspacePayload`（必含 `expectedVersion`）。
- 成功 → `{ "workspace": <新快照，version+1> }`
- 版本不符 → **409** `{ "error": "version_conflict", "message": "…", "current": <服务端当前版本> }`
- schema 不合法 → 400 `invalid-snapshot`
- 快照 JSON 含 `blob:` → 400 `invalid-snapshot`（`blob-url-forbidden`）。本地导入只允许派生的 `/omnimux-workflow/api/local-file?path=` URL

### DELETE /omnimux-workflow/api/workspaces/:id
`{ "ok": true }`；不存在 → 404

### GET/PATCH /omnimux-workflow/api/generation-preferences

当前应用 profile 的生成模型偏好，存放于 `$DSH_HOME/omnimux/workflow/generation-preferences.json`，不属于项目快照。

- GET 返回 `{ "lastModelByType": { "text"?: string, "image"?: string, "video"?: string, "audio"?: string } }`；首次无文件返回空对象。
- PATCH 接收 `{ "kind": "text" | "image" | "video" | "audio", "modelId": string }`，返回完整偏好。仅接受该类型画布可用目录中的 canonical model ID；不可用模型、别名、跨类型 ID 返回 400。
- 只在用户手动选模时写入；自动适配不更新偏好。客户端加载偏好后才开放新节点创建，既有节点与项目版本不因偏好变化而修改。
- 写入经现有本地来源校验。读取损坏或写入失败返回 500，不静默重置偏好；客户端显示失败原因。

### GET /omnimux-workflow/api/capabilities
能力目录（M1 为静态 stub，M4 起来自 OmniMux 能力发现）：
```json
{ "source": "static-stub", "text": [ { "id": "mock-text-pro", "label": "MockText Pro" } ], "image": […], "video": […], "audio": […] }
```

### GET /omnimux-workflow/media/*
插件媒体目录（`$DSH_HOME/omnimux/workflow/media/`）静态下发；路径规范化后必须仍在媒体根内（防穿越，逃逸 → 403 `path-denied`）。**仅** AI 生成产物（`executions/`）。本地导入源文件**不**走这条路由。

### POST /omnimux-workflow/api/pick

本机文件选择器（macOS osascript `choose file`）。**在 workflow 插件内复制** assets picker 模式；**禁止** `import omnimux-assets`。只选文件，不选目录。legacy `/dsh-workflow/api/pick` 同样改写。

Body：`{ "kind": "file" }`（缺省 `"file"`；`"directory"` → 400 `picker-invalid-kind`）。

```json
{ "path": "/Users/x/Movies/clip.mp4", "paths": ["/Users/x/Movies/clip.mp4"] }
```

| 情况 | HTTP | body.error |
|---|---|---|
| 用户取消 | 200 | —（`path: null`, `paths: []`） |
| 非 darwin | 400 | `picker-unsupported` |
| osascript 失败 | 400 | `picker-failed` |
| 非 loopback | 403 | `not-local` |

返回的是绝对路径，不 stat、不流式、不落盘。Client 随后 `probe` 再写入节点 `realPath`。

### GET /omnimux-workflow/api/local-file?path=

只读流式**用户磁盘**上的源文件（导入预览）。`path` = `encodeURIComponent(realPath)`。legacy `/dsh-workflow/api/local-file` 同样改写。

- 成功：`200` 全量，或合法 `Range` → `206 Partial Content`；`Accept-Ranges: bytes`；`Content-Type` 为 MIME 白名单；`Cache-Control: private, no-store`
- **必须 loopback**（与写操作同等闸），否则 403 `not-local`
- 相对路径 / NUL / 非绝对路径 → 400 `invalid-path`
- 目录或非 regular file → 400 `not-a-file`
- MIME 不在 image/video/audio 白名单 → 400 `unsupported-type`
- 文件不存在 → 404 `not-found`
- JSON `message` **不得**回显完整用户路径

与 `GET /omnimux-workflow/media/*` 互斥：本路由无媒体根钳制（R1），只靠 loopback + 绝对路径 + regular file + MIME 白名单。完整闸见 [workflow-media-asset-indexing.md](./workflow-media-asset-indexing.md) §6。

### POST /omnimux-workflow/api/local-file/probe

hydrate / Relink 前批量 stat。不流式、不落盘。legacy `/dsh-workflow/api/local-file/probe` 同样改写。

Body：`{ "paths": ["/abs/a.png", "/abs/b.mp4"] }`（1–64 条 string）。

```json
{
  "results": [
    {
      "path": "/abs/a.png",
      "exists": true,
      "isMissing": false,
      "isFile": true,
      "allowed": true,
      "mimeType": "image/png",
      "fileSize": 20480
    }
  ]
}
```

`results` 与入参顺序一致。单条非法/缺失仍 HTTP 200（该元素 `allowed: false` / `isMissing: true`）；整段非 loopback 才 403。空数组或超长 → 400 `invalid-probe`。

### GET /omnimux-workflow/api/workspaces/:id/assets

项目私有资产树。无 `assets.json` / 坏 JSON → `{ "assets": { "schemaVersion": 1, "rev": 0, "folders": [], "items": [] } }`。无 `canvas.json` → 404 `workspace-not-found`。legacy `/dsh-workflow` 同等改写。

### GET /omnimux-workflow/api/workspaces/:wsId/tables/:tableId

获取单个结构化数据表文档（L2 `.htable`）。
- 成功 → `{ "table": { "tableId": string, "tablePath": string, "contentRev": number, "rowCount": number, "columnCount": number, "title": string, "document": HTableDocument } }`
- 不存在 → 404 `table-not-found`

### PUT /omnimux-workflow/api/workspaces/:wsId/tables/:tableId

原子写入单个结构化数据表文档（tmp -> rename），支持乐观锁。请求体最大 8MB。
- Body：`{ "expectedRev": number, "document": HTableDocument }`
- 成功 → `{ "table": { "tableId": string, "tablePath": string, "contentRev": <新 rev，+1>, "rowCount": number, "columnCount": number, "title": string, "document": HTableDocument } }`
- 版本冲突 → **409** `{ "error": "version_conflict", "message": "...", "currentRev": <服务端当前 rev> }`

### DELETE /omnimux-workflow/api/workspaces/:wsId/tables/:tableId

删除单个结构化数据表文档。
- 成功 → `{ "ok": true }`

### PUT /omnimux-workflow/api/workspaces/:id/assets

Body：`{ "expectedRev": number, "folders": Folder[], "items": Item[] }`。

- 成功 → `{ "assets": <新文档，rev+1> }`（**不**抬 `canvas.version`）
- 版本不符 → **409** `{ "error": "version_conflict", "message": "…", "current": <服务端当前 rev> }`
- `blob:` / 相对路径 / NUL → 400 `blob-url-forbidden` / `invalid-path`
- 目录写入 `items` → 400 `not-a-file`

### POST /omnimux-workflow/api/workspaces/:id/assets/mkdir

Body：`{ "name": string, "parentId"?: string | null, "expectedRev"?: number }`。同层重名 → 409 `name-conflict`；非法名（空、含 `/`、控制符）→ 400 `name-invalid`。

### POST /omnimux-workflow/api/workspaces/:id/assets/ingest

Body：`{ "paths": string[], "parentId"?: string | null, "expectedRev"?: number }`。物理 copy 进 `<ProjectRoot>/assets/imported/`，账本记 `relative_path`。见 [`project-assets-contract.md`](../../../../docs/contracts/project-assets-contract.md)。

### POST /omnimux-workflow/api/workspaces/:id/assets/index

**废弃（2026-08-30）**。新实现应 `410 ingest-required` 或内部转 ingest。历史行为：只把绝对路径写入记录、不 copy。

完整闸与主体库 ACL 见 [workflow-project-assets.md](./workflow-project-assets.md)。

### GET /omnimux-workflow/api/templates

列出可复用工作流模板。legacy `/dsh-workflow/api/templates` 同样改写。

```json
{ "templates": [ { "schemaVersion": 1, "id": "tmpl_…", "name": "夜景精修", "description": "", "tags": ["子图"], "nodeCount": 2, "createdAt": "…", "updatedAt": "…" } ] }
```

磁盘：`$DSH_HOME/omnimux/workflow/templates/<id>.json`。JSON `schemaVersion` 固定为 `1`。不是 `.omxflow`。

### POST /omnimux-workflow/api/templates

从一组子图节点创建模板。Body：

```json
{ "name": "夜景精修", "description": "", "tags": ["子图"], "nodes": [ /* sanitize 后的节点 */ ], "edges": [] }
```

成功 → `{ "template": WorkflowTemplate }`。

| 情况 | HTTP | body.error |
|---|---|---|
| 空名 / schema 不合法 | 400 | `invalid-template` |
| 节点数 &lt; 2 | 400 | `invalid-template` |
| 非 loopback | 403 | `not-local` |

写入后 island 可用 `GET` 列表、工具栏插入（Client 重映射 id、剥 `parentId`/`extent`、平移到视口原点）。**插入时不自动再打组。**

### GET /omnimux-workflow/api/templates/:id

`{ "template": WorkflowTemplate }`；不存在 → 404 `not-found`。

### DELETE /omnimux-workflow/api/templates/:id

`{ "ok": true }`；不存在 → 404 `not-found`。

提升全局：`POST /omnimux/assets/library`（`sourceWorkspaceId` + 项目 `relative_path`，或仍接受一次性源路径并由 assets Host copy 进 `data/files/`）。workflow **禁止** `import omnimux-assets`。生产环境需已安装 assets 插件；隔离 L2 可用 mock。

## M3 预留（本里程碑未实现）

```
POST /omnimux-workflow/api/executions           { executionMode:'full'|'subset', maxParallel, nodeIds? }
GET  /omnimux-workflow/api/executions/:id
POST /omnimux-workflow/api/executions/:id/pause | resume | cancel
GET  /omnimux-workflow/api/executions/:id/events  # SSE，11 事件协议（见 src/shared/events.ts）
```

（现行实现已挂在 `/omnimux-workflow/api/workspaces/:id/executions*`，见 `src/shared/api.ts`。上表为历史预留路径，不在本 Issue 改动。）
