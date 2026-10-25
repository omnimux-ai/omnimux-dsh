# Spec: 让 omnimux-browser 的测试真正跑起来（Issue #3750）

## 1. 目标与用户结果

`plugins/omnimux-browser` 的 30 个测试文件（26 个 vitest spec + 4 个 node:test）**从写下那天起就没在 CI 里执行过**：该包没有 `test` 脚本，而 CI 的工作区测试只收集声明了 `test` 的包。结果是 #3715 把消息来源 kind 从 rc.3 已删除的 `'plugin'` 改成自有 kind 后，`tests/browser-context.spec.ts` 的断言过期却没有任何门禁变红——靠人工审查才发现。

本任务让该包的测试在 CI 里真正跑起来，并让套件是绿的（不是接上一片红）。

## 2. 事实与证据（2026-10-25 实测）

| 事实 | 证据 |
| --- | --- |
| 该包没有 `test` 脚本 | `git show origin/main:plugins/omnimux-browser/package.json` 的 scripts 只有 `build:server` / `build:extension` / `build` / `prepare` |
| 因此 CI 跳过整包 | `scripts/run-workspace-tests.mjs` 只收集声明了 `test` 的包 |
| 3 个 spec 连收集都失败 | `npx vitest run`：`composition.spec.ts` 缺 `@deepseek-ai/cordis-plugin-loader`；`session-purge.spec.ts` 缺 `@deepseek-ai/dsh-session`；`tests/e2e/bridge-extension.e2e.spec.ts` 缺 `playwright-core` |
| 缺的包不是「底座删了」 | `@deepseek-ai/cordis-plugin-loader` 是 cordis 生态包（1.0.x，lock 里解析 1.0.6）；`dsh-session` 有 rc.3；`playwright-core` 是第三方（1.64.1）。三者历史上都**从未**写进该包 package.json（`git log -S` 命中 0 次） |
| 4 个 `*.test.ts` 用 `node:test` | `draft-protocol` / `produced-media-rpc` / `produced-registry` / `read-produced` 都 `import ... from 'node:test'`，而 vitest 的 `include` 是 `tests/**/*.spec.ts` → 既不匹配也没人跑 |
| e2e spec 用 playwright 驱动未打包扩展 | `tests/e2e/bridge-extension.e2e.spec.ts:14` `import { chromium } from 'playwright-core'`，依赖 `~/Library/Caches/ms-playwright`；仓库契约要求未打包扩展 e2e 走 `scripts/lib/extension-e2e.mjs`，不在默认套件里跑 |

## 3. 改动

- `plugins/omnimux-browser/package.json`：新增 `test`（vitest 单测 + `node --test` 的 node:test 文件）与 `test:e2e`（opt-in，需要 playwright 浏览器与已构建扩展）；补齐缺失 devDependency（`@deepseek-ai/cordis-plugin-loader`、`@deepseek-ai/dsh-session`、`playwright-core`）。
- `plugins/omnimux-browser/vitest.config.ts`：`include` 保持 spec 面，`exclude` 显式排除 `tests/e2e/**`（默认套件不跑浏览器 e2e）。
- `plugins/omnimux-browser/vitest.e2e.config.ts`（新增）：e2e 专用配置，`include: ['tests/e2e/**/*.spec.ts']`。**为什么必须单独一份**：vitest 的 CLI 位置参数挡不住 config 的 `exclude`（`--exclude` 只是追加），复用主配置会让 `test:e2e` 变成 "No test files found" 的死入口。

## 4. 假设

- 排除 e2e spec 之后，其余 25 个 spec 与 4 个 node:test 文件在本机与 CI 都能通过（不依赖浏览器、不依赖网络）。
- 补齐 devDependency 后不会引入第二份 cordis / schemastery（`@deepseek-ai/cordis-plugin-loader` 1.0.6 与 lock 中既有解析一致）。

## 5. 证伪方式

- 若默认套件里仍有 spec 无法收集：`npx vitest run` 必须 0 个 "Cannot find package"。
- 若把 e2e 排除当成"掩盖失败"：`pnpm --filter omnimux-browser test:e2e` 必须真的列出并运行 5 个 e2e 文件（`vitest list --config vitest.e2e.config.ts` 数得出来），不得是空跑。
- **如实描述 skip 语义**：这 5 个 e2e 内部用 `describe.skipIf(!runnable)`，前置条件（chromium 缓存、`extension/dist/manifest.json`）缺失时它们报 skip 而**不是** fail——也就是说这个入口不会替你发现环境没准备好，它只是显式的手动验收通道，不是门禁。本 spec 与 PR 正文按此描述，不写成"缺前置会如实报错"。
- 若 devDep 引入重复单例：`pnpm verify:plugin-load` 与 `pnpm test:gates` 必须仍全绿。

## 6. 验证

