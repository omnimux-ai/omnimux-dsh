---
title: "社媒账号头像本地持久化（Phase 2）"
id: "spec-omnimux-account-avatars"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-08-20"
authors: ["x", "agent-architect"]
subsystem: "omnimux-accounts"
---

# 社媒账号头像本地持久化（Phase 2）

> **流程部分 SUPERSEDED — 2026-09-09 / #864：** 下文 L2 Web 验收流程退役；产品约束不变，账号操作仍须相应授权。现行 [plugin-qa](../contracts/plugin-qa.md) 要求合入前 worktree 自动化/静态与独立评审，经 required CI/MQ 合入后按需 Dev 45120/ego 验收。历史结果不重标。

挂载点 = Host HTTP `prefix:/omnimux/accounts`（新增 `GET /{id}/avatar` 字节路由 + GET 列表改写）+ 现有 Client Slot `shell.overlay`（只改 `Avatar`），形态 = 函数插件（hub mixed `omnimux` + 垂直 `omnimux-accounts`），产物 = dsh.bundle。

否决备选：Client IndexedDB/localStorage 二号缓存；把 data URI 塞进 `accounts.json`；灵感库式纯实时代理不落盘；垂直插件自建 Host 存储；复用 `/omnimux/avatar` blobatar；列表 JSON 内嵌 base64。

## 架构图（文字版层级）

```
Browser  omnimux-accounts  (Client Slot shell.overlay)
  AccountsStage → AccountCard / AccountTable
    Avatar
      <img referrerPolicy="no-referrer"
           src={account.avatar_url}     ← 同源 /omnimux/accounts/{id}/avatar
           onError → 字母占位>
      禁止：IndexedDB / localStorage / 自建 blob 持久化

same-origin fetch / <img>
        │
        ▼
Hub Host  plugins/omnimux          ← 唯一落盘与出网点
  webServer.register prefix /omnimux/accounts
    GET  /omnimux/accounts
      listAccounts(site)
      pickAccount + mergeMeta + computeStatus
      avatarStore.hit? 改写 avatar_url → /omnimux/accounts/{id}/avatar
      miss? 保留 https 原 URL，异步 putFromUrl（不阻塞列表）
      prune meta + prune avatars
    GET  /omnimux/accounts/{id}/avatar
      identity.require → 读本地 raster 字节
      Cache-Control: private, max-age=86400
      X-Content-Type-Options: nosniff
    DELETE /omnimux/accounts/{id}
      disconnect site + metaStore.remove + avatarStore.remove
    PATCH  不变（group / agent_usable）

Deep module  official/account-avatar.js
  $DSH_HOME/omnimux/accounts/avatars/
    index.json                 0700 目录 / 0600 文件
    {sha256(id)}.{png|jpg|webp|gif}
  putFromUrl: https-only + SSRF deny + ≤maxBytes + magic-bytes
              禁 SVG / xml；失败静默，列表不报错

Disk overlay（已有，不动语义）
  $DSH_HOME/omnimux/accounts.json   group / agent_usable / last_used_at

OmniMux cloud
  GET /api/social/v1/accounts   只在 Host 拉一次头像 URL
  浏览器永不直连社媒 CDN（缓存命中后）
```

### 生命周期时序

```
Connect
  Client POST /omnimux/accounts {platform}
  Host → site OAuth auth_url
  （头像尚未存在；不在 POST 里抓图）

Fetch / Cache（OAuth 回来后的每一次 GET 列表）
  Client GET /omnimux/accounts
  Host listAccounts
  对每个 https avatar_url：
    hit  + source_url 未变 → ViewRow.avatar_url = /omnimux/accounts/{id}/avatar
    miss 或 source_url 变  → ViewRow 暂留 https；enqueue putFromUrl(id, url)
  putFromUrl 成功 → 下次 GET 改写为同源

Render
  <img src=同源路由 referrerPolicy=no-referrer>
  同源 200 → 显示 raster
  同源 401/404 或仍是 https 且 CDN 403 → onError 字母占位（不抛、不闪退）

Disconnect / Cleanup
  Client DELETE /omnimux/accounts/{id}
  Host disconnect + meta.remove + avatar.remove（index + 文件）
  GET 列表 prune：站点不再返回的 id，同步删 overlay 与头像文件
```

