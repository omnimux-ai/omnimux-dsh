# Spec: rc.3 删除 dsh-client-runtime 的兼容适配（Issue #3708）

- Issue: #3708（依赖 #3688 的版本声明面；本任务只动 inject / 构建 external / 类型导入）
- 风险级别: R1（声明与导入改动，无业务逻辑）
- 关键约束：改动必须**在旧底座（0.1.5-rc.3）上可验证**，因为新底座还没装进 Dev。

## 1. 目标与用户结果

新底座整体删掉了 `@deepseek-ai/dsh-client-runtime`。目标是清干净这条已不存在的声明，并把插件真正读取的能力换成两版都提供的模块边。

**更正一处早先的归因（本文件先前版本写错了）**：官方《Services and dependencies》说的「服务不存在时插件不加载」指的是 **cordis 服务**（host 侧）；`dsh.client.inject` 是**客户端模块图的边**，两者不是一回事。rc.3 的 `dsh-client-modules` 实测：host 侧只把 `dsh.client.inject` 原样拷进行（`lib/index.js:743`），客户端加载器对每个 inject 名做 `graphRows.get(packageName)`，**取不到就跳过**（`lib/client.js:788-791`）。所以指向已删包的条目在 rc.3 上是**惰性**的，不会让插件停止加载；真实代价是声明与底座静默脱节、无法从声明判断插件预期哪个底座，且一旦加载器改严格就会立刻变成加载失败。清理仍有价值，但不能归因为「死代码」。

## 2. 事实与证据（本轮实测）

| 事实 | 证据 |
| --- | --- |
| rc.3 没有该包、也没有别名 | npm 最高 0.1.1-rc.2；rc.3 的 344 个 tarball 全文扫描零命中（#3708 记录） |
| 旧底座早已拒 `/client` 子路径 | 旧 `app.asar` 内含守卫：请求 `@deepseek-ai/dsh-client-runtime/client` 直接抛「removed legacy client runtime」；viewer 那两处是 `import type`（编译期擦除）所以今天没炸 |
| 替代服务**两版都可注入** | 从两个 `app.asar` 的 `"inject": [...]` 列表提取：旧底座含 `dsh-client-ui-slots`/`ui-session`(17)/`ui-workspace`(6)/`ui-layout`(6)；新包同样有（19/11/14），而 `dsh-client-runtime` 在新包里**为 0** |
| 引用面 | inject 15 个插件；`scripts/build-client.mjs` external 14 个；viewer 1 条 devDependency + 2 处类型导入；workflow 一处注释 |
| rc.3 里 `ToolCallBlock` 的真实归属 | rc.3 `ui-tool/client` 的 `index.d.ts` **不导出** `ToolCallBlock`；它由 `@deepseek-ai/dsh-client-ui-chat/client` 导出（`ui-tool` 的 `tool-call-model.d.ts` 只是 `export type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'`）。两个版本的 `ui-chat/client` 都导出它（0.2.1-rc.3 取自壳仓 `vendor/dsh-runtime/0.2.1-rc.3/` 的 tarball；0.1.5-rc.3 取自 npm 公共包 `https://registry.npmjs.org/@deepseek-ai/dsh-client-ui-chat/-/dsh-client-ui-chat-0.1.5-rc.3.tgz`——两处 `client/index.d.ts` 第 15 行都导出 `ToolCallBlock`） |
| viewer 的 `ctx.sessions.binding()` 是旧 API | 旧底座里 `SessionStore.binding(sessionId)` 由 runtime 的类型增强提供；rc.3 的 `dsh-client-ui-session` 只有 `resolve(binding)` / `bindingSource(reference)`，**没有 `binding(sessionId)`** → 属真实 API 漂移，不是改个导入路径能解决的 |
| 消费情况（两种信号都要看） | 直接读 `ctx.<svc>`：omnimux slots 35 / sessions 1 / layout；clip slots；inspiration slots；social-harvest slots；market slots+sessions；workflow sessions/workspaces/layout。另有 cordis 动态依赖 `ctx.inject([...])`（服务名，不是包名）：accounts / analytics / assets / products / publish / clip / inspiration / omnimux 都注入 `['layout','sessions']`，assets 还 `ctx.get?.('sessions')`。**先前版本只统计直接读，漏了这一层** |
| 为什么这些动态依赖不补包边 | 这 5 个插件今天就没有 `@deepseek-ai/dsh-client-ui-layout` 包边却能正常拿到 `layout`/`sessions` 服务——服务由底座自己的客户端插件提供，插件声明的是 cordis 服务名而非包。故本次不为它们新增包边，只删掉那条已删除的包边 |

## 3. 逐插件结论（决策表）