1. `pnpm --filter omnimux-browser test`：全绿，且输出里能看到 spec 文件数与 node:test 用例数。
2. `pnpm test:gates`：全绿（新增脚本/依赖不破坏治理清单）。
3. `pnpm verify:plugin-load` 22/22。
4. 反证：故意把 `tests/browser-context.spec.ts` 的断言改回旧 kind，`pnpm --filter omnimux-browser test` 必须变红（证明这条测试现在真的被跑）。

## 7. 非目标与依赖

- 不重写 e2e spec、不改产品代码、不动 hub/壳层、不发布。
- 不引入浏览器下载到 CI（e2e 保持 opt-in）。

## 8. 旧标准变更（既有断言随 rc.3 更新）

这两处断言在测试恢复执行后立刻变红，属"测试从未跑过 → 期望值漂移"，逐条声明：

- `plugins/omnimux-browser/tests/session-purge.spec.ts` :: `purgeSessionFiles > archives a cold persisted session before deleting the data required by the real archive API`
  - 原断言/用法：`import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'`（默认导入）。
  - 必须改的理由：rc.3 该包只导出 `{ Config, JsonlCompressionSchema, apply, name }`，**没有 default**；默认导入得到 `undefined`，`ctx.plugin(undefined)` 直接抛「invalid plugin, expect function or object with an apply method」。子进程脚本里的同名导入报 `does not provide an export named 'default'`。
  - 新期望证据：改为命名空间导入（`import * as …`），cordis 接受带 `apply` 的对象；用例通过。
- `plugins/omnimux-browser/tests/session-purge.spec.ts` :: `purgeSessionFiles > respects another process's V3 write lock and permits deletion after release`
  - 同上（同一处默认导入的第二个调用点，含生成给子进程的脚本字符串）。
- `plugins/omnimux-browser/tests/composition.spec.ts` :: `real Loader composition > boots the bridge, authenticates over a real socket, and drives real gateway RPCs`
  - 原断言：握手回包 `caps` 深等于 `{ textOnly, snapshotMaxChars, maxInteractiveItems, locale }`。
  - 必须改的理由：实现新增了 `imageAssetSave` 能力并在握手 caps 里如实上报，收到的对象多一个键；断言从未执行过所以没跟上。
  - 新期望证据：期望补 `imageAssetSave: true`，用例通过（收到的 caps 与期望逐键一致）。

## 9. 实施记录（2026-10-25）

- `test` 脚本 = `vitest run && node --experimental-transform-types --test tests/*.test.ts`。第二个 flag 是必需的：`tests/produced-media-rpc.test.ts` 依赖的源码里有 TS 参数属性，Node 的 strip-only 模式报 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`；换 `--experimental-transform-types` 后该文件 35 用例全过。
- `vitest.config.ts` 显式 `exclude: ['tests/e2e/**', '**/node_modules/**']`；e2e 保留为 `test:e2e` 入口（需要 playwright 浏览器与已构建扩展）。
- 补齐 devDependency 共 13 个：`@deepseek-ai/cordis-plugin-loader` ^1.0.6、`@deepseek-ai/cordis-plugin-include` ^1.0.7、`playwright-core` ^1.64.1，以及 rc.3 的 `dsh-session` / `dsh-session-persistence-jsonl` / `dsh-storage` / `dsh-storage-domain` / `dsh-storage-json` / `dsh-workspace` / `dsh-agent-loop` / `dsh-host-webserver` / `dsh-llm` / `dsh-session-projection` / `dsh-system-prompt` / `dsh-tools` / `dsh-user-questions`。

**实测**：`pnpm --filter omnimux-browser test` → vitest 21 文件 / 357 用例全过，`node --test` 35 用例全过，exit 0。**反证**：把 `browser-context.spec.ts` 的断言改回旧 kind `'plugin'` → 该文件 1 失败（改前整包不跑，永远不会红）；恢复后 5/5 通过。

## 11. 独立审查整改（第二轮，2026-10-25）

| 缺陷 | 整改 |
| --- | --- |
| **阻断**：`test:e2e` 是死入口——`vitest.config.ts` 的 `exclude: ['tests/e2e/**']` 连 CLI 位置参数一起挡死，实测 `No test files found, exiting with code 1`；且正文声称"缺前置会如实报错"被证伪（那 5 个 e2e 是 `describe.skipIf`，缺 chromium 时报 skip、exit 0） | 新增 `vitest.e2e.config.ts`（`include: ['tests/e2e/**/*.spec.ts']`，不带 e2e exclude），`test:e2e` 改为 `vitest run --config vitest.e2e.config.ts`；实测 `vitest list` 列出 **5 个** e2e 文件，`pnpm --filter omnimux-browser test:e2e` exit 0（3 文件通过 / 2 跳过，5 用例通过 / 4 跳过）。同时把 spec 与 PR 正文改成如实描述 skip 语义 |
| 计数与理由不完整：正文按 27 个测试文件、把排除理由只写成 `bridge-extension.e2e.spec.ts` 一个文件 | 更正为 **30 个**（26 spec + 4 node:test）；被排除的是**全部 5 个** e2e spec，5 个都依赖 chromium，其中 4 个还依赖 `extension/dist/manifest.json` |