## 扩展点清单

| 挂载点 | 作用 | 清理方式 |
|---|---|---|
| `ctx.inject(['webServer'])` → 现有 `registerOfficialRoutes`（`kind: 'prefix'`, `/omnimux/accounts`） | 列表改写 + 新增 `GET /{id}/avatar` 字节；DELETE/GET prune 删文件 | `ctx.effect` 已包 `omnimux: http routes`；卸载调用现有 `stopOfficial()` |
| 新模块 `official/account-avatar.js`（Host 深模块，非 Cordis Service） | 目录/index/抓取/魔数/SSRF；接口 `has/read/putFromUrl/remove/prune` | 进程内无 watcher；卸载不删用户盘（与 `accounts.json` 同类用户数据） |
| `createOfficialDispatcher({ avatarStore, official.accountAvatars })` | 把存储与 Config 注入 HTTP，测试可 fake | dispatcher 随路由 dispose |
| Client Slot `shell.overlay` / `id=omnimux-accounts-stage`（已有） | 只改 `chips.jsx` `Avatar`：`referrerPolicy` + 失败降级 | Slot 卸载随垂直插件；无新增 listener |
| **不挂** `ctx.tools` | `omnimux_accounts_list` 保持上游 JSON，不改写同源 URL（合同：工具面不走 Host rewrite） | — |
| **不挂** `ctx.jobs` | 缓存填充是 Host 内 fire-and-forget，不是会话后台任务 | 每 id 单飞、并发上限；插件卸载后 in-flight fetch 丢弃结果即可 |
| **不挂** 新 Service / Remote / Settings | 浏览器只打已有 `/omnimux/accounts`；无新 namespace | — |
| **不改** `/omnimux/avatar` | 那是登录用户 blobatar，与社媒账号不是同一份文档 | — |

### 归属映射（排除过程）

| 候选 | 结论 |
|---|---|
| `ctx.tools` | 否。头像不是模型可见输入；工具面继续返回站点 JSON。 |
| `ctx.commands` | 否。无用户斜杠命令。 |
| `ctx.jobs` | 否。抓图不是会话可观察任务。 |
| 会话事件 waterfall | 否。不改 agent 循环。 |
| Service 三层 | 否。无跨插件消费方；垂直禁止 import hub internals。 |
| LLM 适配器 | 否。 |
| 新 Client Slot | 否。一级页 Slot 已在；只改 `Avatar` 子组件。 |
| 垂直 Host 自建路由 | 否。`hub.md`：Accounts HTTP 只在中枢；`omnimux-accounts` Host 保持 load marker。 |
| Client 持久化（IDB / localStorage / blob） | 否。不能保证 0700/0600、跨 Web/Desktop profile、DELETE 同步；会与 Host 双源。 |
| 列表内嵌 data URI | 否。撑爆 JSON、触发 `sendJson` 的 `sk-` 误伤（profile avatar 已为此单开 `sendAvatarJson`）。 |
| 灵感库式纯代理不落盘 | 否。只解 Referer，不解签名过期与离线。缓存未命中时允许 Host 出网一次，但字节必须落盘。 |

## Config 字段表

挂在中枢 `omnimux` 的 `official` 上（`parseOfficialConfig`），坏值加载失败。垂直包无 Config。

| 字段 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `official.mount` | boolean | `true` | 已有 | `false` 时整段 accounts HTTP 404，头像路由一并消失 |
| `official.accountAvatars.enabled` | boolean | `true` | — | `false`：不抓、不改写、不提供字节路由（ViewRow 仍可带 https URL） |
| `official.accountAvatars.maxBytes` | number | `204800` | 正整数，`1…1048576` | 单文件上限；超限不写盘 |
| `official.accountAvatars.fetchTimeoutMs` | number | `8000` | 正整数，`500…60000` | Host 出网超时 |
| `official.accountAvatars.concurrency` | number | `4` | 正整数，`1…16` | GET 列表触发的并发抓取上限 |

