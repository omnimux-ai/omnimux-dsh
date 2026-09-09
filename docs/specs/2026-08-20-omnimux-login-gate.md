---
title: "OmniMux 统一登录门 — 架构设计"
id: "spec-omnimux-login-gate"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-08-20"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# OmniMux 统一登录门 — 架构设计

> **流程部分 SUPERSEDED — 2026-09-09 / #864：** 下文 L2 独立环境、源码 link 与合入前浏览器验收要求退役；登录安全和产品约束不变。当前流程见 [dev-pipeline](../contracts/dev-pipeline.md) 和 [plugin-qa](../contracts/plugin-qa.md)：worktree 自动化/静态与独立评审 → required CI/MQ → main → 按需 Dev 45120/ego 验收。历史结果不重标。

- 作者：高见远（架构师）
- 状态：Phase 2 设计（待工程实现 / QA 终审）
- 定界：登录/身份属 OmniMux 核心，全部改动落在 `plugins/omnimux`（dsh-omnimux 执行中枢）；垂直包只消费 seam，不实现登录；不新建兄弟包；桌面壳不参与。
- 产品决策（强制约束）：**不做启动门禁**。所有 OmniMux 插件/功能统一调用执行中枢的登录检查接口；点击任意 OmniMux 功能即检查登录，未登录触发统一登录流程（跳现有设备码授权页 `verification_url`），登录成功继续原意图（恢复中断动作）；检测按需（点击时），不每次联网强制 verify。认证页 = 现有设备码授权页。保留「未登录可逛货架/浏览」（US-2 不推翻，但点开 OmniMux 功能时都过门）。

---

## 0. 真源调查结论（决定 seam 形态）

### 0.1 客户端跨插件复用机制（问题 1 的答案）

**不用 Cordis `ctx.provide/ctx.get` 做跨 bundle 服务共享；用 window 全局 + 懒读取。**

证据链：
- 每个插件（hub + 每个垂直）各自用 esbuild 把 `src/client/index.js` 打成单一 `lib/client.js`（`scripts/build-client.mjs`），外面包一层 `window.__ModuleLoader__.load({ id, factory })`。hub 与 vertical 是两个**独立 bundle**，各自的 `factory(require)` 作用域互不可见，`react` 等通过 `external` 留给宿主，其余依赖全被各自打进包里。**因此跨 bundle 无法共享任意 Cordis 服务或模块函数，只有 DOM/window 是共同作用域。**
- hub 在模块顶层安装两个单例全局：`window.__omnimuxStage`（`src/client/stage.js`，`installStageGlobal()`）与 `window.__omnimuxSidebar`（`src/client/sidebar-coordinator.js`，`installSidebarGlobal()`）。垂直包通过**懒读取**消费，例如 `omnimux-accounts` 的 `createStageStore(() => window.__omnimuxStage)`（getter，延迟到真用 `claim/release/readBox` 时才取）、`registerWhenReady()`（`setInterval(500ms)` 轮询直到 hub 全局就绪后 `register()` **一次**）。
- `src/client/index.js` 注释与 `dsh-plugin-dev` skill 明确写死：**禁止在垂直插件里 `import` 非本包的客户端模块**；跨包客户端依赖不保证加载顺序，一律用 window 全局 + 懒读取。这正是当初「逐插件复制 observer 挂载骨架 → 无限级联死循环」的根因教训。

**结论：登录门 seam 必须复制 `__omnimuxStage` 模式**——hub 安装 `window.__omnimuxAuth` 全局（模块顶层，幂等），垂直包用 getter/`registerWhenReady` 懒读取，绝不 import hub client。

### 0.2 客户端登录门挂载点（问题 2 的答案）

现有挂载先例（都是 hub `client/index.js` `apply()` 里 `ctx.slots.inject(...)`）：
- `settings.section` → `ProfileSection`（「个人资料」，目前唯一 live 登录 UI）。
- `settings.plugins.tab` → `DshPluginsSection`。
- `shell.overlay`（被注释掉）→ `AppsStage`（id `omnimux-apps-stage`；`AppsStage.jsx` 是 `position: fixed` 面板，`open=false` 时返回 null）。
- 垂直 `omnimux-accounts` 也注册 `shell.overlay`（id `omnimux-accounts-stage`，order 21）挂 `AccountsStage`。

