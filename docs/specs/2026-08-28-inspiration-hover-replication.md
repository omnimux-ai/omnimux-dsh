---
title: "灵感库卡片悬停 CTA × 去对话复刻：架构规格与任务分解"
id: "spec-inspiration-hover-replication"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-08-28"
authors: ["高见远"]
subsystem: "omnimux-inspiration"
related:
  - "docs/specs/2026-08-23-omnimux-local-project.md"
  - "docs/contracts/hub.md"
  - "docs/contracts/sidebar-extra-entries.md"
  - "design.md"
---

# 灵感库卡片悬停 CTA × 去对话复刻：架构规格与任务分解

> **流程部分 SUPERSEDED — 2026-09-09 / #864：** 下文 L2 独立环境与合入前浏览器验收要求退役；产品约束不变。现行 [plugin-qa](../contracts/plugin-qa.md) 要求 worktree 自动化/静态与独立评审，经 required CI/MQ 合入后按需 Dev 45120/ego 验收。历史结果不重标。

> 作者：高见远（扩展点架构）  
> 输入：许清楚《灵感库卡片悬停操作 × 添加到对话复刻 —— 需求评审与 4 轨分流报告》+ 8 项量化 DoD + 现网 `omnimux-inspiration` / `omnimux-workflow` Inspect  
> 给：工程师林深  
> 状态：设计冻结，可开工。未改官方 `packages/`，未新建插件包。跨包客户端 **禁止 import**。

**选型结论：轨道 C（现有 `dsh.bundle`）+ 客户端全局缝 `window.__omnimuxWorkflow.startReplicationProject` + 无新增 Slot / 无新增 Host 路由 / 无 Package RPC。**

---

## 1. 选型与架构定界

一句话：在现有 Track C 双包上，用与 `__omnimuxStage` / `__omnimuxAuth` 同构的 **window 全局缝** 把「去对话复刻」从灵感库一级页接到工作流 `runNewProject`，Composer 注入留在灵感库包内（市场插件已验证的 React 18 setter + 发送按钮点击），**严禁** `omnimux-inspiration` import `omnimux-workflow` 客户端模块。

| 候选 | 结论 | 理由 |
|---|---|---|
| **`window.__omnimuxWorkflow` 全局缝** | **唯一选型** | AGENTS.md 硬约束：垂直插件不得跨包 import 客户端。现网先例：`__omnimuxStage` / `__omnimuxSidebar` / `__omnimuxAuth` / `__omnimuxClipReady`。本缝需要 **带返回值的命令**（项目 id / sessionId / error），CustomEvent 是单向广播，不够。 |
| `CustomEvent('omnimux-workflow-replicate')` | 否决 | clip 用事件是因为画布↔剪辑要双向、无返回值。复刻需要 `Promise<{ok,error}>`、幂等锁、参数校验。用事件还得再发明 reply channel，比全局函数浅。 |
| 灵感库 `inject: ['sessions','workspaces']` 自己建项目 | 否决 | 会复制 `runNewProject` / `createProjectSession` / `dismissProductStage` / `activateProjectCanvas`，且灵感库会绕过 Host `/omnimux-workflow/api/projects`。项目域只属于 workflow。 |
| 跨包 `import { runNewProject } from 'omnimux-workflow/...'` | **严禁** | 客户端加载顺序不保证；ModuleLoader 各包独立 CJS factory。 |
| 新 Host `/omnimux/inspiration/replicate` | 否决 | 不需要服务端编排。项目创建已有 `POST /omnimux-workflow/api/projects`。 |
| Package RPC `harness.handle` / `host.call` | 否决 | 两端都在同一渲染进程 Client，不是 Host↔Client 私有通道。 |
| 新 Slot / 新一级页 / `ctx.commands` / `ctx.tools` | 否决 | UI 挂在现有 `shell.overlay` 灵感库卡片上；模型工具 `inspiration_get` 已存在，本轮只是把 id 写进对话。 |
| 弹 `promptNewProjectName` | 否决（DoD） | 「彻底避免工作区弹窗中断」。标题由灵感 title 派生，走 Host 默认库。 |

