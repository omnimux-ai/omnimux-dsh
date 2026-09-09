---
title: "omnimux-market Agent 工具矩阵：架构设计与任务拆解"
id: "spec-omnimux-market-agent-tool-matrix"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-08-24"
authors: ["x", "agent-architect"]
subsystem: "omnimux-workflow"
---

# omnimux-market Agent 工具矩阵：架构设计与任务拆解

> **流程部分 SUPERSEDED — 2026-09-09 / #864：** 下文 L2 Web 验收流程退役；工具与产品约束不变。现行 [plugin-qa](../contracts/plugin-qa.md) 要求合入前 worktree 自动化/静态与独立评审，经 required CI/MQ 合入后按需 Dev 45120/ego 验收。历史结果不重标。

> 作者：高见远（架构）  
> 输入：许清楚《omnimux-market Agent 工具矩阵需求规格说明书》要点 + 现网 `omnimux-market` 源码审计 + 广场规格 `2026-08-23-omnimux-market-agent-plaza.md`  
> 给：工程师林深  
> 状态：设计冻结，可开工。未改官方 `packages/`，未新建插件包。

**选型结论：`挂载点 = ctx.tools，形态 = 对象插件，产物 = dsh.bundle`。**

---

## 0. 对照归属映射（唯一选型 + 否决备选）

本轮要加的是 **模型可见输入**（搜 / 装 / 卸 DSH 插件与连接器），不是用户斜杠命令、不是后台任务主路径、不是换模型、不是一级页。

| 候选 | 结论 | 理由 |
|---|---|---|
| **`ctx.tools.register(defineTool)`** | **唯一选型** | 官方「开发一个 Tool」契约：进 system prompt、可被模型调用。现网 `skillhub_*` / `plaza_*` 已走这条缝。 |
| `ctx.commands` | 否决 | 那是用户命令，不是模型工具。卸载黑名单若只挂命令，Agent 看不见。 |
| `ctx.jobs` 作主挂载 | 否决（P0） | 安装可长达 15 min，P1 再考虑 `jobs.start`。P0 复用 UI 已验证的锁 + 阻塞 `execute`，避免再开 Client 轮询。 |
| 事件 waterfall（`agent/pre-step` 等） | 否决 | 不改会话循环。身份/目录不靠中途改 prompt。专家身份已有 `systemPrompt.section`。 |
| Service 三层 | 否决 | 没有第二个包要消费「市场」能力；垂直包禁止 import hub。 |
| LLM 适配器 | 否决 | 不换模型提供方。 |
| Client Slot 作主路径 | 否决 | Slot 不进模型请求。`tool.call.toolview` 只给人看。`plaza_search` 座保持 `return null`。插件卡 P0 用 `output.render` 防刷屏，不新开货架 Slot。 |
| `cordis_define` 动态包 | 否决 | 产物已是 `dsh.bundle`（`package.json#dsh.bundle`）。两套格式严禁混用。 |
| 新插件包 / 复活 `omnimux-gallery` | 否决 | 广场规格红线：只改 `omnimux-market`。 |
| `ctx.inject` hub `PROTECTED_BUNDLES` | 否决 | 垂直包不得 import `omnimux`。黑名单在本包 **复制常量并单测对齐**，不跨包引用。 |

形态：沿用现网 **对象插件**（`export const name/inject/Config` + `export function apply`）。不改成类插件。  
产物：`omnimux-market` 已是可安装 `dsh.bundle`。本轮不改 bundle 边界。  
清理：`ctx.tools.register` / `systemPrompt.section` / `webServer.register` / `settings.register` / Client `slots.inject` 均由 Fiber 卸载自动撤回。`ctx.effect` 只留给 CSS / locale（已有）。

官方真源（本机 checkout `/Users/x/Desktop/Project/Github/deepseek-harness`）：

- `docs/user/develop/basic/tool.md` — `inject: ['tools']` + `defineTool`
- `docs/user/develop/basic/config.md` — Config + Schemastery，坏配置加载失败
- `docs/user/develop/framework/index.md` — 注册项随 Fiber 清理
- `docs/cookbook/adding-a-tool.md` — `execute` 内再做 DSL 表达不了的校验；失败抛错

