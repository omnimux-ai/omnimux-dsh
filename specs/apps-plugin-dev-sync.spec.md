# omnimux-apps 插件纳入开发版同步并改为构建产物入口

- Issue: #2012
- 基线: `origin/main`
- 任务工作树: `.worktrees/apps-plugin-dev-sync`

## 1. 目标（Objective）

让 `omnimux-apps`（AI 应用域插件：应用清单 / 存储 / 执行桥 + 消费端表单与工作台）像其它插件一样随主分支更新进入开发版，从而让已发布 AI 应用的消费端界面（例如 Issue #1994 的「以下由作者设定」固定项摘要）在开发版可见。

现状两个阻断点（实测）：

1. 该插件不在 `scripts/sync-to-app.sh` 的 `DEFAULT_PLUGINS`，也不在 `scripts/sync-stable.sh` 的 `ALL_PLUGINS`；Dev profile 依赖中也没有它（实测 17 个 omnimux 插件，无 `omnimux-apps`）。
2. 点名同步（`bash scripts/sync-to-app.sh omnimux-apps`）时预检报 `Stripping types is currently unsupported for files under node_modules`（入口 `src/host/index.ts`），物化被回滚。全仓仅此插件把安装入口指向 TypeScript 源码。

## 2. 命令（Commands）

在任务工作树内执行：

- 构建：`node plugins/omnimux-apps/scripts/build-host.mjs && node plugins/omnimux-apps/scripts/build-client.mjs`
- 测试：`pnpm --filter omnimux-apps test`
- 类型检查：`pnpm --filter omnimux-apps typecheck`
- 真实同步（验收关键）：`bash scripts/sync-to-app.sh omnimux-apps`

## 3. 项目结构（Project Structure）

| 位置 | 职责 |
| --- | --- |
| `plugins/omnimux-apps/scripts/build-host.mjs` | 宿主入口与子路径入口 → `dist/` |
| `plugins/omnimux-apps/scripts/build-client.mjs` | 客户端包（含 CSS 注入）→ `lib/client.js` |
| `plugins/omnimux-apps/package.json` | `main` / `exports` / `files` / `scripts` / 构建依赖 |
| `plugins/omnimux-apps/.gitignore` | 忽略构建产物（与同侪一致） |
| `scripts/sync-to-app.sh`、`scripts/sync-stable.sh` | 常规同步名单 |

## 4. 代码风格（Code Style）

沿用同侪（`omnimux-workflow`、`omnimux-inspiration`）的构建脚本写法：esbuild + `write:false` 后自行落盘；客户端包用 `window.__ModuleLoader__.load({ id, factory })` 包装，React 与宿主客户端运行时保持 external；CSS 以内联注入方式随包发布（参照 `omnimux-clip` 的 CSS 处理思路，不引入 postcss/tailwind）。

## 5. 测试策略（Testing Strategy）

- 单元测试：`pnpm --filter omnimux-apps test`（既有 29 例）保持全绿。
- 类型检查：`pnpm --filter omnimux-apps typecheck`。
- 构建契约测试：新增 `plugins/omnimux-apps/src/host/packageEntry.test.mjs`，断言包入口不再是 `.ts`、`files` 覆盖产物、两个构建脚本存在且产物路径与 `exports` 一致。
- 真实同步验收：`bash scripts/sync-to-app.sh omnimux-apps` 必须成功（预检通过、无回滚），并核对 Dev profile 依赖、快照客户端包内容与模块可解析性。

## 6. 边界（Boundaries）

- 总是：改动只覆盖该插件的打包入口、构建脚本与同步名单；保持既有测试与类型检查通过；保留 Alpha 剔除策略不变。
- 先问：修改其它插件的入口形状；改动同步工具的既有语义（预检、回滚、快照布局）。
- 绝不：为通过验收而放宽预检；把工作树或未合并产物写进 Dev/Prod；删除既有失败测试。

## 7. 验收用例（可观察）

| ID | 步骤 | 期望 |
| --- | --- | --- |
| AC-101 | 运行两个构建脚本 | 产出 `dist/index.js`、`dist/shared/*.js`、`dist/host/storage/*.js`、`lib/client.js`；客户端包以 `id: "omnimux-apps"` 包装 |
| AC-102 | 读取 `package.json` | `main` 与 `exports['.']` 指向 `dist/index.js`；`exports['./client']` 指向 `lib/client.js`；无任何 `.ts` 入口 |
| AC-103 | `pnpm --filter omnimux-apps test` / `typecheck` | 全绿 |
| AC-104 | `bash scripts/sync-to-app.sh omnimux-apps` | 成功（无预检失败、无回滚） |
| AC-105 | 同步后读取 Dev profile | 依赖含 `omnimux-apps: file:.materialize-snapshots/plugins/omnimux-apps`；`node_modules/omnimux-apps` 可解析 |
| AC-106 | 同步后检查快照客户端包 | `lib/client.js` 含本次新界面标记 `omx-apps-fixed-summary`（证明物化为最新代码而非历史副本） |
| AC-107 | 检查同步名单 | `DEFAULT_PLUGINS` 与 `ALL_PLUGINS` 均含 `omnimux-apps` |

## 8. 假设与开放问题

- 假设：宿主通过包 `exports['./client']` 加载客户端包，包装格式与同侪一致即可被加载。
- 开放问题：`omnimux-studio` 同样不在同步名单且已在 Dev 依赖中，属另一类历史状态，本任务不处理。
