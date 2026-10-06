---
title: "本机 CLI 登录态检测与版本更新"
id: "spec-cli-auth-update"
type: "spec"
status: "active"
authority: "L2"
date: "2026-10-05"
issue: 3178
subsystem: "omnimux"
---

# 本机 CLI 登录态检测与版本更新（Issue #3178）

设置面板「本机 CLI」当前只跑 `<bin> --version`，只知道「装没装」。本规格定义登录态、登录动作、版本检测与更新动作的接口契约与验收标准。

## 1. 新用户基线（产品基线，先读这一节）

新用户机器上**确定不存在**任何本机 Agent CLI。因此：

| 状态 | 面板表现 | 网络/进程行为 |
| --- | --- | --- |
| 未安装 | 沿用现有「未检测到程序安装」文案；**无**登录按钮、**无**更新按钮 | 不探测登录态、不查 registry |
| 已安装 · 登录态未知 | 不显示登录按钮 | 探测失败时不重试、不猜 |
| 已安装 · 已登录 | 不显示登录按钮 | — |
| 已安装 · 未登录 · 该 CLI 无账号登录入口 | 显示「未登录」提示文案，**无**按钮 | — |
| 已安装 · 未登录 · 有账号登录入口 | 显示「登录」按钮 | 点击后才打开终端 |
| 版本检查不可用（离线/超时/形态未知） | **无**更新按钮、**不显示**「已是最新」 | — |

任何「检查不可用」都不得渲染成「已是最新」或「未登录」；任何形态不明的安装都不得执行升级。

## 2. CLI 能力表（服务端常量，唯一真源）

`plugins/omnimux/src/agents/local.js` 的 `KNOWN_AGENTS` 每项新增两个可选字段：

```js
{
  id, name, bin, models,
  auth: {
    kind: 'command' | 'file',                     // 两者都没有 = 不判定
    command?: { bin: string, args: string[] },    // kind==='command'
    jsonFlag?: string,                            // 从 stdout 解析 JSON 时取该布尔字段
    paths?: string[],                             // kind==='file'：候选凭据文件（相对 home）
    tokenKeys?: string[],                         // 文件内必须非空的键（点号路径）
  } | null,
  login: { bin: string, args: string[] } | null,  // null = 该 CLI 无账号登录入口
  update: { channel: 'npm' | 'self' | 'none', npmPackage?: string, selfCommand?: { bin, args } },
}
```

取值（依据 `.agent-reports/cli-auth-update/research-login.md`、`research-update.md` 的实测结论）：

| id | auth | login | update |
| --- | --- | --- | --- |
| claude | command `claude auth status`，退出码 0/1，stdout JSON `loggedIn` | `claude auth login` | npm `@anthropic-ai/claude-code` |
| codex | command `codex login status`，**只看退出码** 0/1 | `codex login` | npm `@openai/codex` |
| kimi | file `~/.kimi-code/credentials/*.json`，键 `access_token` + `refresh_token` 非空 | `kimi login` | self `kimi upgrade` |
| qwen | file `~/.qwen/oauth_creds.json`，键 `access_token` 非空 | **null**（官方已停用 OAuth） | npm `@qwen-code/qwen-code` |

kimi 是原生分发、版本号与 npm 不同轨，**禁止**用 registry 比对 kimi 版本。

## 3. 接口契约

### 3.1 `GET /omnimux/agents`（扩展现有路由）

每个 agent 行新增 `auth`：

```jsonc
{
  "id": "claude", "name": "Claude Code", "installed": true,
  "version": "2.1.223 (Claude Code)", "models": ["..."],
  "auth": { "state": "signed-in|signed-out|unknown", "method": "command|file|none", "loginSupported": true }
}
```

- `installed === false` → `auth.state === 'unknown'`、`method === 'none'`。
- 命令探测：spawn 超时 5000ms；超时、spawn 失败、退出码既不是 0 也不是 1 → `unknown`；退出码 1 → `signed-out`。
- 文件探测：候选路径都不存在 → `signed-out`；存在但 JSON 解析失败 → `unknown`；解析成功但 `tokenKeys` 任一为空 → `signed-out`；全部非空 → `signed-in`。
- 任何分支都不得把 token 值写入响应、日志或错误消息。

### 3.2 `GET /omnimux/agents/updates`

```jsonc
{
  "checkedAt": 1760000000000,
  "updates": {
    "claude": {
      "state": "available|current|unknown", "current": "2.1.223", "latest": "2.1.289",
      "channel": "npm|self|none", "installShape": "npm|homebrew|native|unknown", "supported": true
    }
  }
}
```

- 只对 `installed === true` 的 agent 查询；未安装项 `state:'unknown'`、`supported:false`，**不发网络请求**。
- 网络：进程内 `fetch('https://registry.npmjs.org/<pkg>/latest', { signal: AbortSignal.timeout(5000) })`，只读 `dist-tags.latest`（回退 `version`）。失败/超时/非 200/解析失败 → `unknown`。禁止使用 `npm view`。
- 内存缓存 6 小时；`?refresh=1` 强制刷新。
- `supported` 判定：`channel==='npm' && installShape==='npm'`，或 `channel==='self' && installShape==='native'`；`homebrew`/`unknown` → `false`。
- 版本比较：自包含解析器（`/(\d+)\.(\d+)\.(\d+)/` 取三段，忽略前缀 `codex-cli `、后缀 ` (Claude Code)` 与 `+sha`），逐段数值比较；解析失败 → `unknown`。

### 3.3 `POST /omnimux/agents/login` `{ id }`