**结论：登录门不是 `data-dsh-product-stage` 的独立页，也不是 settings 座；它是一个全局瞬时模态，必须能压在任何页面之上（含浏览货架、其它 overlay 之上）。正确最简做法：hub 注册一个 `shell.overlay` 座 `omnimux-auth-gate`，其组件在「门未开」时返回 null，在「门开」时 `createPortal(document.body)` 渲染 fixed 蒙层模态（类似 `ProfileSection.jsx` 里 `AvatarModal` 用 `createPortal` + zIndex 1100 的先例）。shell.overlay 座之间按各组件自身 store 开合，互不抢 `data-dsh-product-stage`（AppsStage/AccountsStage 都这样，返回 null 时不动 stage），因此再挂一个 auth-gate 无冲突。**门永远由 hub 单点拥有**（对应「单协调器」教训），垂直只通过 `window.__omnimuxAuth` 触发。**

### 0.3 Host 侧 `needs-omnimux` 联动（问题 3 的答案）

现状：
- Host 侧工具层：`identity.require()` 与 `official/*` 工具 `execute` 抛 `OmnimuxError('needs-omnimux')`（`identity.js` / `official/mount.js` / `official/client.js`）。这只出现在 **agent/chat 会话**的工具结果里。
- HTTP 层：`official/http-routes.js` 把 `needs-omnimux` 映射为 `401 { error: error.message }`；`avatar/routes.js` 为 `401 { error: 'needs-omnimux', message: '…' }`。**两处 error 字段格式不一致**（一个填 message、一个填 code）。`src/client/api.js` 的 `authRequest` 目前**不识别**「needs login」，只剥白名单字段。
- 决策 `docs/decisions/2026-08-14-execution-hub.md` 第 95 行：**「dsh 不会替插件弹窗。提示只能是工具自己的结构化错误（比如 needs-omnimux / needs-provider）」**。

**结论：联动可行但只在「客户端发起的 HTTP 调用」这条路径上**，且需要新接线：
- 「客户端 HTTP 调用返回 401/needs-omnimux」（如 `/omnimux/accounts` POST connect、`/omnimux/*` 官方/头像路由）→ 客户端 api wrapper 捕捉 401/`error` 判为 need-auth → 调 `window.__omnimuxAuth.ensureLogin({ onSuccess: retryOriginal })`。
- 「agent 工具返回 needs-omnimux」→ **不联动、不自动弹窗**，保持现有结构化错误（遵守 2026-08-14 决策）。这是有意的边界，写进风险 D。
- 需要**新接线**：`api.js` 加一个归一化「need-auth」判定 + `authGuard(fn)` 包装器；同时**建议统一** `official/avatar` 两处 error 字段为 `{ error: 'needs-omnimux', message }`（否则客户端要同时认 status 401 和 error 两种值，属脆弱判断）。

### 0.4 恢复原意图（resume-after-login，问题 4 的答案）

现状 `useOmnimuxAuth` 只有 `{ state, beginLogin, signOut, openUrl }`；poll 成功时把 state 设为 `{phase:'ready', profile}`，**没有任何 resume 回调**。`ProfileSection` 的登录是「登录页即终点」，不恢复被中断的动作；`open-app-flow.js` 的 `attemptOpen` 返回 `{kind:'login'}` 后由调用方决定，也没有现成 resume。

**结论：登录门必须新增「待恢复意图」注册机制**：`ensureLogin({ reason, onSuccess, onCancel })` 在门开时把 `onSuccess`（一个捕获了原参数、可重放原动作的闭包）存进门的单例 store；poll 成功时 `LoginGate` 调 `resolveAll(profile)` 逐个执行已注册的 `onSuccess`。`onSuccess` 由调用方闭包实现「用缓存参数重发被中断的请求/重试动作」。这就是统一门相对现在 `ProfileSection` 的关键增量。