---

## 1. 架构图（文字层级）

```
omnimux-market（对象插件 / dsh.bundle）
│
├── Host 装配缝（唯一对外 Cordis 入口）
│   host.ts
│     apply(ctx, config)
│       ├─ inject: ['tools']（硬依赖）
│       ├─ ctx.inject(['systemPrompt'])  → 段：plaza:attached-expert / tool:plaza-experts / tool:skillhub / tool:plugins / tool:connectors
│       ├─ ctx.inject(['webServer'])     → /omnimux-market  HTTP（人用，不新增方法也可被工具复用）
│       └─ ctx.inject(['settings'])      → settings.plugin.item
│
├── 工具工厂缝（模型可见；无 Context；可单测）
│   ├─ plaza-tools.ts        createPlazaTools     → plaza_search / plaza_summon / plaza_install
│   ├─ plugin-tools.ts       createPluginTools    → plugin_search / plugin_install / plugin_uninstall / plugin_list
│   └─ connector-tools.ts    createConnectorTools → connector_search / connector_install / connector_uninstall / connector_list
│   （skillhub_* 本轮仍在 host.ts 内联，禁止无收益搬家）
│
├── 领域实现（工厂只编排，不复制安装逻辑）
│   ├─ plugin-market.ts      目录 / install-plan / withPluginInstallLock / 已装判定
│   ├─ dsh-cli.ts            addDshPlugin + 【本轮补】removeDshPlugin；禁止 Agent 走 bash
│   ├─ expert/catalog.js     本地广场 catalog
│   ├─ expert/install.js     installItem / writeMcpRow / removeMcpRow
│   ├─ expert/summon.js      专家召唤（连接器拒绝）
│   ├─ marketplace-connectors.ts  WorkBuddy 市场只读展示（installable=false）
│   ├─ install.ts            SkillHub zip 技能装卸载（skillhub_* 专用）
│   └─ session-attach.ts     会话专家落盘（插件/连接器不得写入）
│
├── 模型可见文本
│   ├─ host-render.ts        skillhub + plugin + connector 的 render*（防刷屏）
│   └─ plaza-tools.ts        renderPlazaSearch / PLAZA_PROMPT_LINES（专家芯片格式特殊，不并入 host-render）
│
└── Client（本轮不扩货架 Slot）
    apply.js                 已有 tool.call.toolview: skillhub_search / plaza_search(null) / skillhub_list
    插件/连接器 Agent 卡 P0 不注册 toolview，避免叠层；人继续走侧栏四 tab
```

**依赖方向（只许向下）：**

```
host.ts
  → plugin-tools.ts / connector-tools.ts / plaza-tools.ts / host-render.ts
      → plugin-market.ts / dsh-cli.ts / expert/* / session-attach.ts / marketplace-connectors.ts
          → Node fs / child_process / SkillHub HTTP
```

禁止：工厂 import `Context`；工具 execute 里 `spawn`/`bash`；`plugin-tools` import `omnimux` hub；连接器工厂走 `dsh plugin add`。

---

## 2. 模块边界与文件职责

| 文件 | 职责（Interface） | 不负责 |
|---|---|---|
| `host.ts` | 装配：`defineTool` 注册、prompt 段、HTTP、settings。薄编排。 | 搜索打分、装卸载、黑名单判定、MCP 拼装。 |
| `plugin-tools.ts` | **新。** `createPluginTools(deps)` 返回 4 个工具规格。参数校验、黑名单、锁、render 文案编排。 | 不自己 spawn CLI；不读 hub。 |
| `connector-tools.ts` | **新。** `createConnectorTools(deps)` 返回 4 个工具规格。只允许 `kind=connector`。市场源 `installable=false` 硬拒。 | 不写专家落盘；不 `dsh plugin`。 |
| `plaza-tools.ts` | 已有。专家/团搜召。`plaza_install` 继续拒绝 expert/team。 | 不搜 DSH 插件；不主动推连接器。 |
| `host-render.ts` | 模型可见短文：skillhub + **本轮加** plugin_* / connector_*。 | 专家 chip label（留 plaza-tools）。 |
| `session-attach.ts` | 会话专家身份真源。路径穿越消毒。 | 插件/连接器状态。 |
| `plugin-market.ts` | SkillHub 插件目录、pinned github plan、`withPluginInstallLock`。 | 工具 schema / prompt。 |
| `dsh-cli.ts` | Host 进程内 `dsh plugin add/remove`。目标消毒、ndjson 进度。 | 黑名单（在 plugin-tools 判定后再调用）。 |
| `expert/install.js` | catalog 安装 + MCP 托管段。 | Agent 工具名。 |
| `marketplace-connectors.ts` | 本地市场只读。 | 安装（P0 `installable=false` 不变）。 |
| `local-api.ts` | 人用 HTTP。工具与 HTTP **调用同一领域函数**，禁止第二套安装。 | 不注册 tools。 |

