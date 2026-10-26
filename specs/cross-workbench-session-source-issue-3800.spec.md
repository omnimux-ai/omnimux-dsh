# Spec: 侧栏一级入口点击无反应——工作台会话真源对齐（#3800）

- Issue: #3800
- 风险级别: R2（客户端会话真源读取路径 + 侧边栏支持包身份对齐；可逆，不改官方源码）
- 宿主: OmniMux Dev 2.0.10 / dsh `0.2.1-rc.3`（submodule `1f81c047fc`）
- base: `origin/main` @ `7e69cf58c`

## 1. 目标与用户故事

Dev 上左侧栏所有 OmniMux 一级入口（项目 / 数字人 / 资产库 / 灵感社区 / 技能·专家 / 「更多」10 项）点击后页面不打开：按钮有 hover 高亮，但不报错、不跳转、不弹窗。官方自带行（插件 / 自动化任务）切换正常。

用户故事：用户已选中一个会话，点侧栏「资产库」→ 右侧工作台应打开资产库页面。现状是点了没反应。

## 2. 现状与真源（CDP 真机实测，2026-10-26）

| 事实 | 证据 |
|---|---|
| 6 个入口行都在，行本身没坏 | `[data-omnimux-*-entry]` 全部可查 |
| `betterSidebar` 服务已挂载，Tab 已注册 | `getTab('omnimux-assets:library')` 返回 true |
| `window.__omnimuxWorkbench.getSnapshot()` | `sessionId: undefined`、`state: undefined` |
| 点「资产库」 | 页面不开；未选会话时弹「请先选择工作区并新建会话」 |
| 选中会话后再点 | 不弹提示，页面仍不开（`openWorkbench` 静默 `return false`） |
| 官方右栏展开 | 资产库 / 数字人 / 项目等 Tab 全在列，说明界面在、只是不响应打开请求 |

### 根因

`plugins/omnimux/src/client/workbench/host-adapter.js`：

```js
export function currentSessionId(sessions = deps.sessions) {
  try {
    const snap = sessions?.list?.getSnapshot?.()
    if (snap?.current) return String(snap.current)
  } catch { /* … */ }
  return undefined
}
```

`current` 在 rc.3 的类型契约里**确实存在**（`SessionListSnapshot.current: SessionId | undefined`），但运行时在"中间栏显示对话"的路径上并不保证填入。真正表示**此刻在屏**会话的公开读面是 `sidebarRight.mounted`：

| 接缝 | 位置（rc.3） | 语义 |
|---|---|---|
| `ISidebarRight.mounted: ObservableSnapshot<SessionId \| undefined>` | `packages/client/ui-sidebar-right/src/client/service.ts:196` | **在屏会话**；由 `index.ts:141` 在 `activePanelId === null` 时 `show(selected.sessionId)` 写入 |
| `SessionListSnapshot.current` | `packages/client/runtime/lib/types/client/sessions/manager.d.ts` | **选中**会话；类型存在，但运行时可能为 `undefined` |

### 实测证据（CDP 真机，2026-10-26/27）

| 检查 | 结果 |
|---|---|
| 左栏点「资产库」 | 页面不开；未选会话时弹「请先选择工作区并新建会话」 |
| 官方右栏内点「资产库」页签 | **正常打开**（`hasAssetsStage: true`）→ Tab 与页面本身没坏 |
| `betterSidebar` 服务 `getSnapshot().sessionId` | **`null`**（服务自己的会话槽位是空的） |
| 直接 `svc.openTab(seed, { sessionId: <真实 id> })` | 返回 `undefined`，面板不变 |
| `window.__omnimuxWorkbench.open({ tabId, sessionId: <真实 id> })` | 返回 `false` |

结论：页面与 Tab 都正常，断点在 **`betterSidebar` 服务的会话槽位永远为空**，导致 `openTab` 一进去就 `return`。

### 版本对比（决定性）

| 读法 | 0.19.1（Dev 实装） | 0.28.0（仓库已声明） |
|---|---|---|
| 读 `sessionList.current` 设槽位 | 3 处 | **0 处** |
| 读 `.mounted` | **0 处** | 9 处 |
| `mountedSessions` 辅助 | 无 | 有 |

0.19.1 只认 `current`；rc.3 运行时在该字段留空时，它的槽位就永远空着。0.28.0 改读 `mounted` 修掉了这一点。`scripts/sidebar-support-identity.json` 已声明 0.28.0，但 Dev 实装仍是 0.19.1——**实装与身份声明漂移**，这是本 Issue 的交付缺口。

## 3. 实现设计

1. `workbench/host-adapter.js`
   - 新增 `mountedSessionId()`：读 `deps.sidebarRight?.mounted?.getSnapshot?.()`；异常与缺失一律返回 `undefined`（不猜测）。
   - `currentSessionId()` 改为：`mounted`（在屏）优先 → 回落到 `sessions.list.getSnapshot().current`（选中）→ 都没有则 `undefined`。**两个来源都是官方契约字段**，不拿列表首项冒充。
   - 保留 `explicitId` 优先级：`ensureSessionId(sessions, explicitId)` 行为不变。
