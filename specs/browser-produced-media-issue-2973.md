# Spec: 浏览器插件会话栏展示助手产出的媒体（produced media）

- Issue: #2973

## 复审修订（OCR 桥侧修复单，2026-10-02）

`src/produced-registry.ts` 复审命中 1 高 3 中，验收口径如下修订：

1. **symlink TOCTOU（高）**：`readProducedMedia` 的 `stat()`+`readFile()` 两步
   允许已登记路径在判定后被换成符号链接。改为 `fs/promises.open(path,
   O_RDONLY | O_NOFOLLOW)` 取得 FileHandle，同一 fd 上 `fstat` 校验普通文件
   与 ≤64MB、`readFile` 读取、`finally` 关闭；`open` 抛 `ELOOP` 与 ENOENT
   同答 `not-produced`。
2. **大小复查（中）**：`fstat.size > 64MB` 先拒；读完 `data.byteLength > 64MB`
   同样回 `too-large`（防 stat 后放大）。
3. **isError 门对齐面板（中）**：`data.isError===true` 或
   `message.isError===true` 的 tool/result 一律不登记（保留块级 isError 与
   `data.error` 拒绝）。
4. **callId 配对对齐面板（中）**：result 配对 callId 提取与面板
   `toolResultCallId` 三级一致——`data.callId` → `message.toolCallId` →
   `message.source.callId`，observeEvent/observeHistory 共用；块级
   `toolCallId` 形状兼容保留。
5. 路径规范化以登记侧 `path.resolve(path.normalize())` 为准（面板
   `normalizePath` 只统一分隔符/去尾斜杠），注释说明差异。
6. 测试增补：symlink 拒绝（临时目录 symlink → /etc/hosts）、stat 后超限、
   isError 不登记、三级 callId 配对；三件套测试命令退出码 0。
- 风险级别: R2（插件边界内扩展：面板渲染 + 桥端新增一条授权 RPC，不改宿主核心、不改 CSP）
- 依据: 用户报障截图——`display_file` 在侧栏只剩「页面操作 · 完成」工具行，媒体不可见

## 1. 目标与用户故事

### 1.1 业务背景
扩展侧栏（精灵助手）渲染媒体的唯一通道是消息 `content` 里的持久化 image 块（`{type:'image', attachment:{attachmentId…}}`），字节经 `session.attachment` RPC 取回。而 `display_file`、`read_image`、`omnimux_image/video/audio_submit` 这些**助手产出媒体**的工具，其结果数据其实已落在会话事件里，只是面板把它们整体丢弃了：

- `tool/result` 事件的 `data.meta`：`display_file` 写入的 DisplayValue（`path/kind/mediaType/bytes/assetUrl/inContext/image{attachmentId…}`）。
- `tool/result` 事件的 `data.message.content`：含 image attachment 块（read_image、inContext 栅格）与 `<path>/<media>/<type>` 信封文本（嵌套 display_file 的降级载体）。
- `omnimux_*_submit`：`JSON_TOOL_OUTPUT` 纯 JSON 结果，`dest` 为落盘绝对路径。

### 1.2 用户旅程
1. 用户在侧栏会话中让助手生成/展示一张图或一段视频 → 工具行完成后，助手回复下方出现画廊大卡（图）/可播放视频卡/音频条；点击进灯箱，多产物支持 rail 切换。
2. 用户重开旧会话 → 历史回放中媒体卡原样复现（来源均为持久化事件，无需网络重取）。
3. 展示件为 PDF/文档/HTML 等非音视频类型 → 出文件卡（类型徽标+文件名+大小），不内联渲染。
4. 助手展示的文件已被删除/路径非法 → 卡位显示加载失败占位并可重试，不崩会话流。

### 1.3 成功标准（可测）
- 调用 `display_file`（png）→ 会话流出画廊卡，`session.attachment` 返回字节。
- 调用 `display_file`（mp4）→ 视频卡 `controls`、不自动播放。
- `omnimux_image_submit` 成功后 dest 对应的卡出图。
- 重开含产物的会话 → 卡复现。
- 对未登记路径调 `omnimux.producedMedia` → 拒绝（`not-produced`）；对登记但超限文件 → `too-large`。
- 非图像工具结果（如 browser_click）→ 不产卡、不改变现有工具行折叠行为。

## 2. 设计

### 2.1 数据模型

```
ProducedMediaRef =
  | { source:'attachment', attachmentId, mediaType:'image/*', bytes, width, height, name? }
  | { source:'path',       path, mediaType, bytes?, kind, name }
```

`Row.images` 升级为 `ProducedMediaRef[]`（字段名不变，减少传导层改名）。`kind` 沿用 omnimux-viewer 的 `ViewerKind` 词表：`image|video|audio|pdf|document|html|file`。

### 2.2 面板提取层 `extension/src/panel/produced-media.ts`（纯函数）

`producedMediaFromToolResult(event): ProducedMediaRef[]` 四条产线（isError 直接返回空）：