**删除测试：** 若删 `plugin-tools.ts`，黑名单/锁/防刷屏会散落到 host 与 HTTP，N 处重复。该模块赚得过接口成本。

---

## 3. 工具工厂：类型签名

新建共享规格（放 `src/types.ts`，不要另起 `tool-spec.ts` 除非类型膨胀）：

```ts
export interface MarketToolSpec {
  name: string
  description: string
  parameters: Record<string, { type: string; required?: boolean; description?: string; items?: { type: string } }>
  output: {
    schema: { type: 'object'; additionalProperties: true }
    render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
    presentationMeta: (args: unknown, value: unknown) => Record<string, unknown>
  }
  presentCall: (args: Record<string, unknown>) => { card: 'generic'; title: string; kind?: string; content: unknown[] }
  presentResult: (args: unknown, info: { isError?: boolean; meta?: Record<string, unknown> }) => { card: 'generic'; title: string; content: unknown[] }
  timeoutMs?: number
  execute: (args: Record<string, unknown>, exec?: unknown) => Promise<unknown>
}
```

`host.ts` 对三个工厂统一：

```ts
function registerMarketTools(ctx: Context, specs: MarketToolSpec[]): void {
  for (const tool of specs) {
    ctx.tools.register(defineTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      output: tool.output,
      presentCall: tool.presentCall,
      presentResult: tool.presentResult,
      timeoutMs: tool.timeoutMs ?? 20_000,
      async execute(args, exec) {
        return cloneJson(await tool.execute(args, exec))
      },
    } as never))
  }
}
```

### 3.1 `createPluginTools`

```ts
export interface PluginToolDeps {
  cfg: () => PluginConfig
  lock: <T>(fn: () => Promise<T>) => Promise<T>          // = withPluginInstallLock
  listPlugins: typeof listPlugins
  installMarketPlugin: typeof installMarketPlugin
  removeDshPlugin: (name: string) => Promise<string>     // dsh-cli 本轮新增
  readInstalled: () => Record<string, string>            // package.json dependencies
  isProtected: (name: string) => boolean                 // CORE ∪ Config.extra
}

export function createPluginTools(deps: PluginToolDeps): MarketToolSpec[]
```

| 工具 | 参数 | execute 要点 | 失败 |
|---|---|---|---|
| `plugin_search` | `query?`, `category?`, `scope?`（verified\|all，默认 verified）, `limit?` 1–8 默认 6, `offset?` | `listPlugins`；items 截断；`renderPluginSearch` 列出 `owner/name` 禁止模型编造 | 上游抛错，禁止 `{ok:false}` |
| `plugin_install` | `owner` required, `name` required | `parsePluginRef` → lock → `installMarketPlugin`；`installability` 非 verified 抛错；**不** `scheduleRestart` | plan 与仓库不一致 / `--force` / 非 pinned github：沿用 `resolveInstallSource` |
| `plugin_uninstall` | `name` required（profile 包名，如 `@scope/pkg` 或 `omnimux-workflow`） | trim → `isProtected` **硬拒** → 未安装抛错 → lock → `removeDshPlugin`；**不**重启 | 核心包 / 自身 / 未安装 |
| `plugin_list` | 无 | `readInstalled`；每项带 `protected: boolean`；模型文案禁止教用户卸核心包 | 读盘失败抛错 |