形态：两个现有对象插件（`export const name/inject` + `apply`）。产物仍是各自 `dsh.bundle`。  
清理：workflow `ctx.effect` 安装全局缝，disposer `delete window.__omnimuxWorkflow`（对齐 clip 的 `__omnimuxClipReady`）。

官方 / 仓内真源（Inspect 已核对，禁止凭记忆改签名）：

- `plugins/omnimux-workflow/src/client/projects/newProject.js` — `runNewProject(ctx, { title })`、`createProjectSession`、`dismissProductStage`
- `plugins/omnimux-workflow/src/client/projects/projectCanvas.js` — `activateProjectCanvas`、`PROJECT_CANVAS_RATIO = 0.85`
- `plugins/omnimux-workflow/src/client/index.js` — `inject: ['slots','locale','sessions','workspaces','layout']`，`apply` 已持有建项目所需 ctx
- `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` — `PureCoverCard` 整卡 `onClick` → `InspirationModal`；checkbox 已 `stopPropagation`
- `plugins/omnimux-inspiration/src/client/styles.js` — overlay 现为 `pointer-events: none`（本轮必须改 CTA 行）
- `plugins/omnimux-market/src/client/composer.js` + `tool-views.js` — `insertGesture`（原型 setter + `InputEvent`）与 `findSendButton().click()`
- `plugins/omnimux-inspiration/src/index.js` — Host 工具 `inspiration_get({ id })` 已注册，提示词只引用它，不新造 tool

---

## 2. 架构拓扑

```text
[灵感库 Stage  shell.overlay#omnimux-inspiration-stage]
        │  hover CTA「去对话」
        │  纯函数：deriveProjectTitle / buildReplicationPrompt
        ▼
 waitForWorkflowGlobal(timeout=4000)
        │  未就绪 → toast + 中止（不建会话、不写 Composer）
        ▼
 window.__omnimuxWorkflow.startReplicationProject({ title, source:'inspiration' })
        │  （跨包唯一缝；JSON 入参 / JSON 出参）
        ▼
[工作流 Client apply() 闭包里的 ctx]
        │  1. validateProjectTitle(title)
        │  2. 进程内 inflight 锁（已有则返回 {ok:false, error:'busy'}）
        │  3. runNewProject(ctx, { title })     ← 不弹窗、不传 projectRoot
        │       POST /omnimux-workflow/api/projects { title }
        │       workspaces.create({ path: project.path })
        │       sessions.create({ workspaceId })     ← 严禁 cwd / connectWorkspace
        │       bindProjectSession
        │       dismissProductStage(stage)           ← 清 html[data-dsh-product-stage]
        │       sessions.open(sessionId)
        │       activateProjectCanvas(..., 15:85)
        ▼
 Promise<{ ok, project, sessionId, cwd } | { ok:false, error }>
        │
        ▼
[灵感库 replicate-to-chat.js]
        │  waitForComposer(timeout=6000)
        │  insertComposerText(prompt)     ← 原型 value setter + InputEvent
        │  clickSendButton()              ← aria-label 发送消息 / Send message / Send
        │  失败 → toast「已打开对话，请按发送」（不重试建项目）
        ▼
[官方 Composer + 新会话]
        Agent 读 /skill 手势（若已装）→ inspiration_get(id) → 画布编排
```

数据方向：灵感库 **只出** `{title}` 给工作流，**只入** `{ok, sessionId, error}`。`inspiration_id` / `media_type` / `source_url` **不进** 工作流全局缝（那是 Composer 提示词的域）。工作流 **不知道** 灵感库存在。

---

## 3. 扩展点与 Slot 契约清单

本轮 **零新增 Slot**。沿用：

