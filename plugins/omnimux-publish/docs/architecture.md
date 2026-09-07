# dsh-publish 架构设计（Phase 2 产出）

架构：高见远 ／ 输入：PRD v1（Confirmed 2026-08-21）+ 主理人核实事实单
版本观察：官方 harness checkout `141eb6fef8`（dsh-0.1.0-rc.8，2026-08-19）；产品树 `e25b9cb`（2026-08-21）。以下所有接口结论均对照该版本源码现场核对，非记忆假设。

---

## 0. 选型结论（一句话）

**挂载点 = Host 侧 `ctx.tools`（raw register + objectParams）+ `ctx.systemPrompt` + `webServer` 前缀路由 `/dsh-publish`；浏览器侧 `shell.overlay` 一级页 + 共享侧边栏协调器行（rank 4.2）；形态 = 函数插件（Host/Client 双半边，学 omnimux-accounts）；产物 = dsh.bundle 可安装组合包。执行通道 = Host 内 `ctx.tools.execute()` 程序化调用 hub `omnimux_publish_*` 官方工具（已核实为 ToolRuntime 公开 API）。**

---

## Issue #544：状态与服务端类型边界

当前状态导出、依赖拆分和 checkJs 门禁见 [record-status-contract.md](record-status-contract.md)。本节更新 Host 状态/类型职责；下文保留初版设计观察，不作为当前 UI 座位或部署状态证明。

## 1. 扩展点逐项裁决

### 1.1 工具面（B1–B5）

**结论：raw `ctx.tools.register` + objectParams 编译完整 JSON Schema，命名前缀 `publish_*`，共 9 个工具。**

- 注册方式：同 omnimux-assets 的 raw register 模式（不走 defineTool，parameters 必须是完整 `type:'object'` schema，`additionalProperties:false`），output 用 jsonOut（`{schema:{type:'object'}, render}`）。`inject = ['tools', 'systemPrompt']`。
- 命名：`publish_*`，不用 `dsh_publish_*`。理由：生态惯例是域名前缀无 `dsh_`（`assets_*`、`workflow_*`、`gxgen_video_process`、hub `omnimux_*`）；`dsh_` 前缀会被误读为框架官方工具。`publish` 与 `workflow` 同级通用度，风险可接受；被否决的 `dsh_publish_*` 理由是伪官方暗示，被否决的裸名（`submit`/`list_records`）理由是无命名空间必撞。
- 工具清单（PRD B1–B5 全覆盖）：

| 工具 | 参数要点 | 对应 PRD |
|---|---|---|
| `publish_list_records` | `status_filter: draft\|submitted\|reviewing\|published\|failed\|all`、`type?`、`page?` | B1 |
| `publish_create_draft` | `type: video\|image` + `payload{title, description, topics[], media[{kind, path\|media_id}], cover?, settings?}` | B2 |
| `publish_update_draft` | `draft_id` + `patch`（与 create 同一份校验） | B2 |
| `publish_delete_draft` | `draft_id` + `confirm: true`（删除语义需显式确认位；confirm 缺省报 `confirm-required`，不静默删） | B5 |
| `publish_list_accounts` | `platform?`；返回 ViewRow 合并视图 + 可用性判定 | B3 |
| `publish_assign_accounts` | `draft_id` + `account_ids[]`；校验账号存在且可用、平台能力与内容类型不冲突 | B3 |
| `publish_submit` | `draft_id`；内联等待本次提交完成，返回 per-account 结果（见 §1.6） | B4 |
| `publish_get_record` | `record_id` + `refresh?`（默认 true：现拉 hub 状态再返回本地账本） | B4 |
| `publish_retry_task` | `task_id`；单账号重提（复用已上传媒体），子任务回 `submitted` | B4 |

- 横切同源约束：工具 execute 与 HTTP 路由调**同一个** dispatcher/service 函数（数据层单一真源），校验逻辑（能力矩阵 + 账号可用性）收敛在 `validate.js` 一处。
- 新增模型可见输入检查：本插件只通过标准 tool I/O 向模型暴露信息，tool result 由 agent loop 自动入会话记录；**无新增会话事件、无 SessionEventMap 扩展**（运行时不变量「模型可见即已记录」天然满足）。

### 1.2 UI 座位