`plugin_install.timeoutMs` = `cfg.timeoutMs + 15 * 60 * 1000` 量级与 `INSTALL_TIMEOUT_MS` 对齐（待工程师核对 `dsh-cli.ts` 常量，不要另写一份超时）。

### 3.2 `createConnectorTools`

```ts
export interface ConnectorToolDeps {
  roots: () => { home: string; profileDir: string; packageRoot: string }
  loadCatalog: () => { items: Array<Record<string, unknown>> }
  listMarketplace: () => { items: Array<{ id: string; name: string; installable: boolean; sourceKind: string }> }
  installItem: typeof installItem
  removeMcpRow: typeof removeMcpRow
  findItem: typeof findItem
}

export function createConnectorTools(deps: ConnectorToolDeps): MarketToolSpec[]
```

| 工具 | 参数 | execute 要点 | 失败 |
|---|---|---|---|
| `connector_search` | `query?`, `limit?` 1–8 默认 6 | 默认 **bundled catalog** `kind=connector`。市场条目只读附带 `sourceKind=marketplace, installable=false`，文案写明「展示不可装」。禁止当专家推。 | catalog 读失败抛错 |
| `connector_install` | `id` required | `findItem` → 非 connector 抛错 → marketplace / `installable===false` 抛错 → `installItem`（`writeMcpRow`）→ 返回 `{ id, installed, restartRequired: true }` | 专家 id / 技能 id / 市场源 |
| `connector_uninstall` | `id` required | 仅 connector → `removeMcpRow`（幂等）→ `restartRequired: true` | 非连接器 |
| `connector_list` | 无 | catalog 中 `installed===true` 的 connector；可附带「市场源均不可装」计数 | — |

`plaza_install` **保留**（已拒绝 expert/team）。新 `connector_install` 是 Agent 主路径；`plaza_install` description 改为「内部/兼容，Agent 装连接器请用 connector_install」。不要删，避免旧会话 prompt 缓存打空。

### 3.3 已有工厂（不改行为，只接线）

```ts
export function createPlazaTools(
  roots: () => PlazaRoots,
  loadCatalog: () => CatalogDoc,
): MarketToolSpec[]  // 现网已返回等价结构，本轮补类型、不改 execute
```

---

## 4. 防御性安全边界（硬拦截）

全部在工厂 `execute` **入口**拦截，不依赖模型自觉。失败 `throw new Error(...)`，与广场规格一致：禁止 `{ ok:false }` 当成功。

### 4.1 `plugin_uninstall` 核心包黑名单

```ts
/** 不可卸。与 hub `plugins/omnimux/src/plugins/manage.js` PROTECTED_BUNDLES 对齐，并加上市场自身。 */
export const CORE_PROTECTED_BUNDLES = Object.freeze([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  'omnimux',
  'omnimux-market',
])

export function isProtectedBundle(name: string, extra: readonly string[] = []): boolean {
  const n = String(name || '').trim()
  if (!n) return true
  if (CORE_PROTECTED_BUNDLES.includes(n)) return true
  if (extra.includes(n)) return true
  // 别名：裸名 dsh-base / dsh-web-app
  const bare = n.includes('/') ? n.slice(n.lastIndexOf('/') + 1) : n
  if (bare === 'dsh-base' || bare === 'dsh-web-app') return true
  return false
}
```

- Config 只能 **追加** `protectedBundlesExtra`，不能删核心四项。
- `name` 必须是 profile `package.json` 依赖键，拒绝 `github:` / `file:` / `link:` / 路径。复用 hub 精神，但 **不要** import `assertNpmSpec`（那是 Settings 安装通道）。本包自写 `isSafePluginName`：`/^(@[A-Za-z0-9-~][A-Za-z0-9-._~]*\/)?[A-Za-z0-9-~][A-Za-z0-9-._~]*$/`。
- 错误文案固定：`"${name} cannot be removed"`（与 hub `assertRemovable` 同句式，便于测）。

### 4.2 安装并发锁

已有 `withPluginInstallLock`（promise chain + `installBusy`）。本轮：

