# 灵感分享：真实发布链路改造（Issue #1978）

## 一、背景与问题

当前「分享」拿到的链接打不开。经上游源码调查与真实联调，确认为三层缺陷叠加：

1. **客户端伪造链接**：`createShareLink` 请求失败后在本地拼装 `https://omnimux.ai/s/insp_<code>` 并返回成功，云端从未创建记录。实测该伪造 ID 在分享接口返回 `404 NOT_FOUND`。
2. **凭证通道选错**：发布与上传接口的中间件只认「内部 JWT 登录令牌」或「网关密钥 `sk-`」，当前实现走会话令牌通道，必然 `401`。
3. **上游落地页未部署**：`/s/:shareId` 已并入上游主干但线上未部署（本任务不处理，属外部依赖）。

用户明确要求：**发布要有进度，至少要上传素材，成功以后才能拿到链接。**

## 二、上游真实契约（源码与实测双重确证）

### 2.1 上传素材
- `POST {site}/api/v1/files/upload/stream`
- multipart 表单字段：`file`（文件字节）、`upload_path`、`file_name`
- 鉴权：`TokenOrUserAuth` → **必须走网关密钥通道（`sk-`）**
- 成功返回：`data.file_url`（公网可读，实测匿名 GET 200）、`data.download_url`、`data.file_id`
- 单文件上限 100MB；超限返回 400「文件大小超过上限（最大 100MB）」

### 2.2 发布
- `POST {site}/api/inspiration/v1/publish`
- JSON：`{ category, title, description?, prompt, model?, media_type?, media_url?, cover_url? }`
- 必填：`category`、`title`、`prompt`
- 鉴权：同上，**必须走网关密钥通道**
- 成功返回：`data.share_id`、`data.share_url`、`data.storage_bucket`、`data.is_admin`、`data.expires_at`、`data.expires_in`、`data.created_at`
- `share_url` 由服务端生成，形如 `{ServerAddress}/s/{share_id}`
- 存储规则：管理员 → 桶 `omnimux-inspiration` + 永久；普通用户 → 桶 `omnimux-files` + 72h
  - **已知上游缺陷**：经网关密钥发布时 `is_admin` 恒为 `false`（上游工单 laozhong86/OmniMux#252），因此实际总是 72h。这属预期内行为，UI 文案按返回的 `expires_in` 如实展示。

### 2.3 校验分享
- `GET {site}/api/inspiration/v1/share/:id`（公开）
- 200 → `data.title`、`data.previewVideoUrl`、`data.previewImageUrl` 等
- 404 → `{ code: 'NOT_FOUND' }`

## 三、架构边界（必须遵守，见 AGENTS.md）

- 云端调用、凭证、provider 路由**只能存在于中枢 `plugins/omnimux/`**。
- `omnimux-inspiration` 是域插件，**不得** import 中枢内部实现、不得自带 provider 客户端、不得保存密钥。
- 域插件消费云端能力的既有范式：`ctx.get('tools')` → `getTool('omnimux_xxx')`，或中枢通过 `ctx.provide(name, api)` 暴露能力。（参考 `plugins/omnimux/src/host/apply.js` 的 `ctx.provide('identity')` / `ctx.provide('modelCatalog')`，以及 `plugins/omnimux-inspiration/src/index.js` 中 `getTool('omnimux_social_data')`、`getTool('omnimux_text_complete')` 的用法。）

## 四、实现要求

### 4.1 中枢侧（`plugins/omnimux/`）

1. 在 `src/official/inspiration.js` 增加两个云端调用：
   - 素材上传：走 `withSk` 通道 + multipart，返回 `file_url`
   - 分享发布：走 `withSk` 通道 + JSON，返回 `share_id` / `share_url` 等
