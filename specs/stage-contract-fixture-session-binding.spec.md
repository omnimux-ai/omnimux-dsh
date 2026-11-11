# 规格：修复 stage 契约夹具的会话绑定断言

Issue: 待建 · 模块: scripts（共享门禁） · 风险等级: R2

## 新用户与产品基线

本任务只改测试门禁脚本，不影响任何用户首次运行的界面或数据路径。夹具的职责是在无头 jsdom 里断言「左栏入口 → 官方右栏 Tab → 会话切换后激活位」的契约；它必须对被测插件包的体量、模块数量和求值顺序保持中立。

## 一、问题

`pnpm verify:stages` 的 workflow 阶段在 `531813dd2` 上确定性失败：

```
assert.equal(api.getUiContext().sessionId, sessionId)
+ actual 'default'
- expected 'qa-session-b'
```

已实测的边界条件：

1. `origin/main` 的 workflow 入口：同一命令通过。
2. 只要 workflow 客户端包保留「画布 presence」相关代码（包括未被调用的函数定义），断言即失败；把它 tree-shake 掉即通过。
3. 打点显示：夹具 `api.bind(ctx)` 之后 `getUiContext().sessionId === 'qa-session-a'`；插件包 `win.eval` + `apply` 之后变成 `default`，且此时 `deps.sessions === ctx.sessions` 仍成立。
4. 在独立 jsdom 里只加载 hub、不加载插件时，`bind` → `getCurrentSessionId()` 正常返回会话。

结论：该断言读取的是 hub 模块级 `deps`，在「插件包求值 + apply 之后」的夹具环境里不可靠；它反映的是夹具与 hub 内部状态耦合，而不是被测插件的激活语义。

## 二、修法

1. 断言改用夹具自己控制的真源：`sidebar.getSnapshot().sessionId`（侧栏服务快照）与 `state()`（当前会话的 split 树）。
2. 保留全部激活语义断言：`adapter.getSnapshot() === false`、`sidebarRight.active() === null`、会话 A 恢复后 `active().kind === tabId`、左栏行 `data-active` 取舍、Tab 注册/解绑计数。
3. 删除对 `api.getUiContext().sessionId` 与 `getUiContext().surface.openedTabs` 的依赖；UI Context Envelope 的会话语义已由 hub 自身单测（`workbench-context.test.js`）覆盖，夹具不再重复。
4. 在脚本内加一行注释说明「为什么不用 envelope 的 sessionId」，防止以后有人加回来。

## 三、验收标准

| 编号 | 场景 | 期望 |
|---|---|---|
| AC-01 | `node scripts/live-stage-contracts.mjs workflow` | 通过 |
| AC-02 | `pnpm verify:stages` | 7 个 target 全绿，输出 `PASS` |
| AC-03 | `origin/main` 的 workflow 入口在同一夹具上 | 仍通过（不因修夹具而回归） |
| AC-04 | 任一「新增未调用函数」的 workflow 改动 | 不再触发该断言失败 |
| AC-05 | 会话切换后真正的激活语义 | 仍被断言：右栏无残留 Tab、切回后恢复 |

## 四、非目标

- 不改 hub 的 `host-adapter` / `workbench-context` 实现。
- 不放宽其它 target 的断言，不删除阶段覆盖。
- 不把 UI Context Envelope 的会话断言搬到别处重复实现。

## 假设

夹具在 jsdom 中以 `win.eval` 方式分别求值 hub 与插件包，hub 的模块级 `deps` 与 `getUiContext` 在同一模块实例内；插件包求值不应改变 hub 绑定，但实测会改变 envelope 的读数，因此夹具不应依赖该读数。

## 证伪方式

若修改后 `pnpm verify:stages` 仍失败，或需要在其它 target 上放宽断言才能通过，则修法不成立。若在 `origin/main` 上该夹具反而失败，说明改法引入了对新增代码的依赖，也不成立。