---

## A. Seam 定义（API 面）

### A.1 Host 侧：`identity`（已有，基本不用动）

现有 `ctx.provide('identity', { status, require })`（`src/index.js`）与 `createIdentity`（`src/auth/identity.js`）已满足门的主体逻辑：
- `status({ verify })` → `kind: unsigned|cached|verified|token_invalid|self_failed`，返回 public profile（永远不含 token）。
- `require()` → 未登录抛 `OmnimuxError('needs-omnimux', …)`。

**Host 侧几乎零新增。** 登录门是客户端驱动的（poll 成功后 token 已写入 Host store，`require()` 自然通过），Host 无需推送登录态。可选（非必须）：
- `src/auth/identity.js` 增加 `subscribe(fn)`（一个极简 EventEmitter，仅 `login`/`logout`/`token_invalid` 触发）。用途：未来跨 tab 同步或 Host 层 UI 联动；本设计**默认不依赖**。**若要加，须先确认「不做第三套登录」不冲突（它只是事件，不再造登录）**。我更建议本轮不加，保持 `identity` 接口稳定（`status/require` 已是契约）。

> 若坚持最小化：Host 侧 0 文件改动即可满足门。下列 Host 改动全部标注 OPTIONAL。

### A.2 Client 侧：统一登录门（hub 拥有）

新增 `src/client/auth-gate.js`（模块单例 store + 全局安装）：

```js
export const AUTH_GLOBAL_KEY = '__omnimuxAuth'   // 与 __omnimuxStage 同款

// 门状态机 phase: closed | checking | starting | waiting | denied | expired | error
// gating 单例 store: { phase, flow_id, user_code, verification_url, interval,
//                      reason, profile, intents: [{id, reason, onSuccess, onCancel}] }

export function installAuthGlobal(target = window) // 幂等，模块顶层调用一次
// 安装 window.__omnimuxAuth = {
//   getStatus,           // (verify) => api.getStatus，返回 {logged_in, profile}
//   ensureLogin,         // ({ reason?, onSuccess?, onCancel? }) => void
//   cancel,              // () => void  关当前门，所有 intents 走 onCancel
//   subscribe,           // (fn) => unsub   供 LoginGate 用 useSyncExternalStore 订阅
//   getSnapshot,         // () => state
// }
```

关键行为：
- `ensureLogin({ reason, onSuccess, onCancel })`：先 `getStatus(false)`（非 verify，按需不联网）。若 `logged_in` → **立即** `onSuccess(profile)`，不弹门（短路径）；否则把 `onSuccess/onCancel` 登记到一个 intent 进入队列，置 state `checking`→`starting`→`waiting`，并调 `beginLogin()`。已经开着的门直接入队，不重复开（**单门保证**）。
- `beginLogin()` 内部复用现有 `use-omnimux-auth` 的状态机（`startLogin` → `openAuthUrl(verification_url)` → `pollLogin` 轮询），成功时 `resolveAll(profile)`，再关 `closed`。
- `cancel()`：关当前门，所有 intents 走 `onCancel`；`denied/expired/error` 同 `resolveAll` 失败路径。

新增 `src/client/LoginGate.jsx`（React 门组件，ui）：

```jsx
export function LoginGate() {
  const state = useSyncExternalStore(subscribe, getSnapshot)
  if (state.phase === 'closed') return null            // 不占 stage，不抢 data-dsh-product-stage
  return createPortal(<Modal …/>, document.body)       // fixed inset:0 + 高 zIndex，压一切
}
// props 由 store 注入：reason, user_code, verification_url + 按钮 login/open/cancel
// 收尾：poll 成功 → onSuccess(profile)；denied/expired/error → 显示原因 + 重试/取消
```

挂载：`client/index.js` `apply()` 里 `ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name:'shell.overlay', id:'omnimux-auth-gate', order: 30, locale: NS, inject: () => ({}) }, LoginGate))`。门组件用 `createPortal` 渲染 fixed 蒙层（非 stage），故不会与 `data-dsh-product-stage` 互斥。