| 挂载点 | 协议 | 所有者 | 本轮动作 | 清理 |
|---|---|---|---|---|
| `shell.overlay` `id=omnimux-inspiration-stage` order 27 | single overlay | inspiration | 改 `PureCoverCard` DOM，不改 slot 注册 | Fiber 卸载 |
| `shell.overlay` `id=omnimux-workflow-stage` order 40 | single overlay | workflow | 不改 | — |
| `window.__omnimuxStage` claim/release | hub singleton | hub | `dismissProductStage` 已清 `data-dsh-product-stage` | 现有 |
| `dsh-better-sidebar` tab `omnimux-workflow:canvas` | keyed tab | workflow | `activateProjectCanvas` 已写 15:85 | 现有 |
| `ctx.tools` `inspiration_get` | tool | inspiration Host | 不改；提示词引用 | Fiber 卸载 |
| **`window.__omnimuxWorkflow`** | **新全局缝** | **workflow Client** | **本轮唯一新扩展点** | **`ctx.effect` disposer 删除全局** |

### 3.1 `window.__omnimuxWorkflow` 接口（冻结）

```js
/**
 * @typedef {{
 *   version: 1,
 *   startReplicationProject: (input: ReplicationInput) => Promise<ReplicationResult>,
 * }} OmnimuxWorkflowGlobal
 *
 * @typedef {{
 *   title: string,                 // 必填，已 trim；工作流再走 validateProjectTitle
 *   source?: 'inspiration',        // 预留来源枚举，缺省当 inspiration
 * }} ReplicationInput
 *
 * @typedef {{
 *   ok: true,
 *   project: { id: string, title: string, path: string, sessionId: string },
 *   sessionId: string,
 *   cwd: string,
 * } | {
 *   ok: false,
 *   error: 'title-required' | 'title-invalid' | 'title-too-long'
 *        | 'busy' | 'unavailable' | 'no-workspace' | 'create-failed' | string,
 * }} ReplicationResult
 */
```

不变量：

1. **安装时机**：`omnimux-workflow` Client `apply(ctx)` 里 `ctx.effect(install, 'omnimux-workflow: global seam')`。闭包捕获 `sessions/workspaces/layout/stage/t`，`betterSidebar` 仍走现有 `bindBetterSidebar`，禁止把未 inject 的 Proxy 字段塞进闭包。
2. **幂等安装**：`window.__omnimuxWorkflow?.version === 1` 且 `typeof startReplicationProject === 'function'` 则复用，不覆盖别人的对象。
3. **卸载**：disposer `delete window.__omnimuxWorkflow`。灵感库调用前必须再读一次全局。
4. **防重入**：模块级 `inflight` Promise。第二次调用立即 `{ ok:false, error:'busy' }`，**不排队**（避免连点产孤立项目）。
5. **禁止弹窗**：`startReplicationProject` 不得调用 `promptNewProjectName`。标题非法只返回 error。
6. **禁止 `cwd`**：内部只许 `workspaces.create({ path })` → `sessions.create({ workspaceId })`。单测沿用 `newProject.test.mjs` 断言 `'cwd' in createOpts === false`。
7. **异步错误**：`runNewProject` 已吞异常为 `{ ok:false, error }`。全局缝不得 throw 到灵感库（灵感库只认 result.error）。编程错误（ctx 丢失）返回 `unavailable`。

### 3.2 灵感库等待与降级

```js
// plugins/omnimux-inspiration/src/client/workflow-global.js
export const WORKFLOW_GLOBAL_KEY = '__omnimuxWorkflow'
export const WORKFLOW_WAIT_MS = 4000

export async function waitForWorkflowGlobal(timeoutMs = WORKFLOW_WAIT_MS) { /* poll 50ms */ }
```

| 条件 | 行为 |
|---|---|
| 4s 内 `startReplicationProject` 可用 | 调用并处理 result |
| 超时 / 非函数 | toast `t('card.cta.workflowMissing')`，按钮恢复，**不** `sessions.create`，**不** 写 Composer |
| `{ error:'busy' }` | toast `t('card.cta.busy')`，不重试 |
| `{ error:'title-*' }` | 内部不应发生（灵感库已派生合法 title）；若发生 toast generic |
| `{ error:'no-workspace'/'create-failed'/… }` | toast `t('card.cta.createFailed')` 带 error |
| `{ ok:true }` 但 Composer 找不到 / 发送按钮 disabled | toast `t('card.cta.sendManual')`——项目已建，禁止再调 `startReplicationProject` |