**结论：侧边栏行（共享协调器 rank 4.2）+ `shell.overlay` 一级页（slot id `dsh-publish-stage`，order 22）。**

现场核对结果：

- **侧边栏协调器**（`plugins/omnimux/src/client/sidebar-coordinator.js`）：接口为 `window.__omnimuxSidebar.register({ id, rank, styles, styleId, create }) → disposer`，幂等 rank 排序放置，禁止垂直插件自挂 observer/interval。现有 rank 占用：hub 应用=1（app tabs=2）、omnimux-accounts=3、omnimux-gallery=3、omnimux-assets=4、omnimux-workflow=5。**dsh-publish 取 rank 4.2**（位于创作插件 rank 4 与数据分析/工作流之间）。行规格严格按 sidebar-extra-entries.md：32px 行高 / `0 8px` padding / 14×14 icon / 14px-20px label / 6px gap / 8px corner / `--dsw-alias-interactive-bg-*` hover；marker `data-omnimux-publish-entry`；注册走 `registerWhenReady` 轮询等待 hub 全局就绪后注册一次（同 accounts sidebar-entry.js 范式）。
- **一级页**：`ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name:'shell.overlay', id:'dsh-publish-stage', order:22, locale:NS, inject: stageFace }, PublishStage))`；舞台互斥走 hub `window.__omnimuxStage` 的 `claim/release('dsh-publish')` + `dsh-product-stage` 事件监听（同 accounts stage-store.js）；顶距 `12px 20px 12px`，overlay z-index 200，点会话行退出，不注册 `conversation.view`。
- 客户端半边装载：esbuild 打包 `src/client/index.js` → `lib/client.js`，`window.__ModuleLoader__.load({ id:'dsh-publish', factory })` 包裹；package.json 带 `exports['./client']`、`files` 含 `lib/client.js` + `cordis.patch.yml`、`dsh.client.inject`（`@deepseek-ai/dsh-client-runtime` / `dsh-client-locale`）——完整复制 omnimux-accounts 的装载件写法。

### 1.3 Host HTTP 路由

**结论：自建前缀路由 `/dsh-publish`，`webServer.register({ kind:'prefix', path:'/dsh-publish', handler })`，loopback 写校验本插件内自实现（照抄 omnimux-assets 的 `assertLocalWrite` 同义实现）。**

- 惰性注入：`ctx.inject(['webServer'], mountHttp)`（webServer 是 Service，就绪后端口才可读，同 gxgen §5.3.1）；`ctx.effect(mount, 'dsh-publish: http routes')` 保证卸载摘路由。
- 路由表（全 POST 走 assertLocalWrite；GET 无写副作用）：

| Method & Path | 作用 |
|---|---|
| GET `/dsh-publish/state?rev=` | 修订号便宜轮询（同 assets state 模式） |
| GET `/dsh-publish/records?status=&type=&page=` | 列表三 tab 数据 |
| GET `/dsh-publish/records/detail?id=` | 记录 + 子任务展开 |
| GET `/dsh-publish/capabilities` | 合并后能力矩阵（表单裁剪数据源） |
| GET `/dsh-publish/media/content?id=` | 媒体缩略图只读内容路由（M1 素材卡片需要；Phase 3b 追认，GET 面纪律不变、无写副作用） |
| POST `/dsh-publish/drafts` / `drafts/update` / `drafts/delete` | 草稿 CRUD（action 风格，同 assets） |
| POST `/dsh-publish/media` | 媒体字节流式上传（raw body → sha256 入库，见 §1.5） |
| POST `/dsh-publish/records/submit` | 触发提交，立即返回（后台 runner） |
| POST `/dsh-publish/records/refresh` | 手动状态同步 |
| POST `/dsh-publish/tasks/retry` | 单账号重试 |

- 账号列表**不自建路由**：浏览器半边直接 fetch hub 现有 `GET /omnimux/accounts`（同源相对路径，Electron 下走 IPC fetch 桥）——这是 hub 已有的只读面，不重复造。
- sendJson 带 secret-emission guard（同 assets：响应体含 `access_token|sk-` 即 500 拒发）。

### 1.4 数据层

**结论：`$DSH_HOME/omnimux/publish/` 下 `records.json`（单一账本）+ `media/`（sha256 内容寻址媒体仓）；整文档原子重写 + 修订号；能力矩阵 = 内置常量 + Config 覆盖合并。**