- `plugin_install` / `plugin_uninstall` / HTTP `pluginInstall` **共用同一把锁**。
- 连接器 MCP 写盘另用 `withConnectorPatchLock`（新，同文件或 `expert/install.js` 导出）：防止 Agent 与侧栏同时改 `cordis.patch.yml`。
- 锁占用时：后到者排队，不抛 409（HTTP restart 仍 409）。工具侧排队即可。
- **禁止**工具调用 `scheduleRestart` / `pluginRestart`。Agent 不得杀桌面进程（`AGENTS.md` / 桌面隔离）。返回 `restartRequired: true` 让模型口头提醒用户。

### 4.3 参数校验（DSL 之外）

| 面 | 规则 |
|---|---|
| 插件 ref | `parsePluginRef`（已有 owner/name 正则） |
| 安装 plan | `resolveInstallSource`：拒 `--force`/`-f`、非 web plan、非 `github:owner/name#sha`、仓库不一致 |
| CLI 目标 | `isSafePluginTarget`（已有） |
| 插件卸载名 | `isSafePluginName` + 黑名单 + 必须已在 `readInstalledPlugins` |
| 连接器 id | 非空 trim；catalog 命中；`kind==='connector'` |
| 市场连接器 | `sourceKind==='marketplace'` 或 `installable===false` → 抛 `marketplace connectors are display-only` |
| 会话 id | 仅 `session-attach.ts`；插件工具不写 sessions/ |
| limit | plugin/connector clamp 1–8（比 skillhub 更狠，防刷屏） |

### 4.4 Prompt 防刷屏

新增段 `tool:plugins` order **211**、`tool:connectors` order **212**（紧挨 skillhub 210）。要点写死：

1. 用户没点名 DSH 插件 / 插件市场 / `dsh plugin` → **禁止** `plugin_*`。
2. 用户没点名 MCP / 连接器 → **禁止** `connector_*`。
3. 同一条用户消息：`plaza_search`、`skillhub_search`、`plugin_search`、`connector_search` **最多选一个**（领域路由：专家 / SkillHub 技能 / DSH 插件 / 连接器）。
4. 搜到后对用户 **最多一句**；禁止 markdown 清单、禁止打印 `dsh plugin add/remove`、禁止 curl。
5. `plugin_uninstall` 遇到 cannot be removed → 一句解释，不准换 bash 卸。
6. 安装/卸载成功只说结果 +「需要用户自行重启 Host」；Agent 不准声称已重启。
7. 连接器市场条目不可装 → 不道歉长文，建议侧栏或等下一刀。
8. 不把插件/连接器当专家 `plaza_summon`。

`host-render.ts` 对应 `renderPluginSearch` 等必须含「禁止复述给用户」「不要写长文」「不要打印安装命令」。

### 4.5 与广场规格的边界（不回退）

- 专家闭环（`plaza_*` + 落盘 + `ask_user_question`）行为不变。
- **不**主动推荐插件/连接器（广场 Non-Goal）。只在用户开口时搜。
- `plaza_search` 仍只返回 expert\|team。
- 不热切预设、不伪造用户消息。

---

## 5. 扩展点清单

| 挂载点 | 作用 | 清理方式 |
|---|---|---|
| `ctx.tools.register` × skillhub_*(4) + plaza_*(3) + plugin_*(4) + connector_*(4) | 模型可见工具 | Fiber 卸载自动 unregister |
| `systemPrompt.section` `plaza:attached-expert` order 8 | 每轮注入已挂专家 SKILL.md | 段随插件卸载消失 |
| `systemPrompt.section` `tool:plaza-experts` 209 | 未挂专家先搜 | 同上 |
| `systemPrompt.section` `tool:skillhub` 210 | 技能卡纪律 + 不双搜 | 同上 |
| `systemPrompt.section` `tool:plugins` 211 **新** | 插件工具纪律 / 黑名单 / 不重启 | 同上 |
| `systemPrompt.section` `tool:connectors` 212 **新** | 连接器纪律 / 重启提示 | 同上 |
| `webServer` `/omnimux-market` | 侧栏 HTTP；与工具共享领域函数 | 路由随 Fiber 撤 |
| `settings.register('omnimux-market')` | 可配置项卡片 | 命名空间随 Fiber 撤 |
| Client `slots.inject('tool.call.toolview')` skillhub_search / plaza_search / skillhub_list | 人可见卡；plaza 为 null | `slots.inject` 随 Fiber |
| Client `settings.plugin.item` `omnimux-market` | 配置卡 | 同上 |
| Client `sidebar.footer.action` | 广场入口（现网） | 同上 |
| `ctx.effect` CSS / locale | 仅手动资源 | disposer |
| **不挂** `ctx.jobs` / `ctx.commands` / hub Service / `scheduleRestart` | — | — |

