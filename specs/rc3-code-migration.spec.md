# Spec: rc.3 依赖树下暴露的代码级迁移（#3715）

- Issue：#3715（`chore(compat)`，R1，pre-authorized: false）
- 依赖：#3688（声明面双代，已合入 `74d5ff08a`）、#3668、#3658
- 关键路径：壳层发布 rc.3 之前必须完成（viewer 的 settings / fs 是运行期依赖）

## 目标（验收即 issue acceptance）

在 rc.3 依赖树下（lock 解析到 `0.2.1-rc.3` / schemastery `3.18.5`）以下三项转绿：

1. `omnimux-viewer` 的 `dsh-settings` 迁移：`installSettingsSection` / `settingsNamespace` → rc.3 的 `SettingsForms` 服务，并迁移 `ctx.fs`（2 处 + 1 处重载），保持用户可见行为不变。
2. `omnimux-browser` / `omnimux-market` 的 schemastery 类型注解适配（`Schema<Config>` 在 3.18.4+ 不再成立；优先按编译器提示补 `| undefined` 或调整注解策略，**不用** `as unknown as` 掩盖）。
3. 受影响插件 typecheck / build / 测试 + `pnpm verify:plugin-load` 通过；并把 `omnimux-viewer/tests/card-model.test.ts` 的类型导入（受 RULE-01 保护，需维护者批准）纳入同批；最后把 lock 统一钉到 rc.3。

**不做**：不改插件产品行为与 UI；不改桌面壳与宿主 App；不发布；不动正式版。

## 已知失败面（main 基线 0 错，全部是 rc.3 树新引入）

| 位置 | 报错 |
| --- | --- |
| `omnimux-viewer/src/index.ts:20` | TS2614 / TS2724：`dsh-settings` 无 `installSettingsSection` / `settingsNamespace` |
| `omnimux-viewer/src/display-file.ts:143,227` | TS2339：`Property 'fs' does not exist on type 'Context'` |
| `omnimux-viewer/src/display-file.ts:260` | TS2769：No overload matches this call |
| `omnimux-browser/src/index.ts:102` | TS2375：`Schema<ObjectS<…>, ObjectT<…>, "plain">` 不能赋给 `Schema<Config>` |
| `omnimux-market/src/host.ts:95` | TS2322：`Partial<ObjectT<NoInfer<…>>>` 不能赋给 `Partial<Config>` |

## 假设

1. rc.3 的 `dsh-settings` 用 `SettingsForms`（Service）+ `SettingsDescriptor` 承载配置席注册，能表达旧 `installSettingsSection` / `settingsNamespace` 的等价语义（命名空间、标题、表单渲染、读写）；若不能，则须在 viewer 内实现等价适配层，而不是回退声明面。
2. rc.3 不再把 `fs` 合进 `Context`，但 `dsh-fs` 仍以可 `ctx.get` 的服务形式提供同一能力；`display-file.ts` 的三处报错因此可用服务获取方式替代，行为不变。
3. schemastery 3.18.4+ 的类型面变化（`SchemaMode` / `SchemaOutput<T,M>`、`object()` 的 `NoInfer<X>`）只影响注解与可选属性推断，不影响运行期解析；因此最小改动能保持运行行为不变。
4. `omnimux-viewer/tests/card-model.test.ts` 的类型导入是 type-only、被 Node 类型擦除，改它不影响测试行为；但受 RULE-01 保护，需维护者批准或按 issue 要求单独提交。
5. lock 统一钉到 rc.3 后，`verify:plugin-load` 与受影响测试仍能通过（即没有第四处隐藏的运行期不兼容）。

## 证伪方式