Toast 实现：不引入新 UI 库。用现有 `dsh-ui-kit` 若已有轻提示则用之；否则卡片底部 2s `aria-live="polite"` 文案（`omnimux-inspiration-cta-status`），禁止 `window.alert`。

---

## 4. Package RPC / Host 契约

**本轮不新增 Package RPC，不新增 Host 路由。** 工作流 Host 现有契约保持：

```
POST /omnimux-workflow/api/projects
  in:  { title: string, sessionId?: null, projectRoot?: omitted }
  out: { project: { id, title, path, ... } }

PATCH /omnimux-workflow/api/projects/:id
  in:  { sessionId: string }
```

灵感库 Host 现有：

```
inspiration_get
  in:  { id: string }
  out: { item: LocalInspirationRecord }
```

Composer 不是 RPC，是官方 DOM 旁路（与 `omnimux-market` 同源）。优先顺序：

1. `insertComposerText(text)` — `HTMLTextAreaElement.prototype` value setter + `InputEvent({bubbles, inputType:'insertText'})`
2. `findSendButton()` — `button[aria-label="发送消息"], button[aria-label="Send message"], button[aria-label="Send"]`
3. 不调用 `sessions.binding().session.prompt`（灵感库 **不** 增加 `sessions` inject，避免未声明服务把 apply() 打爆）

---

## 5. UI：`PureCoverCard` 悬停与事件隔离

### 5.1 DOM（目标结构）

```text
article.omnimux-inspiration-card-pure          role=button  （保留键盘打开详情）
  ├─ IconButton.card-check                     z=5  仅 isLocal；已 stopPropagation
  ├─ span.badge-platform                       z=4  pointer-events:none
  ├─ img | .cover-fallback
  └─ .card-overlay                             默认 pointer-events:none
       ├─ .overlay-play                        保留装饰，pointer-events:none
       ├─ .overlay-cta                         pointer-events:auto; z=6
       │    ├─ button.overlay-cta-btn.secondary   「查看详情」
       │    └─ button.overlay-cta-btn.primary     「去对话」
       └─ .overlay-footer                      标题，z=1
```

多选态（`.omnimux-inspiration-grid.selecting`）：**隐藏** `.overlay-cta`（`display:none`），避免和 checkbox 抢点击。整卡 click 仍走现有 `onToggleSelect`。

### 5.2 事件矩阵

| 目标 | click | mousedown / pointerdown | keydown Enter/Space |
|---|---|---|---|
| 复选框 | `stopPropagation`，toggle | `stopPropagation` | 按钮自身 |
| 「查看详情」 | `preventDefault+stopPropagation` → `onSelect(row)`（现有 Modal） | `stopPropagation`（防卡片按下态） | 打开 Modal，不冒泡到 article |
| 「去对话」 | `preventDefault+stopPropagation` → `onReplicate(row)` | `stopPropagation` | 触发复刻 |
| 卡片空白 / 封面 | 非多选：打开 Modal（兼容无悬停设备） | 默认 | article `onKeyDown` 打开 Modal |
| overlay 渐变层 | 无（pointer-events:none） | — | — |

`onReplicate` 必须在 `InspirationSection` 持有 **模块级+组件级** 锁：按钮 `disabled={busyId===row.id}`，busy 期间所有卡片的「去对话」都 `aria-disabled`。

### 5.3 Token / 几何（design.md）

胶囊 CTA 视为 **卡片内 Chip**（design.md §2.2 允许 Chip/Badge 用 `9999px`），不是工具栏按钮，故不与 8px 控件混用。

