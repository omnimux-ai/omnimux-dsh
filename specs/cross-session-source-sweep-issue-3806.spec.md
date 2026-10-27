# Spec: 当前会话解析还剩 6 处直读 sessions.list.current（#3806）

- Issue: #3806
- 风险级别: R2（客户端会话解析路径，跨 3 个插件；可逆，不改官方源码）
- 宿主: OmniMux Dev 2.0.10 / dsh `0.2.1-rc.3`
- base: `origin/main` @ `edb980634`

## 1. 目标与用户故事

#3800 把工作台的当前会话解析改成 `sidebarRight.mounted` 优先、`sessions.list.current` 兜底，但同类读法在产品仓还有 6 处未改。

用户故事：用户已选中一个会话，在输入框点「从资产库添加」→ 应直接进素材选择；现状是拿不到会话、误弹「需要会话」。同类：附件提交桥不生效、灵感社区引导拿不到会话、市场「继续任务」不发、生成反馈不监听当前会话。

## 2. 实测证据（Dev 真机 CDP，2026-10-27）

会话已选中时：

| 字段 | 实测值 |
|---|---|
| `__omnimuxWorkbench.getSnapshot().sessionId`（走 mounted） | `session-afee398c-…` ✅ |
| `sessions.list.getSnapshot().current` | **`null`**（`phase: 'ready'`） |

即 `mounted` 有值、`current` 恒空。只读 `current` 的代码拿不到会话。

## 3. 现状清单（6 处）

| 位置 | 当前写法 | 后果 |
|---|---|---|
| `composer-add/install.js:48` | `getCurrentSessionId: () => sessions.list.getSnapshot().current` | `resolveSessionId()` 返回 null → 误弹「需要会话」 |
| `composer-add/install.js:61` | `const sessionId = sessions.list.getSnapshot().current` | `LIBRARY_STAGE_PROMPT_EVENT.sessionId` 为 undefined |
| `omnimux/src/client/index.js:210` | `guideSessions?.list.getSnapshot().current` | `AttachmentSubmitBridge` 归属判定恒 false |
| `omnimux-inspiration/src/explore/mount.js:22` | `guideSessions?.list.getSnapshot().current` | 创作引导拿不到会话 |
| `omnimux-market/src/client/tool-views.js:150` | `sessions.list.getSnapshot().current` | `sendPlazaFollowUp` 不发送 |
| `media-viewer/generation-feedback.js:195` | `watch(sessions.list.getSnapshot().current)` | `watch()` 有 `if (!sessionId) return`，不崩但静默失效 |

## 4. 实现设计

1. 全部改为调用 `workbench/host-adapter.js` 的 `currentSessionId()`（已实现 `mounted` → `current` 兜底，读不到返回 `undefined`）。
2. 跨插件引用：`omnimux-inspiration` / `omnimux-market` 经相对路径 import hub 的 `host-adapter.js`（`MediaViewerTab.jsx:7` 已是先例：`import { currentSessionId } from '../../../omnimux/src/client/workbench/host-adapter.js'`）。
3. **订阅面不变**：仍用 `sessions.list.subscribe(listener)` 作为变更脉冲；只有**取值**改走 `currentSessionId()`。若需要会话切换的及时性，同时订阅 `sidebarRight.mounted`（`omnimux/src/client/chrome.js` 已建立该模式）。
4. 单一真源：各插件不得自造第二套会话解析；只调 `currentSessionId()`。
5. 读不到就是读不到：返回 `undefined`，不拿列表首项冒充。

## 5. 范围 / 非目标

范围：上述 6 处取值改造 + 回归测试（锁「生产代码不得直读 `.current`」）+ 必要的最小验证。

非目标：改官方 `packages/`；动壳层侧栏支持包（anywhere-labs/dsh-desktop#1512，**独立并行，文件零重叠**）；改一级页业务内容；重做布局。

## 6. 验收标准（可观察）

- [ ] 6 处全部改走 `currentSessionId()`；仓库内生产代码不再直读 `list.getSnapshot().current`。
- [ ] 已选会话时：添加资产拿到真实 sessionId；附件提交桥归属判定为 true；市场追问能发送。
- [ ] 未选会话时：仍给出明确提示，不静默失败。
- [ ] 新增回归测试锁定「生产代码不得直读 `.current`」。
- [ ] `pnpm --filter omnimux test`、`--filter omnimux-market test`、`--filter omnimux-inspiration test` 通过。
- [ ] worktree 内真实浏览器验证留证。

## 假设