未知键丢弃；`maxBytes` 非数字 / 越界 → `parseOfficialConfig` throw → Standard Schema `issues`。

## 存储与接口契约

### 磁盘

```
$DSH_HOME/omnimux/accounts.json                 # 已有 overlay，不塞 blob
$DSH_HOME/omnimux/accounts/avatars/             # 0700
  index.json                                    # 0600，整文档重写
  {sha256(utf8(id))}.png|jpg|webp|gif           # 0600
```

`index.json`：

```json
{
  "acc-1": {
    "file": "ab12….png",
    "content_type": "image/png",
    "bytes": 12345,
    "source_url": "https://cdn.tiktok.com/…",
    "fetched_at": "2026-08-25T12:00:00.000Z"
  }
}
```

- 文件名只用 `sha256(id)+ext`，禁止把原始 id 拼进路径（防 `../`、`/`）。
- 缺文件或坏 JSON 视为空库（与 `account-meta` 一致）。
- `source_url` 变化才重抓；URL 不变即使 CDN 已 403 也继续用本地字节。
- 无 TTL。断开 / prune 才删。

### ViewRow（`pickAccount` 放宽）

现有：仅 `^https://` 的 `avatar_url`。

改为接受其一：

1. `https://…`（缓存未命中，或 `accountAvatars.enabled=false`）
2. 相对路径 `/omnimux/accounts/{encodeURIComponent(id)}/avatar`，且路径中的 id **必须等于本行 `id`**（禁止改写成别人的头像）

仍拒绝：`http://`、`data:`、`blob:`、`file:`、任意 host 的绝对同源 URL（只允许相对路径，避免把 `http://evil/omnimux/accounts/x/avatar` 放行）。

`GET /omnimux/accounts` 在 `pickAccountsView` 之后、过滤之前做改写，这样 `?platform=` 不影响缓存填充。

### HTTP

| 方法路径 | 行为 | 成功 | 失败 |
|---|---|---|---|
| `GET /omnimux/accounts` | 列表 + 命中改写 + 异步填充 + prune | `{accounts: ViewRow[]}` | 401 / 502（现有） |
| `GET /omnimux/accounts/{id}/avatar` | 读本地字节；**不**回源 CDN | `200` + raster + `nosniff` | 401 未登录；404 无缓存；405 非 GET；`official.mount=false` → 404 |
| `DELETE /omnimux/accounts/{id}` | 站点断开 + `meta.remove` + `avatar.remove` | `{ok:true}` | 现有 |
| PATCH / POST | 不变 | — | — |

`registerOfficialRoutes` 必须仿 `inspiration-http`：pathname 以 `/avatar` 结尾时走字节 handler，**禁止** `sendJson`（否则把 PNG 当 JSON，且 `sk-` 扫描会误伤）。

GET 头像 **不要** `assertLocalWrite`（`<img>` 子资源没有自定义 Origin 语义，与列表 GET 同级）。仍要 `identity.require`，未登录 401。

响应头：`Content-Type` 来自 index（仅 `image/jpeg|png|webp|gif`）；`Cache-Control: private, max-age=86400`；`X-Content-Type-Options: nosniff`。

### `putFromUrl` 纪律

1. `enabled===false` → skipped
2. URL 必须 `https:`；hostname 拒绝 localhost / `*.local` / 私网 IPv4 / 链路本地 / ULA / `169.254.169.254` / 字面 IPv6 私址。重定向后**每一跳**再检（待工程师现场核对 `fetch` redirect 是否可拦截；若 Node 自动跟随且无法逐跳，则 `redirect:'error'` 只接受 200）。
3. `AbortSignal` 超时 `fetchTimeoutMs`。
4. 先看 `Content-Length`，超过 `maxBytes` 不读 body。
5. 读满后 `Buffer.byteLength` 再检。
6. 魔数：JPEG `FF D8 FF` / PNG `89 50 4E 47` / GIF `47 49 46 38` / WEBP `RIFF….WEBP`。`image/svg`、`text/xml`、body 以 `<svg` / `<?xml` 起 → 拒。
7. 失败不写盘、不抛到 GET 列表。