| 属性 | 值 |
|---|---|
| 行高 | `28px`（密集卡片，允许 `--btn-sm`；禁止 26/30/32 混用） |
| 圆角 | `9999px` |
| 间距 | `gap: 6px`；底部 `padding` 与 overlay 现有 `12px` 对齐 |
| 左次 | 背景 `var(--dsw-alias-bg-mask-1)` + `backdrop-filter: blur(8px)`；字/图标 `var(--dsw-alias-label-primary)`；边 `var(--dsw-alias-border-l3)` |
| 右主 | 背景 `var(--dsw-alias-button-primary-fill)`；字 `var(--dsw-alias-label-primary-foreground)`；hover `var(--dsw-alias-button-primary-hover)` |
| 图标 | 内联 SVG 14×14，`stroke="currentColor"`，**禁止 emoji / Unicode**。详情 = 眼睛（lucide `Eye` 路径）；对话 = 气泡（lucide `MessageCircle` 路径）。不新增 `lucide-react` 运行时依赖（卡片已手写 SVG）。 |
| overlay 显现 | 保持现有 `:hover { opacity:1 }`；CTA 随 overlay 显现 |
| 禁止 | 裸 hex、`--omx-*`、JS 主题分支、`filter: invert()` |

触控/无 hover：卡片 click 仍开详情，不阻断现网。CTA 仅增强悬停。

### 5.4 i18n（动词纯粹律）

| key | zh | en |
|---|---|---|
| `card.cta.detail` | 查看详情 | Details |
| `card.cta.try` | 去对话 | Try in chat |
| `card.cta.workflowMissing` | 工作流未就绪，请确认已安装工作流插件 | Workflow plugin is not ready |
| `card.cta.busy` | 正在创建对话，请稍候 | Creating a chat, please wait |
| `card.cta.createFailed` | 创建项目失败 | Could not create project |
| `card.cta.sendManual` | 已打开对话，请按发送 | Chat is ready — press Send |
| `card.cta.replicating` | 正在打开对话… | Opening chat… |

禁止「去对话中试试」这种客服长句（放不进 28px 胶囊）。`aria-label` 用完整 key，按钮可见文本用短词。

---

## 6. 标题派生与提示词（纯函数，必须单测）

文件：`plugins/omnimux-inspiration/src/client/replication.js`（零 DOM，node:test 可跑）。

```js
import { /* 不 import workflow */ } from ''

export const REPLICATION_SKILL = 'video-replication'
export const MAX_TITLE = 200  // 与 workflow MAX_PROJECT_TITLE_LENGTH 对齐，复制常量，禁止跨包 import

export function deriveProjectTitle(row) {
  // 1. String(row.title || row.source_url || row.id || '灵感复刻').trim()
  // 2. 去掉 https?://(www.)
  // 3. 非法路径字符替换为 _（复制 sanitize 规则，禁止 import workflow/folderName.js）
  // 4. 截断到 MAX_TITLE；空则 '灵感复刻'
}

export function resolveMediaType(row) {
  const t = String(row.type || '').toLowerCase()
  if (t === 'video' || t === 'image' || t === 'link') return t
  if (row.local_paths?.video) return 'video'
  return 'video' // 灵感库主体是短视频，缺省 video
}

export function buildReplicationPrompt(row) {
  const id = String(row.id || '')
  const title = String(row.title || '').trim()
  const url = String(row.source_url || '').trim()
  const media = resolveMediaType(row)
  return [
    `/${REPLICATION_SKILL}`,
    '',
    `请复刻灵感库条目。`,
    `- inspiration_id: ${id}`,
    `- media_type: ${media}`,
    `- title: ${title}`,
    `- source_url: ${url}`,
    '',
    '步骤：',
    '1. 若已安装对应 skill，先读取技能说明书。',
    '2. 调用 inspiration_get，传入上述 inspiration_id，读取五维拆解。',
    '3. 在当前工作流画布上创建复刻编排（按媒体类型选择视频/图片节点）。',
    '4. 等待用户补充或替换主体人物、商品图后再生成。不要假装已经出片。',
  ].join('\n')
}
```

`REPLICATION_SKILL` 允许仓库里尚无该 skill：手势写进 Composer 是产品约定，Agent 读不到 skill 时仍应执行步骤 2–4。**禁止**为了本功能去新建 skill 包。

