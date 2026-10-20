# 工作流画布本地素材索引（realPath）

> **SUPERSEDED（2026-08-30）**。导入真源改为 [`docs/contracts/project-assets-contract.md`](../../../../docs/contracts/project-assets-contract.md)：必须物理 copy 进项目 `assets/imported/`，JSON 只记相对路径。下文保留 Issue #122 历史闸（loopback / MIME / 禁 blob），**不得再按「不复制」实现新功能**。
>
> Issue [#122](https://github.com/laozhong86/omnimux-dsh/issues/122) · 风险 **R1**（任意本地路径流式，仅 loopback）· 插件 `omnimux-workflow`

## 1. 选型与定界

**Track B（产品 Stage）+ Host HTTP `/omnimux-workflow/api/{pick,local-file,local-file/probe}` + 节点 data 索引字段。无 Package RPC，不 import `omnimux-assets`。**

| 决策 | 结论 |
|---|---|
| 导入语义 | ~~索引本地 `realPath`，不复制~~ **（已废止）** 新路径：ingest copy → `relativePath` |
| 持久化 | ~~`canvas.json` 只存绝对路径~~ **禁止绝对路径与 `blob:`**；只记项目相对路径 |
| 预览 | 新：`GET /omnimux-workflow/api/project-file?rel=`。`/api/local-file` 仅 probe/读源 |
| 源文件丢失 | 物化后副本在项目内；惰性迁移失败才 `offline` |
| AI 产物 | 新：`<ProjectRoot>/artifacts/`。全局 `media/executions/` 仅执行态临时 |
| 资产库 | 全局仓 `data/files/` 实体化；**禁止** `import` `omnimux-assets` |
| 合入 | R1，老板人工通道，不得自动合入 |

非目标：云上传 / SaaS 对象存储；改 `omnimux-clip` OpenReel 或 `omnimux-assets` UI；把导入文件 copy 进项目或 `$DSH_HOME`。

## 2. 架构拓扑

```
┌─ Client (canvas island) ─────────────────────────────────────────┐
│  Native pick / Electron File.path / 拖拽 path                      │
│  弹窗内可选 URL.createObjectURL 瞬时预览（仅内存，revoke 即弃）     │
│  persistSanitize：剥离 blob: ；mediaUrl 由 realPath 派生           │
│  hydrate：POST /api/local-file/probe → ready | offline            │
└──────────────┬───────────────────────────────────────────────────┘
               │ 同源 fetch（canonical /omnimux-workflow，
               │ legacy /dsh-workflow in-memory 改写，不 redirect）
┌──────────────▼───────────────────────────────────────────────────┐
│  Host dispatcher (canvasRoutes.ts)                                │
│  POST /api/pick              osascript JXA + NSOpenPanel（无 Apple Events）│
│  GET  /api/local-file        任意绝对路径流式（Range 206）         │
│  POST /api/local-file/probe  stat + MIME 白名单，不落盘            │
│  安全闸：loopback / 绝对路径 / NUL / regular file / MIME / 拒目录 │
└──────────────┬───────────────────────────────────────────────────┘
               │ 只读 stat + createReadStream
               ▼
         用户磁盘上的源文件（插件永不 copy / unlink）
```

数据流向（导入）：

1. 用户选文件 → Host 返回绝对路径（或 Electron `File.path` / 拖拽 path）。
2. Client 写入节点 `realPath` / `originalName` / `fileSize` / `mimeType` / `isMissing: false` / `status: 'ready'`。
3. `mediaUrl` **派生**，不手写；`mediaAssets[].url` 同步为同一派生 URL。
4. PUT 快照前 `persistSanitize` 断言无 `blob:`。
5. 刷新后 hydrate：probe `realPath` → 存在则继续预览；缺失则 `offline` + Relink。

## 3. 节点字段契约

适用范围：`materialType ∈ {image, video, audio}` 且来源为本地导入（`selectedTool: 'import'`，或节点带 `realPath`）。文本节点与 AI 生成节点不写这些字段。

| 字段 | 类型 | 落盘 | 说明 |
|---|---|---|---|
| `realPath` | `string` | 是 | POSIX/绝对路径。导入后必填。丢失时**保留**（Relink 需要上次路径） |
| `originalName` | `string` | 是 | 显示名，默认 `basename(realPath)` |
| `fileSize` | `number`（非负整数，字节） | 是 | 导入/probe 时的 `stat.size`；缺失时保留最后已知值 |
| `mimeType` | `string` | 是 | 白名单 MIME（见 §6）。如 `image/png` / `video/mp4` / `audio/mpeg` |
| `isMissing` | `boolean` | 是 | 与磁盘存在性同步。`true` ⇔ 导入节点 `status === 'offline'` |
| `mediaUrl` | `string` | 是（派生） | 见 §3.1。禁止 `blob:` / `file:` / `http(s):` 用户路径 |
| `mediaAssets` | `{ type, url }[]` | 是 | `url` 必须与派生 `mediaUrl` 相同规则；禁止 `blob:` |
| `status` | 见 §4 | 是 | 导入节点只用 `empty` / `ready` / `offline`；生成管线仍用 `generating` / `completed` / `failed` |

### 3.1 `mediaUrl` 派生公式

```
mediaUrl = "/omnimux-workflow/api/local-file?path=" + encodeURIComponent(realPath)
```

- 唯一合法的导入预览 URL。Client **不得**把 `URL.createObjectURL` 的结果写入节点 data。
- Legacy 前缀请求会经 dispatcher in-memory 改写；**落盘与新写入一律用 canonical `/omnimux-workflow`**。
- 无 `realPath` 时不得伪造 `local-file` URL。AI 产物继续用 `/omnimux-workflow/media/executions/…`。

### 3.2 `blob:` 禁令

`canvas.json`（以及 PUT body 经 `persistSanitize` 之后）**不得出现**：

- 任意字段值以 `blob:` 开头（`mediaUrl`、`mediaAssets[].url`、`content`、嵌套对象）
- `file:` URL
- 相对路径当 `realPath`

执行点（双闸，缺一不可）：

1. **Client** `persistSanitize`：若 `mediaUrl` / `mediaAssets[].url` 为 `blob:`，有 `realPath` 则改写为派生 URL，无 `realPath` 则删除该字段。
2. **Host** `WorkspaceStore.save` 前：快照 JSON 字符串若含 `blob:` → 400 `invalid-snapshot`（`message` 标明 `blob-url-forbidden`）。不得静默落盘。

弹窗内瞬时 `blob:` 预览允许，见 §8。不得进入 signature / PUT / 磁盘。

## 4. 状态机

导入节点与生成节点共用 `status` 字段，枚举扩展为：

```
empty | ready | offline | generating | completed | failed
```

```
                  pick / path 索引成功
     empty ─────────────────────────────────► ready
       ▲                                        │
       │ 清空导入                               │ hydrate/probe 文件不存在
       │                                        ▼
       │                                     offline
       │                                        │
       │                                        │ Relink 成功
       │                                        ▼
       │                                      ready
       │
       └── 生成管线（本 Issue 不改）── generating ─► completed
                                              └─► failed
```

| 状态 | 导入节点含义 | 预览 |
|---|---|---|
| `empty` | 未索引。无 `realPath`，无 `mediaUrl` | 空态 / 导入入口 |
| `ready` | `realPath` 存在且 probe 通过，`isMissing === false` | `<img>` / `<video>` / `<audio>` 加载派生 `mediaUrl` |
| `offline` | `realPath` 仍在，源文件丢失或不可读，`isMissing === true` | Media Offline 文案 + Relink，**不崩画布、不抛未捕获异常** |
| `generating` / `completed` / `failed` | 生成管线（既有）。生成节点无 `realPath` | 既有 executions 媒体路由 |

不变量：

- 导入节点不得在 `ready` 时 `isMissing === true`，也不得在 `offline` 时 `isMissing === false`。
- `offline` 不清空 `realPath` / `originalName` / `fileSize` / `mimeType`。
- Relink 覆盖上述四字段，置 `isMissing: false`、`status: 'ready'`，重算 `mediaUrl`。
- probe 不得把生成节点（`mediaUrl` 以 `/omnimux-workflow/media/` 开头、无 `realPath`）改成 `offline`。

## 5. Host 路由契约

Canonical 前缀：`/omnimux-workflow`。Dispatcher 对 `/dsh-workflow/*` **in-memory 改写**到 canonical 后再匹配，无 301。常量仍以 `src/shared/api.ts` 为代码真源；实现时把下列三条加入 `WORKFLOW_API_ROUTES`。

三条路由均受 §6 安全闸约束。`POST` 走既有 `assertLocalWrite`；`GET /api/local-file` **同样必须 loopback**（R1：任意本地路径流式），非 loopback → 403 `not-local`。

### 5.1 `POST /omnimux-workflow/api/pick`

拉起本机文件选择器，返回绝对路径。**只选文件，不选目录。**

请求：

```json
{ "kind": "file" }
```

- `kind` 缺省按 `"file"`。`"directory"` 或其他值 → 400 `picker-invalid-kind`。
- Body 必须是 JSON object；非法 JSON → 400 `invalid-json`。

响应 200：

```json
{ "path": "/Users/x/Movies/clip.mp4", "paths": ["/Users/x/Movies/clip.mp4"] }
```

| 情况 | HTTP | body |
|---|---|---|
| 用户取消 | 200 | `{ "path": null, "paths": [] }`（**不是** 4xx） |
| 多选 | 200 | `paths` 全量；`path` = `paths[0]` 或仍为 `null` |
| 非 darwin | 501 | `{ "error": "picker-unsupported", "message": "…" }` |
| osascript 失败（非取消） | 500 | `{ "error": "picker-failed", "message": "…" }` |
| 非 loopback | 403 | `{ "error": "not-local", "message": "cross-origin write refused" }` |

实现约束：

- 选择器由 hub 的 `nativeFilePicker` seam 提供（`osascript -l JavaScript` 驱动 AppKit `NSOpenPanel`，accessory 激活策略，无 Apple Events / Dock 图标依赖）；本插件**不复制** picker 实现，只在请求时 `ctx.get('nativeFilePicker')`。
- 该 seam 的实现与取消/多选/目录契约由 hub 单测覆盖（注入 runner，零真实 osascript）；**禁止** `import` / 依赖 `omnimux-assets`。
- 取消：JXA 取消时 exit 0 且 stdout 为空 → 空 paths；兼容旧 AppleScript 的 `/User canceled|-128/i` 取消码。
- 提示文案仍由本路由提供：「选择要导入的素材」（目录为「选择要导入的文件夹」），seam 缺失时报 `picker-unavailable` 503，不静默降级。
- 本路由只返回路径，不 stat、不流式、不写入 `canvas.json`。Client 拿到 path 后应 `probe` 再落节点。

### 5.2 `GET /omnimux-workflow/api/local-file?path=`

只读流式源文件，供 `<img>` / `<video>` / `<audio>` 预览。

| 项 | 规则 |
|---|---|
| Query | `path` = `encodeURIComponent(realPath)` 的一次解码结果 |
| 成功 | `200` 整文件，或合法 `Range` 时 `206 Partial Content` |
| `Accept-Ranges` | `bytes`（video/audio 可 seek） |
| `Content-Type` | 白名单 MIME，不得回落 `application/octet-stream` |
| `Cache-Control` | `private, no-store`（路径即能力，禁止中间缓存） |
| 缺失 / 不可读 | 404 `{ "error": "not-found", "message": "local file not found" }` |
| 安全拒绝 | 见 §6 → 400 或 403，**禁止**把绝对路径原文回写到 `message`（防信息泄漏） |

`Range`：非法 range → 416；无 Range → 200 + 全量。实现可参考标准 bytes range；必须能支撑浏览器媒体元素拖动进度。

本路由**不是** `GET /omnimux-workflow/media/*`。后者仍只服务插件媒体根（executions 产物），继续做穿越/符号链接钳制。两者不得合流。

### 5.3 `POST /omnimux-workflow/api/local-file/probe`

hydrate / Relink 前的存在性与白名单检查。不流式、不落盘。

请求：

```json
{ "paths": ["/abs/a.png", "/abs/b.mp4"] }
```

- `paths` 必须是 string 数组，长度 1–64。空数组或超长 → 400 `invalid-probe`。
- 单路径亦可，但统一走数组，避免两种 body。

响应 200：

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
    },
    {
      "path": "/abs/gone.mp4",
      "exists": false,
      "isMissing": true,
      "isFile": false,
      "allowed": false
    }
  ]
}
```

`results` 与入参顺序一致。`allowed === true` 当且仅当存在、regular file、MIME 白名单通过。目录 / 非白名单 / NUL / 相对路径：`allowed: false`（不要 500）。整段请求的 loopback 失败才是 403。

Client hydrate：对所有带 `realPath` 的节点批量 probe；`allowed` → `ready`；否则 → `offline` + `isMissing: true`。

## 6. 安全闸（R1）

对 `path` 查询参数、probe 数组元素、以及 pick 返回后 Client 再提交的路径，Host 按下列顺序拒绝。**先拒绝再 stat。**

| # | 检查 | 失败码 | HTTP |
|---|---|---|---|
| 1 | loopback：`origin`/`referer` hostname ∈ `{127.0.0.1, localhost, ::1, [::1]}`；`sec-fetch-site=cross-site` 拒绝。GET local-file 与 POST 同等 | `not-local` | 403 |
| 2 | 类型为非空 string，长度 ≤ 4096 | `invalid-path` | 400 |
| 3 | 含 NUL（`\0`）或解码后仍含 `%00` | `invalid-path` | 400 |
| 4 | 必须是绝对路径：POSIX 以 `/` 起头；Windows 为 `X:\` 或 `\\` UNC。相对路径、`~`、`file:` URL 一律拒绝 | `invalid-path` | 400 |
| 5 | `..` 段不作为「逃出根」逻辑（本路由无媒体根）；但 path 规范化后仍须满足 4 | — | — |
| 6 | `lstat`/`stat`：不存在 → 404 `not-found`（GET）或 probe `exists: false` | `not-found` | 404 |
| 7 | **仅 regular file**。`isDirectory()` / socket / fifo / 设备 → 400 `not-a-file` | `not-a-file` | 400 |
| 8 | 目录**永远拒绝**（含 pick 若返回目录、或 symlink 指向目录） | `not-a-file` | 400 |
| 9 | MIME 白名单：`Content-Type` / 扩展名映射后必须属于 `image/*`、`video/*` 或 `audio/*` 的下列集合。其他类型（含 `application/octet-stream`、`.pdf`、`.json`、无扩展名）→ 400 `unsupported-type` | `unsupported-type` | 400 |

MIME / 扩展名白名单（与画布 `mimeToMaterialType` 对齐，取交集收紧）：

| 族 | MIME | 扩展名 |
|---|---|---|
| image | `image/png` `image/jpeg` `image/gif` `image/webp` `image/bmp` `image/avif` `image/heic` `image/svg+xml` | `png` `jpg` `jpeg` `gif` `webp` `bmp` `svg` `avif` `heic` |
| video | `video/mp4` `video/webm` `video/quicktime` `video/x-matroska` `video/x-m4v` | `mp4` `webm` `mov` `mkv` `m4v` |
| audio | `audio/mpeg` `audio/wav` `audio/aac` `audio/flac` `audio/ogg` `audio/mp4` `audio/opus` | `mp3` `wav` `m4a` `aac` `flac` `ogg` `opus` |

判定：扩展名映射到上表 MIME；若 Client 传入 `mimeType` 与扩展名冲突，**以 Host 扩展名映射为准**。对不上表 → 拒绝。不根据文件魔数放行未知扩展名。

符号链接：`realpath` 后目标必须仍是 regular file 且扩展名在白名单。指向目录或越到非文件 → `not-a-file`。本路由**没有**「必须落在 `$DSH_HOME` 内」的钳制——这正是 R1 的权限边界，只能靠 loopback + 类型白名单。

只读红线：这三条路由以及 picker **禁止** `copyFile` / `rename` / `unlink` / `writeFile` 用户 `realPath`。

错误响应不得回显完整用户路径（日志可记，JSON `message` 用稳定短句）。

## 7. 与 `omnimux-assets` 的对齐与隔离

| | `omnimux-assets` | `omnimux-workflow`（本契约） |
|---|---|---|
| 语义 | 素材只记 `real_path`，删库记录不删源文件 | 节点只记 `realPath`，删节点不删源文件 |
| Picker | `POST /omnimux/assets/pick`，经 hub `nativeFilePicker` seam | `POST /omnimux-workflow/api/pick`，经 hub `nativeFilePicker` seam |
| 预览 | 库内 `library/preview`（资产 id 间接化） | 节点直出 `local-file?path=`（画布需要按节点播放） |
| 包边界 | — | **禁止** import 资产库模块、禁止调 `/omnimux/assets/*` 完成导入 |
| 丢失 | 库列表隐藏失效文件 | 画布节点保留并标 Offline + Relink |

两个插件都不再自带 picker 实现；脚本/取消/激活逻辑只有 hub 一份。必须保留：域路由的 prompt 文案、取消 `{path:null,paths:[]}`、`picker-unsupported`/`picker-failed` 状态映射，以及 hub seam 缺失时的 `picker-unavailable` 503。

## 8. Client 行为

### 8.1 路径来源（优先级）

1. `POST /api/pick` 返回的绝对路径（主路径，macOS）。
2. Electron / Chromium `File.path`（拖拽或 `<input type="file">` 在桌面壳里可用时）。
3. `dataTransfer.files[i].path`（拖拽）。

无绝对路径时：**不得**把 blob 写入节点；可提示「无法索引此文件（无本地路径）」。禁止为了预览保活而 copy 进 `$DSH_HOME`。

### 8.2 弹窗瞬时预览

`ResourcePickerModal` / `LocalUploadPane` 可用 `URL.createObjectURL(file)` 做**弹窗内**缩略图。

- 组件 unmount / 从列表移除时 `URL.revokeObjectURL`。
- 该 blob URL **不得**进入 `mediaPatch`、`node.data`、`signatureOf`、PUT body。
- 提交计划改为：`realPath` + 元数据 + 派生 `mediaUrl`，`status: 'ready'`。

### 8.3 Relink

Offline 卡片主按钮「重新链接」。走同一套 pick → probe → 覆盖字段。失败保持 `offline`。

### 8.4 既有写入点（工程师必改，本契约不改 src）

| 位点 | 现状 | 目标 |
|---|---|---|
| `MaterialNode/index.tsx` `handleImportFile` | `URL.createObjectURL` → `mediaUrl` | 取 path → 索引字段 |
| `LocalUploadPane.tsx` `draftFromFile` | draft 持有 `objectUrl` | draft 可暂存 blob 仅供弹窗；commit 只用 path |
| `resourcePickerPolicy.ts` `mediaPatch` | `mediaUrl: file.objectUrl` | `realPath` + 派生 URL |
| `persistSanitize.ts` | 只剥 `__catalog` | 再剥/改写 `blob:` |
| hydrate（workspace load） | 无 probe | 批量 `POST /api/local-file/probe` |

## 9. 生命周期与清理

| 副作用 | 清理 |
|---|---|
| 弹窗 `createObjectURL` | `revokeObjectURL`（unmount / 移除 draft） |
| `<video>`/`<audio>` 加载 local-file | 节点卸载即暂停；不在 Client 缓存整文件 |
| pick 子进程 `osascript` | `spawn` close 后释放；取消不留孤儿（系统对话框随进程） |
| probe 请求 | 工作区卸载 / 切换 workspace 时 abort |

`ctx.effect` 不直接挂这些（island 内 React 生命周期即可）。Host 路由注册仍走既有 dispatcher disposer。

## 10. 任务实施清单（给工程师）

| # | 任务 | 依赖 | 验收断言 |
|---|---|---|---|
| T1 | 经 hub `nativeFilePicker` seam 挂 `POST /api/pick`（本插件不带 picker 实现） | — | hub 单测覆盖：多路径解析、取消 → 空数组、非 darwin → `picker-unsupported`、目录/多选脚本；本插件单测覆盖：seam 转发 prompt、seam 缺失 503；**零次**真实 osascript |
| T2 | 路径安全函数：绝对路径 / NUL / regular file / 目录拒绝 / MIME 白名单 | — | 单测：相对路径、`\0`、目录、`.pdf`、无扩展名 → 拒绝；白名单图片/视频/音频 → 通过 |
| T3 | `GET /api/local-file` + Range 206 + loopback | T2 | 非 loopback 403；缺文件 404；目录 400；合法 mp4 Range 回 206；`Content-Type` 为白名单 MIME |
| T4 | `POST /api/local-file/probe` | T2 | 64 条上限；结果顺序对齐；缺失 `isMissing: true` 且 HTTP 仍 200 |
| T5 | 节点字段 + 状态机 + `mediaUrl` 派生 helper | T3 | helper 单测：`encodeURIComponent`；无 realPath 不产出 local-file URL |
| T6 | 替换三处 blob 写入 + persistSanitize 剥 `blob:` | T5 | `persistSanitize` 单测：blob 入、派生 URL 出；无 realPath 则删除；Host 对含 `blob:` 的 PUT → 400 |
| T7 | hydrate probe + Offline/Relink UI | T4 T6 | 缺文件不抛异常；Relink 成功后 `status=ready` 且可播放 |
| T8 | 路由挂入 dispatcher + `WORKFLOW_API_ROUTES`；legacy 前缀改写覆盖 | T1–T4 | `/dsh-workflow/api/pick` 与 canonical 同一 handler |
| T9 | `pnpm --filter omnimux-workflow test` 全绿且新文件测试数 > 0 | T1–T8 | 非 0 tests；禁止 skip 冒充 |
| T10 | ego-browser L2：导入 → 刷新 → 仍可播放；删源文件 → Offline → Relink | T7 T9 | 证据进 `docs/evidence/`；canvas.json 抽检无 `blob:`、无源文件副本 |

T1–T10 均不得修改 `omnimux-assets` / `omnimux-clip`，不得把源文件 copy 进 `workflow/media/`。