| 插件 | 消费 | runtime 条目改为 |
| --- | --- | --- |
| omnimux | slots 35、sessions 1 | `ui-slots` + `ui-session` |
| omnimux-clip | slots 4 | `ui-slots` |
| omnimux-inspiration | slots 2 | `ui-slots` |
| omnimux-social-harvest | slots 6 | `ui-slots` |
| omnimux-market | slots 1（已 inject `ui-slots`）、sessions 1 | 追加 `ui-session`，删 runtime |
| omnimux-workflow | sessions 15、workspaces 13 | `ui-session` + `ui-workspace` |
| accounts / analytics / assets / avatar / device / forms / products / publish / video-preview | 不直接读 slots/sessions/workspaces；前 5 个经 `ctx.inject(['layout','sessions'])` 用服务，但今天也没有对应包边 | 直接删除（不新增包边） |
| omnimux-apps | 无消费（仅构建 external） | 仅从 external 删除 |
| omnimux-viewer | 类型 + 旧 session API | **延后到切换窗口**（见下）：`ToolCallBlock` 应改从 `@deepseek-ai/dsh-client-ui-chat/client`；`ctx.sessions.binding(sessionId)` 需按 rc.3 的 session 服务改写；两件都必须在新底座上验证 |

不使用 `@deepseek-ai/dsh-cordis-client-runner`：我们的插件没有"动态双半"需求，引入它只会扩大面。

## 假设

- `ctx.slots` / `ctx.sessions` / `ctx.workspaces` 在旧底座上由与包同名的客户端服务提供，且这些服务名两版都可注入（依据：两个 asar 的 inject 列表都能找到它们）。
- 把 runtime 换成这些服务后，旧底座行为不变（这些服务在旧底座同样被官方插件依赖）。
- 9 个零消费插件的 runtime 条目是历史遗留，删除不会改变其客户端行为。

## 证伪方式

- **注意**：`pnpm verify:plugin-load` 读的是 bundle 导出的 cordis `inject`（服务名）并打桩，**不读 `package.json` 的 `dsh.client.inject`**——它对本改动字段零覆盖，变绿不能证明映射正确。真正的证伪手段是对 rc.3 vendor manifest 做差集（本任务已跑，结果为空）。
- 若某插件在旧底座上客户端界面消失：说明模块边删错了 → 该插件需要补回对应包边。
- 若 viewer 类型导入路径不对：`pnpm --filter omnimux-viewer typecheck` 会直接报找不到 `ToolCallBlock`。
- 若"零消费"判断错了：删掉后该插件在 Dev 里的界面/功能消失。
- 若仍残留对已删除包的引用：对 rc.3 vendor manifest 做 inject 差集时还会出现 `@deepseek-ai/dsh-client-runtime`。

## 4. 范围与非目标

范围（本轮）：15 个插件的 `dsh.client.inject`、14 个 `scripts/build-client.mjs` 的 external、workflow 注释、本 spec。

**移出本轮（切换窗口内做，需新底座验证）**：`omnimux-viewer` 的两处类型导入与 session API 适配。理由有两条，都是实测：
1. #3708 原假设的 `@deepseek-ai/dsh-client-ui-tool/client` 并不导出 `ToolCallBlock`；真正提供方是 `@deepseek-ai/dsh-client-ui-chat/client`（两版都可核对）。
2. `card-model.ts`/`index.ts` 之外，`index.ts` 还用 `ctx.sessions.binding(sessionId)`——这是旧 runtime 的 `SessionStore` API，rc.3 的 session 服务已换成 `resolve(binding)`/`bindingSource(...)`。改写它属于行为适配，必须在装了新底座的 Dev 上验证，不能在旧底座上"猜着改"。
   viewer 因此保持现状（在旧底座上 typecheck 依旧通过），其 devDependency 属于 #3688 的版本声明面。

非目标：不改业务逻辑与 UI；不改版本号（属 #3688）；不动桌面壳、宿主 App、正式版；不新增 CI 门禁（差集检查本轮用一次性脚本；已另开 #3737 固化，不塞进本 PR）。

## 5. 验证

0. 结果：JSON 全部可解析、`node --check` 全部通过；`pnpm verify:plugin-load` 补齐产物后 22/22；`pnpm test:plugin-load` 8/8；inject 对 rc.3 manifest 差集为 **空**。**前两项不覆盖本次改动的字段**（见证伪方式第一条），主证据是差集为空 + 逐插件映射表。
1. JSON 可解析：15 个 `package.json`；`node --check` 14 个 `build-client.mjs`。
2. 受影响插件构建：`pnpm --filter <pkg> build`（含 `omnimux`、`omnimux-clip`、`omnimux-market`、`omnimux-social-harvest`、`omnimux-inspiration`、`omnimux-forms`、`omnimux-workflow`）。
3. viewer：`pnpm --filter omnimux-viewer typecheck`。
4. 全仓：`pnpm verify:plugin-load` + `pnpm test:plugin-load`。
5. 差集核对：用 `omnimux-desktop-fork/vendor/dsh-runtime/0.2.1-rc.3/manifest.json` 对全仓 inject 做差集，期望只剩非 DSH 包（`dsh-better-sidebar`）。
6. 旧底座真机（合入并物化后）：Dev 里确认 slots 渲染（omnimux 的设置区/输入框 dock）与 workflow 的项目流程仍可用；agent 跑浏览器检查，观感归人。

## 6. 失败模式与回滚

- 若某插件在新底座加载失败：说明它仍依赖已删服务 → 在切换窗口内单独映射，**不允许留在主线**。
- 回滚：单提交纯声明/导入改动，revert 即可；不涉及数据、Dev 结构与正式版。

## 7. 新用户基线 / 文档影响

对终端用户无可见变化；`docs/harness-pin.md` 不属本任务。