- 磁盘布局（目录 0700 / JSON 0600，tmp+rename 原子写，同 assets `atomicWrite`）：
  - `records.json`：`{ schema:1, revision:n, records:[...] }`。**三类记录是状态机视图不是三份数据**（PRD §2.2①），所以单一账本；draft 就是 `status:'draft'` 的 record，submit 原地转 `submitted` 并物化 `subtasks[]`。
  - `media/<sha256>`：UI 拾取的文件字节与 agent 引用的本地路径统一**入库一份**（内容寻址去重），draft 只引用 media_id —— 保证 A4「重开完整恢复」不依赖浏览器内存，也保证未登录可建草稿（PRD §5.6：presign 需要登录态，所以媒体不能在拾取时就上云）。
- 锁/并发策略：Host 单进程内存串行化（dispatcher 同步互斥段）+ revision 计数；无跨进程锁需求（DSH Host 唯一写者）。提交中断恢复：加载时发现 `submitting` 子任务无 in-flight runner → 标 `failed(reason:'interrupted')`，可重试。
- 记录/子任务核心字段：`record{id, type, status, title, description, topics, media_ids, cover_media_id?, settings, account_ids, created_at, updated_at, submitted_at}`；`subtask{id, record_id, account_id, platform, status: submitted|reviewing|published|failed, post_id(taskId), raw_status, error?, attempts, submitted_at, settled_at}`。**taskId 提交成功即落盘**（hub.md：账本归 vertical）。
- 能力矩阵：`src/config.js` 内置默认矩阵（PRD §5.4 三字段 v1：`media_types / supports_cover / supports_schedule` + 声明类槽位预留），Config `publish.platforms` 深合并覆盖（平台能力变更改配置不改代码）；同一份合并结果经 `GET /dsh-publish/capabilities` 喂 UI、经 `validate.js` 喂工具校验——同源。

### 1.5 执行通道（最关键决策）

**结论：Host 半边通过 `ctx.tools.execute({ callId, name, arguments, signal })` 程序化调用 hub 注册的 `omnimux_publish_presign / create / get`（候选①成立，已核实源码）。**

现场核实证据（harness `141eb6fef8`，`packages/core/tools/src/index.ts`）：

- `ToolRuntime`（即 `ctx.tools`）公开方法 `get(name, scope)` 与 `execute(exec: ToolExecutionInput)`；`ToolExecutionInput = { callId, name, arguments, signal, agent?, rootCallId?, parent? }`，返回 `{ content, isError, value }`。官方测试即此用法（`tools.spec.ts:91`）。`execute` 走完整 pre-policy / guards / around-dispatch / post-policy 管线（与模型直调同一条路），不绕策略。
- hub 的 official 工具（`plugins/omnimux/src/official/mount.js`）在同一 Host Cordis 注册表全局层注册，其 execute 不消费 `exec.agent`，agent 可省。**懒解析**：在工具 execute / HTTP 请求时才 `ctx.tools.get('omnimux_publish_create')`，规避插件加载顺序问题；不存在时报确定性错误 `needs-hub`（「omnimux hub 插件未装载」），不假装成功。
- **agent 透传**：`publish_submit` 的工具 execute 收到 `exec`（含 `exec.agent`）时，把它透传进嵌套 `ctx.tools.execute({..., agent: exec.agent, signal: exec.signal })`——若部署配了 `tools/pre-execute` 的 ask 策略，审批能正确路由回会话；无 agent 的 UI 路径遇 ask 策略会按官方语义 deny（`serviceAsk`：agent-less ask → deny），错误信息原样透出，明确指引走聊天通道提交。默认 dev profile 无此策略，不受影响。
- 媒体上传：hub presign 工具只发预签名，**PUT 字节归提交方**——SubmitService Host 侧读 `media/<sha>` 后 `fetch(uploadUrl, { method:'PUT', body })`。预签名 URL 自授权，不涉 `OMNIMUX_*` secret、不 import hub 模块、不复制 OmniMux 云 envelope，符合「hub 持钥匙、vertical 发请求」的 I/O 图。
- 被否决的备选：② hub neutral seam——`omnimux_publish_*` 是 official-only tool 不是 seam，无 `ctx.get` 入口（hub.md Seams 表核实），**不向 hub 提 seam 需求**（程序化工具调用已闭环；产品化迁移时的合规确认是 PRD §10① 既定事项，与本设计正交）；③ 插件自包 OmniMux HTTP——违反不碰 secret 边界，直接排除；④ 浏览器 fetch hub HTTP 面——hub 无 publish HTTP 路由（只有 `/omnimux/accounts`），且会绕开账本编排，仅账号列表读取用此路。
- 账号数据（agent 路径）：`AccountSource` = `ctx.tools.execute('omnimux_accounts_list')`（站点行）+ 只读 `$DSH_HOME/omnimux/accounts.json`（group/agent_usable overlay）按 hub.md ViewRow 规格自行合并。这是**数据文件耦合**（非模块 import），PRD 边界表明示「读写 omnimux-accounts 数据」；overlay 文件缺失/损坏 → 降级为纯站点行 + 提示。浏览器路径直接用 hub `GET /omnimux/accounts`（其合并是 hub 权威实现）。