- 假设 A：`currentSessionId()` 在 `sidebarRight` 已注入时能返回非空值（#3800 已在 Dev 实测确认），因此 hub 内这 6 处改用它即可拿到真实会话。
- 假设 B：`omnimux-inspiration` / `omnimux-market` / `omnimux-viewer` **不能**通过相对路径 import hub 的 `host-adapter.js` 取会话——该模块持有模块级 `deps`，跨插件 import 会各建一份未绑定副本，`deps.sidebarRight` 为空、读了仍是 `undefined`。跨插件只能经 hub 已装的全局缝 `window.__omnimuxWorkbench.getCurrentSessionId()`。（原先按 `MediaViewerTab.jsx` 的既有 import 推断可共用，实测与代码结构否定了这一推断。）
- 假设 C：只改取值、不改订阅面不会丢失会话切换的及时性，因为 `sessions.list` 与 `sidebarRight.mounted` 在会话切换时都会通知。

## 旧标准变更

本任务先按「跨插件可 import hub 的 host-adapter」写过一条 e2e 断言，随后发现该模块的有状态读法在跨插件 import 下失效（模块级 `deps` 各建一份），据此收窄断言口径：

- `tests/e2e/session-source-sweep.e2e.test.mjs` :: `E2E: 跨插件经 hub 全局缝取会话，不 import hub 的 host-adapter`
  - 原断言：域插件源码中出现任何 `import ... from '.../workbench/host-adapter.js'` 即失败。
  - 必须改的理由：`host-adapter.js` 同时导出**无状态纯函数**（`hostDocument` / `hostWindow`），`AssetHubPanel.jsx` 正当使用 `hostDocument`；按模块路径一刀切会误杀合法用法，且无法区分"共用纯函数"与"误用有状态读数口"。
  - 新期望证据：改为解析具名导入清单，仅当导入 `currentSessionId` / `mountedSessionId` / `bindWorkbenchDeps` / `getWorkbenchService` / `getAttachedStore` / `liveSnapshot` 这些**依赖模块级 deps 的读数口**时才失败；用例名改为 `E2E: 跨插件经 hub 全局缝取会话，不 import 有状态的读数口`。

- `tests/e2e/session-source-sweep.e2e.test.mjs` :: `E2E: 生产代码不得直读 sessions.list.getSnapshot().current`
  - 原断言：`assert.deepEqual(offenders, [])`，扫描全部 `plugins/` 生产源码，无豁免。
  - 必须改的理由：`plugins/omnimux-viewer/src/media-viewer/MediaViewerTab.jsx` 写的是 `.current || currentSessionId()`，**本就有兜底**，Issue #3806 正文已明确把它排除在范围外；且它挂着 #3571 的历史证据哈希锁（`docs/evidence/viewer-single-mode-3571/report.json` 的 `sources.tab`），改它会连带作废那份历史证据。
  - 新期望证据：改为 `assert.equal(offenders.length, 0)` 并显式跳过 `plugins/omnimux-viewer/`（注释说明理由）；其余生产源码仍必须零命中。

- `tests/e2e/session-source-sweep.e2e.test.mjs` :: `E2E: 跨插件经 hub 全局缝取会话，不 import 有状态的读数口`
  - 原断言：扫描面含 `omnimux-viewer`。
  - 必须改的理由：同前一条——viewer 不在 #3806 范围（本就有兜底 + 历史证据哈希锁）。
  - 新期望证据：扫描面收窄为 `omnimux-inspiration` / `omnimux-market` / `omnimux-assets` / `omnimux-avatar`；命中仍以 `assert.deepEqual(violations, [])` 断言。

## 证伪方式

- 证伪 A：改完后真机上仍拿不到 sessionId → 停手，回到 `sidebarRight` 注入链复核，不改回 `.current` 或自造会话镜像。
- 证伪 B：`pnpm check:boundaries` 报跨插件越界 → 改为由 hub 通过既有接缝（`window.__omnimuxWorkbench`）暴露会话读数，各插件从全局读，不直接 import hub 内部模块。
- 证伪 C：真机上切换会话后某处仍用旧会话 → 补订阅 `sidebarRight.mounted`，不只依赖 `sessions.list`。

## 8. 证据计划

- 单测：新增 `tests/e2e/session-source-sweep.e2e.test.mjs`，扫描生产代码禁止直读 `.current`；`pnpm --filter omnimux test` 等三个包测试。
- 静态：`node scripts/impact-matrix.mjs --git-diff --base origin/main` 取最小命令集；`pnpm check:boundaries`。
- 浏览器：worktree 内真实浏览器验证，证明已选会话时「添加资产」不再误弹提示。
- Dev：合并后 `scripts/worktree.sh ship` 物化。

## 9. 文档影响

`docs/contracts/sidebar-extra-entries.md` 的 Current session 行已由 #3800 建立；本任务不改合同措辞，只在 spec 记录执行范围。若发现合同未覆盖跨插件调用面，补一行指向 `currentSessionId()` 是唯一读数口。