2. `chrome.js`：`sidebarRight` 注入时订阅 `mounted`，会话切换后触发 `requestRailActivationSync()` + `notifyWorkbenchChange()`，让左栏激活位与工作台跟上。
3. **支持包对齐（根因修复）**：把 Dev 实装的 `dsh-better-sidebar` 从 0.19.1 对齐到仓库已声明的 0.28.0，使其读 `mounted` 而非 `current`。这是让"左栏点击"真正恢复的必要条件——只改第 1 条只能让本仓自己的解析正确，服务内部槽位仍为空。
3. `scripts/sidebar-support-identity.json` + `plugins/omnimux-studio/package.json` peer：把支持包身份与实装对齐到 `dsh-better-sidebar@0.28.0`（与宿主同代），并让 Dev 物化装上同一版本。
4. 合同同步：`docs/contracts/workbench-split.md` 写明「当前会话唯一读面 = `ctx.sidebarRight.mounted`」；`sidebar-extra-entries.md` 的 Truth order 表补一行。

## 4. 范围 / 非目标

范围：`host-adapter.js` 会话真源读取、`chrome.js` 同步钩子、支持包身份对齐、合同同步、单测与真机验证。

非目标：改官方 `packages/`；新增第二条侧栏入口；改一级页业务内容；重做三栏布局；改 rank 或视觉度量。

## 5. 验收标准（可观察）

- [ ] 已选会话时点 6 个常驻行 + 「更多」10 项：对应页面在右侧工作台真实打开。
- [ ] 未选会话时点击：给出明确提示，不静默失败。
- [ ] `currentSessionId()` 在 `mounted` 存在时只读 `mounted`；`mounted` 缺失时不返回伪造 id。
- [ ] `pnpm --filter omnimux test` 通过。
- [ ] worktree 内真实浏览器验证留证（截图 / 结构化报告）。
- [ ] Dev 物化后真机复验（Agent 侧留证；人工验收归用户）。

## 假设

- 假设 A：rc.3 的 `ctx.sidebarRight.mounted` 在会话选中后会给出非空 SessionId，且该值可直接作为 `openTab(seed, { sessionId })` 的 scope 使用。
- 假设 B：把支持包对齐到 0.28.0 后，Dev 物化仍能通过 profile 依赖快照校验（`scripts/verify-profile-dependency-snapshots`）与 peer 兼容判定。
- 假设 C：`sessions.list.current` 在 rc.3 是合法契约字段（类型存在），运行时可能为空，因此保留为 `mounted` 之后的兜底是安全的。

## 证伪方式

- 证伪 A：真机上 `mounted` 恒为 `undefined` 而会话确已选中 → 停手，回到 `sidebarRight` 服务实现复核读面，不改回单一 `sessions.list.current` 或自造会话镜像。
- 证伪 B：对齐 0.28.0 后 profile 依赖快照校验或 peer 判定失败 → 保留 0.19.1 并只修本仓会话真源，把支持包升级拆成单独任务。
- 证伪 C：`sessions.list` 快照里 `current` 恒有值 → 说明兜底已足够，可去掉 `mounted` 分支；但需先解释为何 0.19.1 的槽位仍为空。

## 旧标准变更

本任务先按"`current` 字段不存在、只读 `mounted`"写过一版测试，随后用 0.19.1 / 0.28.0 的实装对比与 rc.3 `.d.ts` 复核推翻了该前提（`current` 是合法字段，运行时可能为空）。下列用例的旧断言随之失效，逐条声明：

- `plugins/omnimux/src/client/workbench/session-source.test.js` :: `currentSessionId 不再读不存在的 current 字段（回归 #3800）`
  - 原断言：只给 `current`（无 `mounted`）时必须返回 `undefined`。
  - 必须改的理由：前提错误——`current` 是 rc.3 的合法契约字段，禁止读取会丢掉真实可用的选中会话。
  - 新期望证据：`mounted 缺失时回落到列表的 current（选中）` 断言同一输入返回 `'selected-sess'`。
- `plugins/omnimux/src/client/workbench/session-source.test.js` :: `currentSessionId 优先返回 mounted，即使 sessions 列表另有内容`
  - 原断言：名称相同，但仅覆盖 `mounted` 优先。
  - 必须改的理由：需与回落用例成对，明确"优先"不等于"独占"。
  - 新期望证据：`currentSessionId 优先返回 mounted（在屏），而不是列表选中项` 保留优先级断言，并新增 `mounted 为空值时仍回落到 current，不因空串短路`。
- `plugins/omnimux/src/client/workbench/session-source.test.js` :: `无 mounted 时仅在列表 ready 且恰有一个会话时兜底`
  - 原断言：仅当 `phase === 'ready'` 且 `ids` 恰一个时才兜底，否则 `undefined`。
  - 必须改的理由：该兜底读的是 `ids` 投影而非官方 `current` 字段，属于猜测；应改用官方 `current`。
  - 新期望证据：`两个来源都没有时返回 undefined，绝不拿列表首项冒充` 断言 `current: undefined` + 单个 `ids` 仍返回 `undefined`。

## 8. 证据计划

- 单测：`pnpm --filter omnimux test`，覆盖 `currentSessionId` 在 `mounted` 有值 / 空值 / 抛错，以及 `current` 回落 / 全缺 等输入的返回。
- 静态：`node scripts/impact-matrix.mjs --git-diff --base origin/main` 取最小命令集。
- 浏览器：worktree 内真实浏览器验证，证明点击后页面打开；证据落本 worktree。
- Dev：合并后 `scripts/worktree.sh ship` 物化，再真机复验。

## 9. 文档影响

`docs/contracts/workbench-split.md` 增补「当前会话真源」小节；`docs/contracts/sidebar-extra-entries.md` 的 Truth order 表补 `ctx.sidebarRight.mounted` 一行。本 spec 位于任务 worktree。