1. 若 `pnpm --filter omnimux-viewer run typecheck` 仍报 `installSettingsSection` / `settingsNamespace` 缺失，说明迁移没做完或迁移到了错误的服务。
2. 若 `display-file.ts` 仍报 `fs` 不存在或重载不匹配，说明 `ctx.fs` 的替代获取方式不对（服务名/注入方式与 rc.3 实际不符）。
3. 若 browser / market 仍报 TS2375 / TS2322，说明注解适配没解决精确可选属性的 `| undefined` 推断，或用了掩盖手段（审查须确认没有 `as unknown as`）。
4. 若 `pnpm verify:plugin-load` 少于 22/22，或 viewer 测试数量少于基线（384），说明迁移改变了装载或运行行为。
5. 若 `pnpm test:worktree-web` 未全过，说明配置席/文件展示的用户可见行为被改坏。
6. 若 `pnpm install --frozen-lockfile` 失败，说明 lock 未与声明同步。

## 进展（rc.3 树已激活，实测状态）

依赖面已统一到 rc.3：全仓 `@deepseek-ai/dsh-*` 的 dependencies/devDependencies 都钉 `0.2.1-rc.3`，schemastery 钉 `3.18.5`（viewer/browser/market/hub），并移除 viewer 对 rc.3 已删除的 `dsh-client-runtime` 的 devDep。

已修（typecheck 实测转绿）：

| 位置 | 处理 |
| --- | --- |
| viewer `display-file.ts` | rc.3 删除了共享 `kind: 'plugin'`；新增 `src/message-source.ts` 按 rc.3 的 merge-extensible 方式声明自有 kind `'omnimux-viewer'` |
| viewer `supersede-read-image.ts` | `agent/created` 监听器按 rc.3 契约显式 `return undefined` |
| viewer `index.ts`（server 半边） | 删除 `installSettingsSection` / `settingsNamespace`：rc.3 里插件自身 `Config` 就是配置席，由 `SettingsForms` 服务投影，写表单走 `configEditor.edit(entry)` → 条目重应用，因此 `config` 即活值、`reconcile()` 每次 apply 都跑（等价旧 `onChange`） |
| browser `browser-context.ts` | 同上，声明自有 kind `'omnimux-browser-context'`（含 `ContextFormed`，保留 `form: 'snapshot'` + `sections`） |
| browser `index.ts` | `agent/session-start`（rc.3 已移除）→ `agent/created` + `return undefined`；`ctx.webServer.port` 在 rc.3 是 `number \| undefined`，配对路由里未知端口改为**显式抛错**（不用 `?? 0` 静默降级） |
| browser `package.json` | 补齐 12 个 rc.3 devDeps（此前只有 peer，类型解析到 hoist 的 0.1.5-rc.3 副本，产生 MessageId brand 冲突） |

**实测**：`omnimux-browser` typecheck **0 错**；`omnimux-viewer` server 半边 0 错；`omnimux-market` typecheck 0 错（schemastery 3.18.5 下 issue 里那条 TS2322 已不复现）。

**未完成（viewer 客户端半边，需继续）**：`omnimux-viewer` typecheck 还剩 5 条，全在 `src/client/`：

1. `card-model.ts:15` / `client/index.ts:22` 仍 import 已删除的 `@deepseek-ai/dsh-client-runtime/client`；rc.3 的 `ToolCallBlock` 位于 `@deepseek-ai/dsh-client-ui-tool` 的 client 侧 `tool/models/tool-call-model`，需确认它是否从 `@deepseek-ai/dsh-client-ui-tool/client` 重导出，再决定 import 目标。
2. `client/index.ts:80` `ctx.sessions.binding(...)`：rc.3 客户端 Context 上不再有 `sessions`，需定位提供会话绑定的服务（可能在 `dsh-client-connection` 或 `dsh-client-ui-conversation`）。
3. `client/index.ts:165` `ctx.slots.register(...)` 重载不匹配：rc.3 `dsh-client-ui-slots` 的 `register` 契约变了，需按新签名调整（含 `children`/`inject` 声明）。
4. `tests/card-model.test.ts:11` 同一 import（RULE-01 保护，需维护者批准）。
5. 文档：viewer README / harness-compatibility 里「rc.3 没有替代品」的表述已过期，需改成 `SettingsForms` 语义。