1. `data.meta` 收窄为合法 DisplayValue（结构收窄，不跨包 import）：`meta.image` 存在 → attachment 源；否则按 `path+kind+mediaType` 产 path 源。
2. `data.message.content` 中 `type==='image'` 块 → attachment 源（复用现有 `parseMediaAttachmentRef`）。
3. content 文本中的 `<path>/<media>/<type>` 信封 → path 源。
4. 配对的 `tool/call` 名在 `omnimux_image_submit|omnimux_video_submit|omnimux_audio_submit` 白名单内时，解析 result 首个 JSON 文本块的 `dest`：须绝对路径 + 扩展名在媒体白名单 → path 源。`mode:'submitted'` 无 dest 不出卡。

去重键：attachmentId 或规范化绝对路径。

### 2.3 桥侧授权取字节（`plugins/omnimux-browser`）

- `src/produced-registry.ts`：桥在事件泵转发 `session/event` 帧时，用与面板一致的规则宿主侧提取产物路径，累计 `sessionId → Set<绝对路径>`；并在 `session.history` RPC 返回时扫描补登（覆盖旧会话回放）。同进程重启后注册表重建于事件流，不需持久化。
- 新 RPC 常量 `BRIDGE_PRODUCED_MEDIA_METHOD = 'omnimux.producedMedia'`：payload `{sessionId, path}`。命中注册表才放行；`path.resolve` 后须与登记串一致（防 `..`/符号差异），`fs.stat` 须为普通文件，字节上限 64MB（超限 `too-large`）；返回 `{mediaType, bytes, data(base64)}`。mediaType 按扩展名白名单映射（image/video/audio/pdf），其余 `unsupported`。
- 挂在 `BridgeServer.handleRpc` 的分支链上（先于通用 `api.call`），与 `BRIDGE_FETCH_MEDIA_METHOD` 同构。不进 `invokeTarget`、不进 `PRIVILEGED_METHODS`（面板永远 loopback 连接）。

### 2.4 面板渲染层

- `events.ts`：`tool/result` 分支由丢弃改为调提取层；产出则 push `kind:'assistant'` 媒体行（align=start 画廊形态）。`mergeHistoryRows` 同步支持。
- `MessageImages.tsx`：`useMediaSources` 按 source 分流——attachment→`session.attachment`；path→`omnimux.producedMedia`（携带 sessionId）。`MEDIA_TYPE_PATTERN` 放宽收 `audio/`。path 源无声明宽高：舞台比例默认 4:3，`<img>/<video>` 加载完成后回写真实比（clamp 至 0.25–4.0）。`pdf/document/html/file` 渲染文件卡，不进入灯箱。
- `strings.ts`：补文件卡类型名文案（文档/PDF/文件），中英文两份。

### 2.5 不在范围内

- PDF/HTML/document 内联渲染；`host.openPath` 打开所在目录；远程工作区（`assetUrl` 缺失场景 path 源天然不产，按不可见处理）。
- display_file 结果里 `meta.assetUrl` 不直连宿主 HTTP（CSP 约束），统一走桥转发字节。

## 3. 命令

- 工作树测试：`cd .worktrees/browser-produced-media-issue-2973 && pnpm -F omnimux-browser-extension test`（面板 vitest，包名以 package.json 实查为准）与宿主侧 node:test。
- 真实浏览器验收：构建扩展加载到 Chrome（`chrome://extensions` 开发者模式），连本机 DSH，在会话里执行 display_file 图/视频/音频 + image_submit。

## 4. 项目结构

- 面板：`plugins/omnimux-browser/extension/src/panel/{produced-media.ts(新), events.ts, MessageImages.tsx, attachments.ts, strings.ts}`
- 桥宿主侧：`plugins/omnimux-browser/src/{produced-registry.ts(新), server.ts, protocol.ts}`
- 测试：`plugins/omnimux-browser/extension/tests/*.spec.ts`、`plugins/omnimux-browser/extension/tests/harness/` 复用

## 5. 代码风格

- 面板：React + TS，`unknown` 收窄（isRecord 模式），不写 `any`；纯函数落 events.ts/produced-media.ts 可单测。
- 宿主侧：node:test，防御性校验入口收窄；错误码沿用 `bad-request`/`internal`/自定义语义码。

## 6. 测试策略

- 新增单测：produced-media 提取（四产线、去重、isError、submitted 无 dest）、produced-registry（登记/拒绝/历史补登）、server（RPC 成功/too-large/unsupported/not-produced）、画廊（path 源、audio、文件卡、失败重试）。
- 真实浏览器验收留截图：display_file 图卡、视频卡、生成图卡、会话重开回放。

## 7. 边界

- 总是：未登记路径拒绝；非图像工具结果不产卡；不写日志外的持久状态。
- 先问：改 CSP；改宿主核心包；新增常驻 HTTP 路由。
- 绝不：直连宿主 assetUrl；任意路径文件读；把 path 源字节塞进 session.attachment（其授权模型不认 path）。

## 8. 新用户基线

- 无产物会话无变化；媒体产物依赖宿主侧 omnimux-viewer/omnimux 插件在场（面板对缺失 meta 的结果静默降级为纯工具行，不报错）。