垂直包**最小 API**（只调 window 全局，绝不 import hub client）：

```js
const auth = window.__omnimuxAuth            // hub 已装，若未装由自身 registerWhenReady 轮询等
auth?.ensureLogin({
  reason: t('auth.gate.reason.generic'),     // 一句话说明「此功能需登录」
  onSuccess: (profile) => retry.action(profile),  // 缓存参数重发原动作
  onCancel:  () => {/* 放弃 */}
})
```

两类场景统一成同一入口：客户端按钮点击、客户端 HTTP 401 兜底。

### A.3 三类消费场景

| 场景 | 接线 |
|---|---|
| **客户端按钮/功能点击** | 点击处理里先 `window.__omnimuxAuth.ensureLogin({ reason, onSuccess })`，`onSuccess` 重放动作。若已登录直接短路径。 |
| **客户端 HTTP 调用返回 401/needs-omnimux** | `api.js` 新增 `authGuard(fn)`：包装任意 `/omnimux/*` 请求；返回 `{needsAuth:true}` 时调 `ensureLogin({ onSuccess: () => fn() })`。用于 accounts connect/disconnect、avatar、official 等。 |
| **打开需要身份的应用/功能** | 复用 `open-app-flow.js`：把 `needsIdentity(app)&&!isLoggedIn → {kind:'login'}` 改为调 `ensureLogin({ onSuccess: () => continueOpen(app) })`，成功后继续 `openApp(id)+waitForStageClaim`。 |

> `useOmnimuxAuth` 保留（`ProfileSection` 用）；门组件复用其内部状态机，二者共享 `api.js`，不重复造轮子。

---

## B. 文件级改动清单

### B.1 `plugins/omnimux` 新增（全部 hub 内）

| 文件 | 职责 |
|---|---|
| `src/client/auth-gate.js` | 单例门 store + `installAuthGlobal()` + `ensureLogin/cancel/subscribe/getSnapshot/getStatus`；模块顶层 `installAuthGlobal()`（与 `stage.js` 同款）。 |
| `src/client/LoginGate.jsx` | React 门模态：`useSyncExternalStore` 读 store，门开时 `createPortal(document.body)` 渲染蒙层；驱动 `beginLogin`/poll；`resolveAll(profile)`；reason 文案 + 设备码 + verification_url 打开 + 取消/重试。 |
| `src/client/auth-gate.test.js` | L1 单测（jsdom + `node --test`，沿用 `src/client/*.test.js` 风格）：ensureLogin 短路径（已登录直接 onSuccess）、单门保证、并发 intent 合并、poll 成功 resolveAll、cancel/denied/expired 走 onCancel、window 全局幂等安装。 |
| `src/client/login-guard.test.js`（可并入上者） | `authGuard` 包装器单测：401→needsAuth→ensureLogin；2xx 直通。 |

### B.2 `plugins/omnimux` 修改

| 文件 | 改动点 |
|---|---|
| `src/client/index.js` | 顶部 import + 调 `installAuthGlobal()`；`apply()` 里注册 `shell.overlay` 座 `omnimux-auth-gate` → `<LoginGate/>`（order 30）。**不动**被注释的 apps 三挂载。 |
| `src/client/api.js` | 新增 `NEEDS_AUTH_CODE='needs-omnimux'`、`pickAuthError`（从 status/body 判 need-auth）、`authGuard(fn)`、`getStatusCached()`（非 verify 快捷）。**保留**所有既有导出。 |
| `src/client/use-omnimux-auth.js` | 轻重构：抽出可复用的登录流程（start→poll→success 回调），暴露一个 `runLogin(onSuccess)` 给门调用；保持 `useOmnimuxAuth` 返回签名不变（ProfileSection 不破）。 |
| `src/client/ProfileSection.jsx` | 让「个人资料」登录复用门（改调 `ensureLogin`/gate），去掉与门重复的 bespoke 登录 UI（或保留但入口收敛到门）。**低风险，建议统一**。 |
| `src/client/locales.js` | 新增门文案：`auth.gate.title`、`auth.gate.reason.generic / .account / .publish / .open`、`auth.gate.resumeHint`、`auth.gate.cancel`、复用 `plugins.waiting/denied/expired/error/open/login`。 |
| `src/auth/identity.js`（OPTIONAL） | 加 `subscribe(fn)` 登录态事件（login/logout/token_invalid）。默认不加，保持契约稳定。 |
| `src/auth/http-routes.js`（OPTIONAL） | 若统一 error 格式，`official`/`avatar` 路由的 `401` body 统一为 `{error:'needs-omnimux', message}`，便于客户端归一化判定。 |