### Host / Client 分工

| 侧 | 做 | 不做 |
|---|---|---|
| Host `omnimux` | 出网、落盘、改写 URL、字节路由、DELETE/prune 清理、Config、SSRF | 改垂直 UI；把 blob 放进 `accounts.json` |
| Client `omnimux-accounts` | `referrerPolicy="no-referrer"`；`onError` 字母；继续 `fetch('/omnimux/accounts')` | 自建缓存；直连 CDN 以外的第二条持久化；Host 内部模块 import |

`omnimux-accounts` Host `apply()` 保持空 load marker。

## 测试策略

### Host

| 文件 | 覆盖 |
|---|---|
| `official/account-avatar.test.js` **新建** | 空库；put 合法 PNG/JPEG/WebP/GIF 写 0600/0700；拒 SVG/xml/超限/http/私网；source_url 变才重抓；`remove`/`prune` 删文件+index；坏 JSON 当空 |
| `official/public-account.test.js` | 相对同源路径放行且 id 必须匹配；`http://` 仍丢；`data:` 丢；改写后的 ViewRow 不含 `https` |
| `official/http-routes.test.js` | GET 列表命中改写；未命中保留 https 且触发 fake `putFromUrl`；GET avatar 返回字节而非 JSON；未登录 401；DELETE 调 `avatar.remove`；`enabled:false` 不改写不抓；路径 `../` / 非 GET 405 |
| `config.test.js` | 默认 `accountAvatars`；越界 `maxBytes` 进 `issues` |
| **不改** `avatar/*.test.js` | 用户资料脸与本需求无关 |

### Client

| 文件 | 覆盖 |
|---|---|
| `omnimux-accounts/src/client/styles.test.js`（或新建 `chips.test.js`） | 源码冻结：`<img` 含 `referrerPolicy="no-referrer"`；`onError` 仍切 fallback；无 `indexedDB`/`localStorage` 头像键 |
| `view.test.js` | 无需改行为；ViewRow 注释补相对 `avatar_url` |
| `api.test.js` | 不新增头像 API（仍走列表） |

### 集成 / 验收（工程师自测，不强制浏览器自动化）

```
pnpm test          # omnimux + omnimux-accounts
```

物化：`node scripts/omnimux.mjs sync omnimux omnimux-accounts`（零进程副作用）。L2 Web 刷新后：连接账号 → 列表第二次拉取头像走 `/omnimux/accounts/{id}/avatar` → 断网仍显示 → 断开后 `avatars/` 无该 id。

## 任务清单（给林深）