---

## 7. Composer 注入契约

文件：`plugins/omnimux-inspiration/src/client/composer-inject.js`。

从 `omnimux-market/src/client/composer.js` **复制** `insertGesture` 的 setter 算法，改为「整框替换」而不是 caret 插入：

```js
export function setComposerValue(field, text) { /* proto setter + InputEvent */ }
export function findComposer() { /* 与 market 相同选择器 */ }
export function findSendButton() { /* 与 market 相同 aria-label */ }

export async function submitReplicationPrompt(text, { timeoutMs = 6000 } = {}) {
  // poll findComposer
  // setComposerValue
  // 若 value 不含 inspiration_id → return { ok:false, error:'composer-rejected' }
  // findSendButton；disabled 则 return { ok:false, error:'send-disabled' }
  // send.click()
  // return { ok:true, via:'click' }
}
```

时序：`startReplicationProject` resolve **之后**再 poll Composer（`dismissProductStage` 会让对话列重新显示）。禁止在关 Stage 前找 textarea（一级页遮住 composer）。

并发锁（灵感库模块级）：

```js
let replicateLock = Promise.resolve()
export function runExclusive(fn) {
  const run = replicateLock.then(fn, fn)
  replicateLock = run.then(() => {}, () => {})
  return run
}
```

与 workflow `inflight` 双锁：前端连点先被 inspiration lock 吃掉，漏过的被 workflow `busy` 挡。

---

## 8. 任务实施清单（林深 T1–T6）

Worktree：`./scripts/git-wt.sh start inspiration hover-replication <issue-id>`。  
风险：**R1**（跨插件公开全局缝 + 一级页 UI）。一 PR 两包，PR 说明「灵感库 CTA 必须叫工作流建项目，禁止复制 runNewProject」。禁止拆成两个互不等待的 PR。  
构建：改 `src/client/**` 后两边都要跑各自 `pnpm --filter omnimux-inspiration build` / `omnimux-workflow` 的 `build-client`（只改 client 时不必 rebuild host/canvas）。  
验收：单测全绿 **不够**；必须 `pnpm verify:live omnimux-inspiration` + ego-browser（plugin-qa.md）。

### T1 工作流全局缝

- **文件**：新建 `plugins/omnimux-workflow/src/client/projects/workflow-global.js`；改 `src/client/index.js` `apply()`；新建 `workflow-global.test.mjs`
- **签名**：
  ```js
  export const WORKFLOW_GLOBAL_KEY = '__omnimuxWorkflow'
  export function installWorkflowGlobal(target, deps) // deps: { sessions, workspaces, layout, stage, t }
  export function startReplicationProject(deps, input, io = { runNewProject })
  ```
- **约束**：`startReplicationProject` 只调 `runNewProject(deps, { title })`；单测 mock `runNewProject`，断言不出现 `promptNewProjectName`、`create({ cwd })`、`connectWorkspace`。二次调用返回 `busy`。`install` 返回 disposer。
- **验收**：`node --test plugins/omnimux-workflow/src/client/projects/workflow-global.test.mjs` 全绿；`apply()` 里 `ctx.effect(() => installWorkflowGlobal(window, deps), 'omnimux-workflow: global seam')`。

### T2 灵感库纯函数 + Composer 工具

- **文件**：新建 `replication.js`、`replication.test.js`、`composer-inject.js`、`composer-inject.test.js`、`workflow-global.js`（wait helper）
- **签名**：见 §6 / §7 / §3.2
- **约束**：`replication.js` 零 `window`/`document`。`composer-inject` 通过参数注入 `document` 以便 jsdom/node 测试。wait helper 注入 `getWindow`。
- **验收**：title 截断、URL 标题、空标题回退、prompt 含 `/skill video-replication` 与 `inspiration_id`；setter 路径在假 textarea 上改 value 并 dispatch input。

### T3 PureCoverCard UI + 事件隔离