---

## 6. Config 字段表

现网保留；**只追加**与本轮相关字段。核心黑名单不进可删配置。

| 字段 | 类型 | 默认 | 约束 | 用途 |
|---|---|---|---|---|
| `apiBase` | string | `https://api.skillhub.cn` | URL | SkillHub / 插件目录 |
| `webBase` | string | `https://skillhub.cn` | URL | 主页链接 |
| `skillsDir` | string | `$DSH_HOME/skills` | 非空 | 技能安装根 |
| `timeoutMs` | number | 20000 | 3000–120000 | 上游 HTTP |
| `userAgent` | string | skillhub UA | 非空 | HTTP |
| `maxResults` | number | 12 | 1–80 | **仅** skillhub_search |
| `sortBy` | union | `score` | 枚举 | skillhub |
| `plazaKeepAlive` | boolean | true | — | 侧栏保活 |
| `plazaCacheTtlSec` | number | 90 | 15–600 | JSON memo |
| **`pluginMaxResults`** | number | 6 | 1–8 | plugin_search 上限 |
| **`connectorMaxResults`** | number | 6 | 1–8 | connector_search 上限 |
| **`protectedBundlesExtra`** | string[] | `[]` | 每项 npm 名 | 追加不可卸包；**不能**覆盖 CORE 四项 |

坏配置：Schemastery 加载期失败。不要在 execute 里默默改默认值以外的非法枚举（scope/sort 已有 sanitize；工具参数非法 → throw）。

---

## 7. 任务清单（林深 Step 1–N）

依赖顺序。每步有可验证完成标准。官方 `packages/` 只读。