### B.3 垂直包（各有 client 的）

| 包 | 要改什么 |
|---|---|
| `omnimux-accounts` | `AccountsStage.jsx` 打开页 + connect/disconnect 动作调 `window.__omnimuxAuth.ensureLogin({ onSuccess: reRun })`；`api.js` 包一层 `authGuard` 兜底 401。加一个极小的 `whenAuthReady(cb)`（复用 `registerWhenReady` 模式）消费全局。 |
| `omnimux-workflow` | 提交到 hub seam 的动作前 `ensureLogin`；`api.js` 可选 `authGuard`。画布浏览不拦。 |
| `omnimux-market` | 「未登录可逛货架」保留，**不拦浏览**；仅「打开/安装需要身份的 app」才 `ensureLogin`。 |
| `omnimux-assets` | **默认不改**（本地文件/产物，无身份需求）。若后续某动作经 hub seam 需身份，再加 guard。 |
| `omnimux-gallery` | **默认不改**（专家/技能/连接器浏览 + SkillHub 在线源，无身份需求）。 |
| `omnimux-drama` / `omnimux-video` | **不改**（Host-only，无 client bundle；工具层 needs-omnimux 保持结构化错误）。 |

### B.4 不动的文件（明确列出）

- **任何垂直包**不得新增 `src/auth/`、不得 import `plugins/omnimux` 内部、不得直接调 `/omnimux/auth/*`（除通过 `window.__omnimuxAuth` seam）、不得 import hub `lib/client.js`。
- 不新建 `omnimux-brand` / `omnimux-theme` 等 hub 兄弟包。
- 不动桌面壳（当前为 `/Users/x/Desktop/Project/omnimux-desktop-fork`；旧 slim 壳已归档）（桌面不参与 auth）。
- `open-app-flow.js` / `app-actions.js` 仅作为「未来 apps 货架」的参考；本轮 apps 货架被 `client/index.js` 注释掉，**不需重启**。若后续恢复，把 `needsIdentity(...)→login` 分支导向 `ensureLogin`（见 A.3）。
- `src/auth/store.js` / `pending.js` / `omnimux-auth.js` 契约不变（门只消费，不改 token 存储）。

---

## C. 任务拆解（有序，按依赖）

> 三段原则：先中枢后垂直；L1 单测优先，可写进 `node --test` 的不开 App；构建 = `node scripts/build-client.mjs`；环境 = L2 dev-env link；生产 = 物化副本。开工前跑 `./scripts/dev-doctor.sh`。

**T0 — 前期（无依赖）**
1. 写 `docs/designs/omnimux-login-gate.md`（本文件）。
   验收：定界 + seam + 文件清单齐；无「第三套登录」；垂直不实现登录。

**T1 — Hub 客户端 seam（必须先做）**
2. 新增 `src/client/auth-gate.js`（store + `installAuthGlobal()` + `ensureLogin/cancel/subscribe/getSnapshot/getStatus` + 单门/并发 intent 合并）。
   验收：node --test 通过；`auth-gate.test.js` 覆盖（见 A.2 测试清单）；`window.__omnimuxAuth` 幂等。
3. 新增 `src/client/LoginGate.jsx`（门模态，`createPortal(document.body)`）。
   验收：门开时不动 `data-dsh-product-stage`；按钮 login/open/cancel 语义正确；reason 文案走 locales。