**待工程师现场核对（不阻塞设计）**：presign 返回结构（upload_url 字段名/有效期/是否带 header 要求）、create 的 `media_items` 元素结构、同一 presign 媒体可否跨多次 create 复用、get 返回的平台状态字段集（→ `statusMap` 映射，PRD 裁决 #4）。

### 1.6 状态机与子任务账本（submit 编排归属）

**结论：编排归 Host 半边 `SubmitService`（单一实现），agent 工具内联 await、UI 走后台 runner + revision 轮询。不用 dsh `ctx.jobs`。**

- `SubmitService.run(recordId, { agent?, signal? })`：
  1. validate（必填 + 账号可用性 + 能力矩阵冲突，行内错误/确定性 JSON 二态由调用面决定形态）
  2. 每个媒体 presign 一次（`omnimux_publish_presign`）→ PUT 上传（Host fs 读）
  3. **逐账号** `omnimux_publish_create({ account_ids:[单个], content, media_items })`——PRD 分发粒度是账号（§2.2②），per-account create 天然得到独立 post_id（=子任务 taskId）与独立终态/重试；**单账号失败 try/catch 隔离，不阻塞后续账号**（PRD §5.3）
  4. 每次 create 成功立即落盘 taskId（子任务 → `submitted`）；全部账号跑完 → 记录态聚合（任一 submitted→发布中 / 全 published→已发布 / 部分 failed→部分失败）
  5. in-flight Map：同一 record 重复 submit 返回同一 promise（幂等防双发）
- 状态同步 `refresh(recordId)`：对每个有 post_id 的子任务 `omnimux_publish_get` → `statusMap`（Config 可覆盖）把平台原始状态映射到 `reviewing|published|failed`，原始串存 `raw_status`。触发点：手动刷新按钮 + 打开列表页拉一次 + `publish_get_record(refresh:true)`；**无自动轮询**（PRD 裁决 #3）。
- retry：复用已上传媒体，仅重跑该账号 create → 新 post_id 覆写、子任务回 `submitted`、attempts+1。
- **不用 `ctx.jobs`**：jobs 是会话可见的后台任务座位（`jobs.start(spec)`，drama 仅在 agent 会话内机会式使用）；UI 提交无会话上下文，且 hub.md 明言执行通道不留任务账本——账本在我们自己的 records.json。v1 不做 agent 会话内 job 挂接（v2 候选）。
- 编排运行位置被否决的备选：浏览器侧编排（凭证/工具都不可达，且违背同源约束）；agent 工具内联独占实现（UI 复用不了，违背「UI 是工具之上的可视化层」横切约束）。

---

## 2. 插件结构设计

### 2.1 目录结构（学 omnimux-accounts / omnimux-assets 分层）