| 序号 | 任务 | 依赖 | 验证标准 |
|---|---|---|---|
| 1 | `dsh-cli.ts` 增加 `removeDshPlugin(name)`：校验 `isSafePluginTarget` / `isSafePluginName`，`runDshPlugin(WEB_PROFILE, ['remove', name])`，复用 pnpm 错误改写。不在此做黑名单。 | 无 | `dsh-cli.test.ts`：安全名通过；`github:` / 路径 / 空格拒绝；runner 收到 `remove` 而非 `add`。 |
| 2 | `plugin-market.ts` 导出 `CORE_PROTECTED_BUNDLES` + `isProtectedBundle`；`withPluginInstallLock` 注释写明 install/uninstall 共用。 | 无 | 单测：四核心 + `omnimux-market` + `dsh-base` 别名拦截；`dsh-better-sidebar` 放行；extra 追加生效。与 hub 列表交叉注释，**不** import hub。 |
| 3 | `host-render.ts` 增加 `renderPluginSearch/Install/Uninstall/List`、`renderConnectorSearch/Install/Uninstall/List`。每条含防刷屏句。 | 无 | `host.test.ts`：空结果短句；成功文案无 `dsh plugin` / curl；卸载核心包文案不含「请用 bash」。 |
| 4 | 新建 `plugin-tools.ts`：`createPluginTools` 四工具。install/uninstall 走 lock。uninstall 先黑名单。不调用 restart。 | 1, 2, 3 | `plugin-tools.test.ts`：search clamp 8；install 走 deps 且 lock 串行；uninstall 核心抛 `cannot be removed` 且 **不**调 remove；未安装抛错；失败无 `{ok:false}`。 |
| 5 | 新建 `connector-tools.ts`：四工具。`installItem`/`removeMcpRow` 复用。marketplace 硬拒。专家/技能 id 拒。返回 `restartRequired: true`。 | 3 | `connector-tools.test.ts`：catalog connector 可装；marketplace id 抛 display-only；`plaza_summon` 式专家 id 抛 not a connector；uninstall 幂等；MCP 行只出现在托管段（可 spy installItem）。 |
| 6 | `expert/install.js` 或 connector 工厂内加 `withConnectorPatchLock`（内存 promise chain）。HTTP `catalogInstall`/`catalogUninstall` 同锁。 | 5 | 并发两次 install 不同 id，最终 patch 两行都在且无交错损坏（可参考现网 `install.test.js` 字节还原）。 |
| 7 | `host.ts`：`registerMarketTools` 接入 plugin/connector 工厂；`Config` 加三字段；prompt 211/212。skillhub_* / plaza_* 行为不变。`plaza_install` description 加「Agent 用 connector_install」。 | 4, 5 | `host.test.ts` 扩：prompt 含 `plugin_search`/`connector_search`、`cannot be removed`、`restart` 由用户执行。`plaza-tools.test.ts` 全绿。 |
| 8 | `dsh.manifest.json` 登记 8 个新工具（search 只读，install/uninstall 写）。`storageDomains` 可补 `$DSH_HOME/omnimux-market/sessions/`（已有落盘，顺手对齐，不改路径）。 | 7 | `node scripts/registry-tool.mjs verify` 通过；`query plugin` / `query connector` 能命中 `omnimux-market`。 |
| 9 | `omnimux-analytics` `DEFAULT_PLUGIN_MAP` 加 `plugin_`、`connector_` → `omnimux-market`。 | 7 | `mapper.test.js`：`plugin_uninstall` / `connector_install` 映射 market；`esc_*` 仍 other。 |
| 10 | 类型：`MarketToolSpec` 进 `types.ts`；`plaza-tools` 返回类型标上（不改逻辑）。`pnpm typecheck`。 | 4, 5, 7 | `plugins/omnimux-market` `npm run typecheck` 0。 |
| 11 | 包测：`cd plugins/omnimux-market && npm test`。 | 1–10 | 全绿。覆盖：黑名单、锁串行、marketplace 拒、prompt 段存在、render 无 CLI。 |
| 12 | **不**改 Client toolview；**不**把 `omnimux-market` 同步名单本轮当主路径（广场规格 Q8 已另列）。若改 Config schema，提醒：契约变了需重启 Host 再硬刷新。 | 7 | `apply.js` diff 不含新 toolview key。 |
| 13 | 手工/L2 Web（林深或 QA）：用户说「找个 PDF 技能」仍 skillhub；「写 PRD」仍 plaza 选项卡；「装一个 sidebar 插件」才 `plugin_search`；对 `omnimux` / `dsh-base` 调 `plugin_uninstall` 失败且 Host 仍在。 | 11 | 合成 5 条：技能/专家/插件/连接器/闲聊互不串台；核心包卸载失败。Agent **不得**重启 Desktop。 |

**明确不做（本轮）：** `ctx.jobs` 包装安装、连接器市场真安装、`plaza_detach`、跨源 `market_search`、热切预设、改 hub、改官方 composer。

**待工程师现场核对源码（不要凭本文写死）：**

1. `dsh-cli.ts` 的 `WEB_PROFILE='web'` vs `expert/paths.js` 的 `omnimux` profile —— 插件工具必须跟 **现网 HTTP `pluginInstall` 同一 profile**，连接器必须跟 **`catalogInstall` 同一 `profileDir()`**。不要「统一成一个」除非现网已经统一。
2. `defineTool` 的 `as never` 现网写法是否仍是 rc.6 类型洞；能消则消。
3. `INSTALL_TIMEOUT_MS` 与 `plugin_install.timeoutMs` 对齐。
4. analytics `resolvePlugin` 最长前缀：`plugin_` 不会误伤其它名前缀。

---

## 8. 给林深的落地顺序（一句话）

先锁与黑名单（Step 1–2）→ render 文案（3）→ 两个无 Context 工厂 + 单测（4–6）→ host 接线 + Config + prompt（7）→ manifest / analytics / typecheck / npm test（8–11）→ 禁止碰 Desktop 重启的 L2 互不串台验收（13）。