4. 改 `src/client/api.js`：`NEEDS_AUTH_CODE`、`pickAuthError`、`authGuard(fn)`、`getStatusCached()`。
   验收：`authGuard` 单测；401→needsAuth；2xx 直通。
5. 改 `src/client/use-omnimux-auth.js`：抽出 `runLogin(onSuccess)`（供门复用），保持 `useOmnimuxAuth` 签名不变。
   验收：`ProfileSection` 现有用例不破；门能驱动登录并触发 `onSuccess`。
6. 改 `src/client/index.js`：`installAuthGlobal()` + 注册 shell.overlay 座 `omnimux-auth-gate`。
   验收：门能被垂直触发；单 coordinator 无级联（重建 `lib/client.js` 后 L2 冒烟）。
7. 改 `src/client/locales.js`：新增门文案。
   验收：zh/en 齐全；无未定义 key。

**T2 — Hub 单测 + 构建**
8. 新增 `src/client/auth-gate.test.js` / `login-guard.test.js`；**运行** `cd plugins/omnimux && node tests src/client/auth-gate.test.js src/client/login-guard.test.js src/client/api.test.js src/client/settings-placement.test.js`。
   验收：全绿；无秘密泄漏断言（`access_token|sk-` 拒发）仍在。
9. 重建 hub client：`cd plugins/omnimux && node scripts/build-client.mjs`；`./scripts/dev-doctor.sh` 应报 hub lib 最新。
   验收：`lib/client.js` 重新生成；doctor 第 6 项 ✓。

**T3 — L2 集成验证（hub）**
10. `yarn omnimux:dev start login-hub omnimux`（dev profile link 源码）→ 浏览器点任意 OmniMux 功能验证：未登录弹门 → 授权 → 自动继续原意图。
    验收：sign 0 无错误；无第二套登录 UI；US-2 浏览不弹。
    完成后 `yarn omnimux:dev rm login-hub`。

**T4 — 垂直消费**
11. `omnimux-accounts`：加 `whenAuthReady` 消费 + connect/disconnect 用 `ensureLogin` + `authGuard` 兜底；重建 `lib/client.js`；单测。
12. `omnimux-workflow`：提交经 hub seam 前 `ensureLogin`。
13. `omnimux-market`：保留浏览、仅 open/install-identity 走 `ensureLogin`。
    验收：每个改动包的 node --test 全绿；L2 各自 dev-env 冒烟（≤1 link 铁律，一次只验一个）。

**T5 — 收口与评审（QA）**
14. `drsh`（QA 严过关）终审：目录硬边界（无跨包 import、无 hub 兄弟包、垂直无登录实现）、`dsh.bundle` 合规、`check_plugin`、`cordis.patch.yml` 无未匹配 target、`--patch` 加载。
    验收：`dsh --profile omnimux --dump-config` 列出 `omnimux`（及关联 bundle）；`./scripts/smoke-drama.sh` 通过；`dsh-plugin-guide`/`build-deepseek-harness-plugin` 合规项全过。

**T6 — 生产同步（仅用户要发布才做）**
15. 物化副本：`yarn omnimux:sync`（再 `yarn omnimux:restart`；不重打包可在 profile 内更新）；重打包走 `yarn omnimux:stage` → `package:dir` / `dist:*`。
    验收：生产 profile 无 link；doctor ✓。

> `--patch` 说明：hub 的 `dsh.bundle.patch: ./cordis.patch.yml`；需要单独 overlay 时用 `dsh --profile <name> --patch <path> --dump-config` 合成树 check（见 `research/dsh/sources/official/04-cli-reference.md`）。

---

## D. 风险与开放问题