**界面改动的端到端证据（新增）**：viewer 的卡片没有任何页面入口（它经 `ctx.slots.register('tool.call.toolview', …)` 注册），既有工作树 Web 验收只覆盖侧边栏应用页，所以补了一个专用场景 `node scripts/worktree-web-qa.mjs viewer-card`：把插件客户端半边连同 React 编译后在真实 Chrome 内核里 `apply()`、注册、渲染运行中的 `display_file` 调用，读 DOM 断言卡片头部出现路径，并留存截图与报告。裁决文件是 `plugins/omnimux-viewer/tests/e2e/viewer-card-rc3.e2e.test.js`（与 `flow-alignment.e2e.test.js` 同一约定：只裁决证据，不自己起浏览器）。实测：场景 PASS，截图 1280x713 渲染出 `title.video /tmp/qa-viewer-card.mp4 state.running`，e2e 测试 1/1 通过。

## 独立审查的整改（第一轮 FAIL → 已修）

| 缺陷 | 整改 |
| --- | --- |
| D1 `plugins/omnimux-browser/tests/browser-context.spec.ts` 断言过期（rc.3 删除共享 `plugin` kind） | 断言改为自有 kind `'omnimux-browser-context'`（旧标准变更见下节）；`npx vitest run tests/browser-context.spec.ts` 5/5 通过。该包**没有** `test` 脚本、CI 也不跑它的 27 个 spec 是既有缺口，另开 issue 跟踪，不在本 PR 内顺手接一个必然发红的套件 |
| D2 端到端证据未入库、未接门禁 | `docs/evidence/viewer-card-qa-report.json` 与 `viewer-card-qa.png` 强制入库（同 `flow-alignment` 约定）；并把 `tests/e2e/viewer-card-rc3.e2e.test.js` **显式**写进 viewer 的 `test` 脚本，使 CI 的 workspace 测试会裁决这份证据（不带上既有的 #3054 真实浏览器用例，避免受其抖动影响） |
| D3 设置持久化 key 变更未披露、文档仍写旧机制 | README / README.zh / VENDOR.md 改为 rc.3 语义（设置席=插件 `Config`，按 profile 条目 id 定位，写 profile patch），并明示「0.1.x 的 `crosery-viewer:` 段不会被导入，四个开关回落默认值，请在设置界面重设一次」；`VIEWER_SETTINGS_NAMESPACE` 标注为兼容保留常量 |
| O2 `plugins/omnimux-automation` 的 schemastery 仍 `^3.18.1` | 改为 `^3.18.5`，与全仓一致 |

**观察项（不阻塞，留作后续）**：market 的 `src/client/tool-views.js` 仍是迁移前的两臂读法（无 `phase` 判断，且该文件不在 market 的 tsconfig include 内）；已安装树里仍有约 110 个 `0.1.5-rc.3` 条目，来源是 `omnimux-intercept` 的 peer 范围加 `autoInstallPeers`（本 PR 只声称 dependencies/devDependencies 统一，不声称已安装树全为 rc.3）；browser 包无 `typecheck` 脚本，其类型检查用 `tsc -b` 复现。

## 旧标准变更

rc.3 删除了共享的消息来源 kind `plugin`（`MessageSourceMap` 改为各插件自行合并声明），browser 插件随之声明自有 kind。以下既有断言的标准被更新，原断言与新期望如下：

- `plugins/omnimux-browser/tests/browser-context.spec.ts` :: `browser page context > builds plugin-owned snapshot context for the model`
  - 原断言：快照消息的 `source.kind` 深度等于 `'plugin'`。
  - 必须改的理由：rc.3 起 `'plugin'` 已不是合法 kind（宿主侧类型里不存在），继续断言它等于在断言一个已被删除的契约；实现已按 rc.3 的 merge-extensible 方式声明自有 kind。
  - 新期望证据：`source.kind === 'omnimux-browser-context'`，其余字段（plugin / form / sections）保持不变；`npx vitest run tests/browser-context.spec.ts` 通过。

## 残留

- 声明面双代范围（#3725）独立保留，可单独回滚本 issue 的提交。
- 本 issue 涉及 `RULE-01-TEST-IMMUTABLE` 保护的测试文件改动，需维护者批准；未获批准前该项保持未完成。