```text
personal/dsh-publish/
  package.json            # dsh.bundle.patch + exports['./client'] + files + dsh.client.inject
  cordis.patch.yml        # - insert: - id: dsh-publish, name: dsh-publish
  scripts/build-client.mjs# esbuild → lib/client.js（ModuleLoader 包裹，同 accounts）
  lib/client.js           # 构建产物（build 生成，files 收录）
  src/
    index.js              # apply：Config 解析 → stores → dispatcher → 工具注册 → prompt section → 惰性 HTTP 挂载
    config.js             # 内置能力矩阵 + Config（Standard Schema ~standard）+ 合并 + 坏配置显式失败
    paths.js              # $DSH_HOME/omnimux/publish 解析（DSH_HOME > ~/.dsh）
    store.js              # RecordStore：records.json CRUD / revision / 原子写 / 子任务状态迁移 / 中断恢复
    media.js              # MediaStore：HTTP 流式入库 + 本地路径导入，sha256 寻址，大小限额
    accounts.js           # AccountSource：accounts_list 工具 + overlay 文件合并 → ViewRow
    hubtools.js           # HubPublishChannel：ctx.tools.get/execute 懒封装 + needs-hub/needs-omnimux 错误映射
    validate.js           # 能力矩阵 + 账号可用性校验（工具面与 HTTP 面共用）
    submit.js             # SubmitService：presign→upload→per-account create→落账本；refresh；retry；in-flight Map
    http-routes.js        # dispatcher + registerPublishRoutes（assertLocalWrite + sendJson secret guard，自实现）
    *.test.js             # L1 单测（mock ctx.tools / fs 注入）
    client/
      index.js            # apply：locale + stage store + sidebar entry + shell.overlay slot
      sidebar-entry.js    # 契约行（32px/14px/8px；rank 4.2；registerWhenReady）
      stage-store.js      # __omnimuxStage claim/release('dsh-publish')（同 accounts）
      api.js              # /dsh-publish/* 与 hub /omnimux/accounts 的 fetch 封装
      capabilities.js     # 矩阵驱动的表单裁剪判定（置灰/数量上限/冲突提示）
      locales.js             # 样式内联在 sidebar-entry.js 与组件内（无独立 styles.js）
      PublishStage.jsx    # 一级页壳：顶栏(12/20/12) + 三 tab + 页内路由
      RecordsList.jsx     # M1 列表（素材卡片、状态、账号覆盖数、空态）
      RecordDetail.jsx    # A6 per-account 子任务展开 + 刷新
      Composer/           # M2 类型选择 → M3 视频 / M4 图文表单
      AccountPanel.jsx    # M5 平台→账号两级勾选（数据源 hub /omnimux/accounts）
```

### 2.2 模块依赖图（Host 半边）

```text
config.js ──┐
paths.js ──┤
store.js ←──┤            （store 依赖 paths；validate 依赖 config+accounts）
media.js ←──┤
accounts.js ←─ hubtools.js（懒：ctx.tools.execute omnimux_accounts_list）
validate.js ←─ config + accounts + store（读 draft）
submit.js ←─ store + media + hubtools + validate（编排核心）
http-routes.js ←─ submit + store + media（dispatcher 单入口）
index.js：注册 tools（← submit/store/validate/accounts）+ systemPrompt + 惰性挂 http-routes
```

浏览器半边只经 HTTP 读写（`api.js` → Host dispatcher → 同一套 service），**不持有任何业务规则**；表单裁剪判定用的能力矩阵数据也来自 Host（`GET /dsh-publish/capabilities`），保证 UI 与 agent 行为同源。

### 2.3 Config（Standard Schema，同 gxgen ~standard 写法；坏配置显式失败）

| 字段（`publish.*`） | 类型 / 默认 | 说明 |
|---|---|---|
| `dataDir` | string / `$DSH_HOME/omnimux/publish` | 数据目录覆盖（测试用） |
| `platforms` | object / 内置矩阵 | 平台能力矩阵深合并覆盖（`media_types`/`supports_cover`/`supports_schedule` + 预留声明槽位） |
| `statusMap` | object / 内置 | 平台原始状态 → `reviewing\|published\|failed` 映射（随 M0 现场核对后定稿） |
| `maxMediaMb` | number / 512 | 单媒体入库上限 |
| `submitTimeoutSeconds` | number / 120 | 单账号 create 超时 |
| `accountsOverlayPath` | string / `$DSH_HOME/omnimux/accounts.json` | overlay 只读路径（测试可注入） |

Config 变更触发 HMR 换实例（改 `publish.platforms` 即时生效，无需改码）。

### 2.4 清理策略

| 注册项 | 清理方式 |
|---|---|
| `ctx.tools.register` × 9 | 框架 scoped layer 自动回收 |
| `ctx.systemPrompt.section('publish:ops')` | `ctx.effect` 包装（同 assets） |
| webServer 前缀路由 | `webServer.register` disposer + `ctx.effect`（同 gxgen bridge） |
| locale / shell.overlay slot / 侧边栏行 | `ctx.effect` + 协调器 unregister（同 accounts） |
| in-flight submit runner | 进程内 Map，卸载时 abort（signal）并标 `failed('interrupted')` |
| 磁盘数据 | 持久保留（账本归本插件，卸载不清数据） |