1. **多处并发触发登录门（多 tab / 多点）**：单 tab 内用单例 store + intents 队列，`ensureLogin` 全部入队、已开则复用，`resolveAll(profile)` 逐个 `onSuccess`。**UX 取舍**：登录成功后是「全部 intent 都恢复」还是「只恢复最近一个」？推荐「全部恢复」（各自独立被中断动作），但需在 T1 单测里定死语义；若产品觉得怪，改「last-wins」并丢弃其余 onCancel。**跨 tab**：目前无同步（每 tab 独立 store）；可用 `BroadcastChannel('omnimux-auth')` 广播登录态，但会增加复杂度，建议列为可选增强，本轮不做。
2. **门打开时其他动作阻塞策略**：门是 fixed 蒙层（intercepts pointer），打开时底层 UI 天然不可点，等价阻塞。**风险**：若门由 `shell.overlay` 座渲染且返回 null 时不占层，需确认蒙层 zIndex 高于其它 overlay（AppsStage/AccountsStage 用 zIndex 200 级；门用 ~1200，参照 `AvatarModal` 1100）。避免门没盖住 AccountsStage。
3. **token 过期/拒绝/慢轮询 UX**：沿用现有 `plugins.denied/expired/error` 文案 + `interval` 慢轮询（`use-omnimux-auth` 已有）。**风险**：`expired`/`denied` 当前把 intents 全部 `onCancel`，用户需重开动作——需在门里给「重试」按钮（重新 `ensureLogin`），否则丢掉已选内容。
4. **未登录可浏览但点功能被拦的文案**：`auth.gate.reason.<scene>` 一句话说明必须登录才能用该功能、登录后自动继续。**风险**：文案若只说「请登录」会让用户觉得与 US-2 矛盾——必须把「浏览没事，用此功能需登录」讲清（`auth.gate.reason.generic` =「继续使用该功能需登录 OmniMux，登录后将自动继续」）。
5. **与「不做第三套登录」的一致性**：完全复用现有 `identity + useOmnimuxAuth + /omnimux/auth/* + verification_url`，门只是把「登录检查 + 授权页 + 恢复意图」统一收口成单一调用点，**不是新登录系统**。契约 `docs/contracts/hub.md` 与 `2026-08-14/16` 决策均已声明 `identity` 为唯一官方 provide、垂直不得实现 chrome/login。**一致性检查：** 不新增 `/omnimux/auth/*` 路由以外端点；不引入第二套设备码；`verification_url` 仍是现有授权页。
6. **agent 工具 needs-omnimux 是否自动弹门**：遵守 2026-08-14 决策「dsh 不替插件弹窗」，**不自动弹**；agent 侧显示结构化错误。若产品强烈要求「授权后重跑工具」，需要新增 Host→client 事件通道（当前不存在），且与该决策冲突——列为**开放问题**，由产品/负责人裁决，不建议本轮做。
7. **error 字段格式不一致**：`official`/`avatar` 两处 `401` 的 `error` 一个填 message 一个填 code。`authGuard`/`pickAuthError` 须同时认「status 401」与「error==='needs-omnimux'」，否则脆弱。建议 T1 顺带统一为 `{error:'needs-omnimux', message}`（标 OPTIONAL）。
8. **react 版本混用**：`omnimux-workflow` 锁 react 19（`dependencies`），hub peerDep react ^18。门组件在 hub bundle 里（react external），与 workflow 各自 bundle 的 react 是两套实例；**门只通过 window 全局（非 React 值）被垂直触发**，不跨 bundle 传组件/props，因此版本不冲突。提醒工程实现不要从垂直向 hub 传 React 元素。

---

## E. 结论

**是**——该 seam 不是新登录系统，而是现有 `identity（Host）+ use-omnimux-auth（client）+ /omnimux/auth/* + verification_url` 的**统一化收口**：把「登录检查、设备码授权、恢复被中断动作」收敛为单一调用点 `window.__omnimuxAuth.ensureLogin()`，由 hub 单点拥有并通过 window 全局 seam 供所有垂直包按需消费；不新增任何登录实现、不新增兄弟包、不推翻 US-2。一句话证据：登录的所有状态位、授权端点、token 存储全部复用既有 `auth/identity.js` + `auth/http-routes.js` + `client/use-omnimux-auth.js` + `api.js`，本设计只是在这些之上加「单门 + intent 队列 + 统一入口」，没有任何第二套登录。