2. 通过 `ctx.provide('inspirationShare', api)` 暴露发布能力，API 形如：
   ```
   publishLocal({
     media?: { path, fileName, mimeType },
     cover?: { path, fileName, mimeType },
     meta: { category, title, description, prompt, model, mediaType },
   }) => {
     shareId, shareUrl, storageBucket, isAdmin, expiresAt, expiresIn
   }
   ```
   - 内部依次执行：上传封面 → 上传视频 → 发布
   - 缺失素材时按可用项降级（只有封面也能发布）
   - 凭证不可用（无 `OMNIMUX_API_KEY`）时抛出可读错误，文案指明需要在凭据中配置网关密钥
   - 参考 `src/host/apply.js:resolveOfficialApiKey` 的凭证解析顺序（env → credentials seam），可用它作为 `resolveApiKey`
3. 补单元测试（禁用真实网络的既有测试范式）。

### 4.2 域插件侧（`plugins/omnimux-inspiration/`）

1. `src/index.js`：消费中枢 `inspirationShare` 能力并注入 HTTP 处理器；能力缺失时给出明确错误（不要静默）。
2. `src/http-handlers.js` 的 `handleShare` **重写**：
   - 读取本地灵感记录，取 `local_paths.video` / `local_paths.cover`
   - 组装 `meta`：`title`（必填校验）、`prompt`（用 `content`／解构结果，必填校验）、`category`（可用 `source_platform` 或类型）、`mediaType`
   - 调用中枢能力，返回真实 `share_url` 等字段
   - **删除任何本地伪造链接的兜底逻辑**；失败必须如实返回错误状态与原因
   - 前置校验：本地无任何素材、文件不存在、超 100MB、标题或提示词为空 → 返回可执行的中文提示
3. `src/client/api.js` 的 `createShareLink`：**删除伪造兜底**，请求失败如实返回失败；成功返回服务端字段。
4. `src/client/InspirationPreviewModal.jsx`：补齐**发布进度**体验
   - 点击「创建链接」后进入进度态，按真实阶段推进：`准备素材` → `上传素材` → `发布中` → `完成`
   - 进度必须来自真实阶段，不允许前端假造计时器骗用户
   - 建议实现方式（择一，优先复用仓内既有范式）：
     - 复用本插件既有的后台任务 + 轮询范式（参考 `src/import-poller.js`、`import-status.js`、后台导入的 stage 机制）
     - 或由 Host 路由分阶段返回（例如先返回阶段、再返回结果）
   - 成功后展示真实链接 + 复制按钮，并如实展示有效期（读 `expires_in`）
   - 失败时在浮层内展示可执行原因，不弹全屏报错
5. `src/client/locales.js`：补齐进度与错误的中英文案（中英 key 集合必须对齐）。

### 4.3 测试与门禁

- 补齐/更新单元测试：`handleShare` 成功与失败路径、客户端 API 不再伪造、进度阶段推进。
- 补齐端到端测试：`tests/e2e/**`（本仓 UI 改动必须带 e2e）。
- 证据：`docs/evidence/<task>-verified.png` 或 `.json`（任务专属，不得用首页冒烟图）。
- 规格文件保留在 `specs/`。

## 五、验收标准

1. **AC-1**：点击「创建链接」后，界面出现真实阶段进度（至少包含「上传素材」阶段），用户能感知在做什么。
2. **AC-2**：成功时展示的链接是**服务端返回的真实链接**，且 `share_id` 可在 `GET /api/inspiration/v1/share/:id` 查到 200；本地不再产生任何伪造链接。
3. **AC-3**：失败时（无凭证、无素材、文件超限、标题/提示词缺失、网络异常）给出可执行的中文原因，且**不**展示任何链接。
4. **AC-4**：有效期按服务端 `expires_in` 如实展示（普通用户 72 小时）。
5. **AC-5**：域插件未引入中枢内部 import；云端调用与凭证仍只在中枢内。
6. **AC-6**：`pnpm --filter omnimux test` 与 `pnpm --filter omnimux-inspiration test` 全绿。

## 六、不在本次范围

- 上游 `/s/:shareId` 落地页部署（外部依赖，用户自行跟进）。
- 管理员永久链接（依赖上游工单 #252 修复）。