---

## 3. 任务拆解（Phase 3 输入，按依赖排序）

| # | 任务 | 依赖 | 验收口径（PRD §7） | 级别 |
|---|---|---|---|---|
| T0 | M0 前置检查：dev-doctor；dev profile 确认 `omnimux_publish_*` 已注册且登录态可用；**现场核对 presign/create/get 真实返回结构并记录**（含 statusMap 定稿） | — | 环境合规；通道连通；结构记录进 docs | L2 |
| T1 | 插件骨架：package.json（dsh.bundle.patch + files + client inject）+ cordis.patch.yml + paths.js + config.js（矩阵+Config+合并） | — | `--dump-config` 出现 dsh-publish；坏 config 显式报错 | L1 |
| T2 | RecordStore + MediaStore：records.json CRUD/revision/原子写/子任务状态机/中断恢复；media sha256 入库 | T1 | `node --test` 绿：状态迁移、三 tab 过滤、恢复语义 | L1 |
| T3 | validate.js + HubPublishChannel（ctx.tools.execute 懒封装、needs-hub/needs-omnimux 映射）+ AccountSource（工具+overlay 合并） | T1, T0 | 单测绿：mock ctx.tools；能力冲突/账号不可用/未登录三分支 | L1 |
| T4 | SubmitService：presign→upload→per-account create→落账本 + refresh + retry + in-flight 幂等 | T2, T3 | 单测绿：mock hub 工具——失败隔离、taskId 即落盘、retry 回 submitted | L1 |
| T5 | 工具面：9 个 `publish_*` 工具注册 + `publish:ops` prompt section（agent 透传 exec.agent） | T4 | dev profile 聊天 E2E 1–4 全通（草稿→assign→submit→状态→重试） | L2 |
| T6 | HTTP 面：/dsh-publish 前缀路由全家（assertLocalWrite + secret guard + state 轮询） | T4 | curl 冒烟：跨源 POST 403；三 tab 数据正确 | L1→L2 |
| T7 | 客户端壳：esbuild 产物 + locale + 侧边栏行（rank 4.2）+ shell.overlay 一级页三 tab + 空态 | T1, T6 | UI E2E 5：行符合契约度量、互斥/退出正确、过滤准确 | L2 |
| T8 | 发布页：类型选择 + 视频/图文表单 + 媒体拾取入库 + 草稿保存/恢复 + 能力矩阵表单裁剪 | T7, T2 | UI E2E 6 + 8：保存重开完整恢复；不支持封面平台置灰 | L2 |
| T9 | 账号面板 + 一键发布（后台 submit + 轮询）+ 记录详情 per-account 状态 + 手动刷新 | T8, T5 | UI E2E 7：单账号失败不阻塞、可重试 | L2 |
| T10 | 横切抽查：UI 5–8 每步映射 B 系列工具组合（抽查表）+ 降级三场景（未登录/无 accounts/能力冲突） | T9 | 横切验收 + PRD §5.6 降级矩阵全过 | L2 |
| T11 | 合规体检 + README（版本观察、契约指针） | T10 | 体检报告通过（Phase 4） | — |

L1 = mock 单测先行可独立完成；T5 起必须 L2（需真实 hub 登录态）。

---

## 4. 风险与待办

1. **hub 工具返回结构未实证**（T0 首务）：presign 响应、media_items 结构、跨 create 复用、get 平台状态字段——影响 submit.js 与 statusMap 细节，不影响整体架构。
2. **UI 路径遇 ask 策略 deny**：官方语义（agent-less ask → deny），默认 profile 无影响；文档写明指引（走聊天提交）。
3. **accounts.json 数据耦合**：schema 变更风险由 hub.md ViewRow 规格 + 降级路径兜底。
4. **程序化调用 official-only 工具的合规确认**：personal 自用已闭环；product 迁移前提即 PRD §10①（hub 侧确认），设计上不新增依赖项。
5. rank 4.2 / overlay order 22 为本设计建议值，若产品树调整占位需同步。