- 同源写保护；未知 id → 400 `{ok:false,error:'unknown-agent'}`；未安装 → 200 `{ok:false,error:'not-installed'}`；`login === null` → 200 `{ok:false,error:'login-unsupported'}`；非 macOS → 200 `{ok:false,error:'unsupported-platform'}`。
- 成功：在 macOS 打开一个真终端窗口执行该 CLI 的登录命令，返回 `{ ok:true, launched:true, mode:'terminal' }`。
- 终端脚本内容只由服务端常量表拼装（bin + args），**不接受任何请求体内容**。

### 3.4 `POST /omnimux/agents/update` `{ id }`

- 同源写保护；未知 id → 400；未安装 → 200 `{ok:false,error:'not-installed'}`；`supported === false` → 200 `{ok:false,error:'update-unsupported'}`；同 id 并发第二次 → 409 `{ok:false,error:'update-in-progress'}`。
- npm 形态：执行 `<prefix>/bin/npm install -g <pkg>@latest`，`<prefix>` 由解析出的二进制路径推导；`cwd = os.homedir()`；超时 180000ms；输出上限 1MB。
- self 形态：执行常量表里的 `selfCommand`。
- 成功 → `{ ok:true, version:'<重新探测到的版本串>' }`；失败 → 200 `{ ok:false, error:'update-failed', detail:'<脱敏后的尾部 ≤300 字符>' }`。
- 失败 detail 必须剥掉 `//.*:.*@` 形态的凭据与 `_authToken=...`、`npm_...token` 片段。

## 4. 客户端契约

`plugins/omnimux/src/client/RuntimeModeSection.jsx` 的 `AgentPanel` 卡片：

- 标题行：`已安装` 标记之后，未登录时追加状态标记（`runtime.cliNotLoggedIn`）；有新版时追加状态标记（`runtime.cliUpdateAvailable`）。
- 未登录且 `auth.loginSupported` → 在「测试」按钮旁显示「登录」按钮，点击调用 `/omnimux/agents/login`；返回 `launched:true` 后每 3 秒轮询 `/omnimux/agents`，最长 2 分钟，一旦该 agent `auth.state === 'signed-in'` 立即停止。
- 未登录且 `!auth.loginSupported` → 只显示一行说明文案（`runtime.cliNoLoginHint`），无按钮。
- `update.supported && update.state === 'available'` → 显示「更新」按钮；点击调用 `/omnimux/agents/update`，期间按钮文案变「更新中…」且禁用；成功后重新扫描并提示（`runtime.cliUpdateDone`）。
- 状态标记与按钮一律纯文本，**不得**使用 `✓ ↑ ⟳ ✅` 等字符图标（UI 指南 §1.2）。
- 登录态、版本态全部来自服务端响应；客户端**不得**维护任何黑名单或本地推断。

## 5. 验收标准

见 Issue #3178「验收标准」1–9 条，逐条对应本规格 §1–§4。

## 6. 非目标

- 不改 CLI 自身实现；不代写第三方工具配置（qwen 密钥不代写）。
- 不做 Windows/Linux 终端唤起。
- 不做后台 job / 进度流（沿用仓库同步阻塞 POST 先例）。
- 不动既有 `OBSOLETE_MODEL_IDS` 客户端过滤形态。
- 不发布生产。

## 7. 模块接口（冻结签名）

`plugins/omnimux/src/agents/auth.js`

```js
export async function probeAgentAuth(id, options = {})
// options: { run?, home?, fsImpl?, timeoutMs? }
// → { state: 'signed-in'|'signed-out'|'unknown', method: 'command'|'file'|'none' }

export async function launchAgentLogin(id, options = {})
// options: { platform?, home?, run?, scriptDir? }
// → { ok:true, launched:true, mode:'terminal' } | { ok:false, error:'unknown-agent'|'login-unsupported'|'unsupported-platform'|'launch-failed' }
```

`plugins/omnimux/src/agents/updates.js`

```js
export function parseVersion(text)              // → { major, minor, patch } | null
export function isNewerVersion(latest, current) // → boolean（任一解析失败 → false）
export function detectInstallShape(binPath)     // → 'npm'|'homebrew'|'native'|'unknown'
export function npmPathForBin(binPath)          // → '<prefix>/bin/npm'（仅当路径含 /node_modules/）否则 null
export function createUpdateChecker(options = {})
// options: { fetchImpl?, now?, ttlMs?, cache? }
// → { check(agents, { refresh } = {}) : Promise<{ checkedAt, updates }> }
export async function runAgentUpdate(id, options = {})
// options: { shape, run?, home?, timeoutMs?, probeVersion? }
// → { ok:true, version } | { ok:false, error:'update-unsupported'|'update-failed', detail? }
```

`plugins/omnimux/src/agents/local.js`

```js
export function resolveBinPath(bin, options = {})  // options: { env?, fsImpl?, platform? } → 绝对路径 | ''
```

`plugins/omnimux/src/agents/http.js` 路由与注入面：

```js
registerAgentRoutes(webServer, deps)
// deps: { getSettings?, settings?, scan?, probe?, authProbe?, updateCheck?, login?, update? }
// 路由：GET /omnimux/agents · GET /omnimux/agents/updates · POST /omnimux/agents/login · POST /omnimux/agents/update
```

## 8. 文档影响

新增本规格；`research/omnimux/sources/official/` 无需改动（CLI 官方文档不是本仓权威源）；实现结论写入 PR 描述与 `docs/evidence/cli-auth-update/`。