- **文件**：`InspirationSection.jsx`（`PureCoverCard` 增 `onReplicate`；CTA 两个 `<button type="button">`）；`styles.js`；`locales.js`
- **约束**：checkbox / 两 CTA / article 按 §5.2。overlay 主体保持 `pointer-events: none`，`.overlay-cta` 为 `auto`。多选网格隐藏 CTA。无 emoji。100% `--dsw-alias-*`。
- **验收**：`styles.test.js` 增断言：`.omnimux-inspiration-overlay-cta { pointer-events: auto }`、按钮 `height: 28px`、`border-radius: 9999px`、CSS 不含 `👁`/`💬`；locale zh/en key 对齐。

### T4 去对话调度器（灵感库）

- **文件**：新建 `replicate-to-chat.js` + `replicate-to-chat.test.js`；`InspirationSection` 把 `onReplicate` 接到调度器
- **签名**：
  ```js
  export async function replicateInspirationToChat(row, io)
  // io: { waitForWorkflow, startReplication, submitPrompt, now, onStatus }
  ```
- **流水线**：derive title → exclusive lock → wait global → `startReplicationProject` → `submitReplicationPrompt(buildReplicationPrompt(row))` → status。任一步失败写 `onStatus(errorKey)`，成功不 toast。
- **验收**：假时钟测 4s 超时走 `workflowMissing`；`busy` 不二次 submit；`ok:true` 但 submit 失败 **不再** 调 startReplication。

### T5 回归：项目创建契约不被破坏

- **文件**：现有 `newProject.test.mjs` 必须继续全绿；可选加一条「`startReplicationProject` 走同一 `runNewProject`」
- **约束**：T1 不得改 `runNewProject` 签名。若要抽 `io.runNewProject`，默认仍 import 原函数。
- **验收**：`plugins/omnimux-workflow` `pnpm test`；灵感库 `pnpm test`。

### T6 真机 / ego-browser（交付门禁）

- **步骤**：L2 `yarn omnimux:dev start inspiration-replication omnimux-inspiration`（workflow 必须在 profile 里，否则测降级）。ego-browser：打开灵感库 → hover 第一张卡 → 断言两颗 CTA 文本 → 点「查看详情」Modal 出现且无新会话 → 关 Modal → 点「去对话」→ `data-dsh-product-stage` 消失 → composer 含 `inspiration_id` → 画布 tab 存在。
- **降级用例**：临时 unload workflow 全局（`js(() => { delete window.__omnimuxWorkflow })`）再点「去对话」，断言无新 project 请求、出现缺失文案。
- **验收**：`docs/evidence/live-qa-report.json` + 截图；缺浏览器证据 = 未完成。

---

## 9. 明确不做

- 不新建 skill 包、不改 `inspiration_get` 参数。
- 不改工作流新建项目弹窗的侧栏入口。
- 不在灵感库 inject `sessions` / `workspaces`。
- 不把 `inspiration_id` 写入 `project.json`（P1 再议；P0 只进对话文本）。
- 不自动执行画布节点、不声称已出片。
- 不把 CTA 做成 emoji 胶囊，不引入 `--omx-*`。

---

## 10. 与 8 项量化 DoD 对照

| # | DoD | 本规格落点 |
|---|---|---|
| 1 | 悬停两颗胶囊，左次右主，SVG，DSH token | T3 §5 |
| 2 | 详情 / 去对话 / 复选框 / 整卡 click 严格隔离 | T3 §5.2 |
| 3 | 查看详情只开现有 InspirationModal | T3 `onSelect` |
| 4 | 去对话不弹项目名/目录窗，标题来自灵感 | T1 + `deriveProjectTitle` |
| 5 | `workspaces.create({path})` → `sessions.create({workspaceId})` | T1 复用 `runNewProject`；T5 回归 |
| 6 | 关灵感 Stage，开新会话，画布 15:85 | `dismissProductStage` + `activateProjectCanvas` |
| 7 | Composer 含 skill 手势与 id/type/title/url，自动发送 | T2 + T4 |
| 8 | 防抖防重入 + 工作流缺失降级 + 单测 | inflight + exclusive + T1/T2/T4 测试 + T6 真机 |