| 序号 | 任务 | 依赖 | 验证标准 |
|---|---|---|---|
| 1 | 扩 `parseOfficialConfig`：`accountAvatars.{enabled,maxBytes,fetchTimeoutMs,concurrency}`；更新 `config.test.js` | — | 空配置带默认；`maxBytes: 0` / `'200k'` → Config `issues` |
| 2 | 新建深模块 `plugins/omnimux/src/official/account-avatar.js` + `account-avatar.test.js`：路径、index、魔数、SSRF、`putFromUrl`/`read`/`remove`/`prune`；fs 可注入 | 1（读 maxBytes） | 单测全绿；目录 0700、文件 0600；SVG/超限/http 不落盘 |
| 3 | `pickAccount` 放行匹配 id 的相对 `/omnimux/accounts/{id}/avatar`；`public-account.test.js` 补正反例 | — | https 仍过；http/data 仍丢；id 不匹配的相对路径丢 |
| 4 | `http-routes.js`：注入 `avatarStore`；GET 列表改写+异步填充+prune avatars；DELETE 调 `remove`；`registerOfficialRoutes` 对 `/avatar` 走字节（对照 `inspiration-http.js` 的 media 分支，勿 `sendJson`） | 2, 3 | `http-routes.test.js`：改写、字节 200、DELETE 清理、401、enabled=false |
| 5 | `host/apply.js` + `host/http.js`：`createAccountAvatarStore({ home, config })` 传入 dispatcher | 2, 4 | 现有 `host/apply.test.js` 仍过；无 store 时 dispatcher 退化为 no-op（与 `emptyMetaStore` 同模式） |
| 6 | `docs/contracts/hub.md` Accounts HTTP 表：补 GET avatar、磁盘路径、ViewRow 相对 URL、工具面不改写 | 4 | 与实现一字不差 |
| 7 | `omnimux-accounts` `chips.jsx`：`referrerPolicy="no-referrer"`；失败仍字母；**不要** Client 持久化 | — | 源码冻结测试通过；`AccountCard`/`AccountTable` 无需改 props |
| 8 | `view.js` 注释：`avatar_url` 可为同源相对路径；必要时 `styles.test.js` 断言 `.omnimux-accounts-avatar` 仍 40×40 | 7 | 单测绿 |
| 9 | 跑 `plugins/omnimux` 与 `plugins/omnimux-accounts` 的 `pnpm test`；再 `node scripts/omnimux.mjs sync omnimux omnimux-accounts` | 1–8 | 全绿；sync 无进程动作。L2 Web 人工：二次列表同源、断网仍图、断开删文件 |

### 实现要点（林深直接抄）

**路径解析**（与现有 PATCH 同一套 `decodeURIComponent`，避免把 `{id}/avatar` 当成 PATCH id）：

```js
const PREFIX = '/omnimux/accounts/'
function avatarIdFromPath(pathname) {
  if (!pathname.startsWith(PREFIX) || !pathname.endsWith('/avatar')) return ''
  const raw = pathname.slice(PREFIX.length, -'/avatar'.length)
  if (!raw || raw.includes('/')) return ''
  try { return decodeURIComponent(raw) } catch { return '' }
}
```

`raw.includes('/')`：id 里的斜杠必须已是 `%2F`（Client 已 `encodeURIComponent`）。Node `URL.pathname` 对 `%2F` 是否预解码：**待工程师现场核对源码**；若已解码，改用 `req.url` 的 raw path。

**列表改写**（伪代码）：

```js
if (avatarCfg.enabled) {
  for (const row of view.accounts) {
    const id = String(row.id)
    if (avatarStore.has(id)) {
      row.avatar_url = `/omnimux/accounts/${encodeURIComponent(id)}/avatar`
    } else if (typeof row.avatar_url === 'string') {
      enqueueFill(id, row.avatar_url) // 并发 semaphore = concurrency
    }
  }
  avatarStore.prune(view.accounts.map((r) => String(r.id)))
}
```

**Avatar 组件**（最小 diff）：

```jsx
<img
  className="omnimux-accounts-avatar"
  src={url}
  alt=""
  loading="lazy"
  referrerPolicy="no-referrer"
  onError={() => { setFailed(true) }}
/>
```

### 明确不做

- 不改官方 `packages/`、不新插件目录、不新 Slot、不新 tool。
- 不把头像写入 `accounts.json` META_KEYS。
- 不在 GET 列表里同步等待全部 CDN（首屏超时）。
- 不 302 到 CDN。
- 不 kill/restart Desktop；验证走 L2 Web + `sync`。

### 风险

| 风险 | 处理 |
|---|---|
| `sendJson` 误伤字节 | 路由分支；单测断言 `content-type` 为 image/* 且 body 非 `{` |
| Node URL 预解码 `%2F` | 现场核对；测试夹带 `id = 'a/b'` |
| SSRF 重定向 | 优先 `redirect:'error'`；不能逐跳则不跟随 |
| 首屏仍可能字母 | 可接受；第二次 GET / 刷新后同源。不要为了首屏阻塞列表 |
| 与 profile `/omnimux/avatar` 搞混 | 路径、store、测试三分离 |
