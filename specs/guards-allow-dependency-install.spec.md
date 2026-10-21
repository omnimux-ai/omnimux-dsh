# 主检出允许依赖安装（guards-allow-dependency-install）

## 目标

调整 `scripts/guard-worktree.mjs` 的主检出差量命令门禁：在 primary checkout 允许**依赖安装/恢复**（`pnpm install`、`pnpm i`、`npm ci`、`npm install` 无包名参数），不再要求切 worktree；同时继续拦截：

- 构建/编译/打包（`pnpm build`、`npm run build`、`tsc`（未 `--noEmit`）、`vite build`、`esbuild`）；
- 会改 tracked 文件的包管理变更（`pnpm add/remove/update/link/publish…`、`npm install <pkg>` 这类带位置参数的安装）。

背景：本机 primary 的 `node_modules/.modules.yaml` 被一次隔离 managed-check 安装写入了已删除 worktree 的 `storeDir`/`virtualStoreDir`，导致 pnpm 在每个脚本前触发整目录 purge 重建、非 TTY 下失败（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`）。修复只需要在 primary 执行一次依赖重装，而当前门禁把「包安装」与「构建」一并拦截，使 agent 无法完成这种本机维护。

## 命令

```bash
node --test scripts/guard-worktree.test.mjs
pnpm test:gates
```

## 项目结构

- `scripts/guard-worktree.mjs`：`decideMainCheckoutBuildCommand` 与拒绝消息。
- `scripts/guard-worktree.test.mjs`：既有「denies build and package mutation … main checkout」用例内追加断言。
- `specs/guards-allow-dependency-install.spec.md`：本规格。

## 代码风格

保持纯函数、最小分支；依赖恢复与 manifest 变更分开判定，拒绝理由复用 `forbidden-main-checkout-build`。

```js
const subcommand = (cleanWords[1] || '').toLowerCase()
if (['add', 'remove', 'uninstall', 'update'].includes(subcommand)) deny()
if (['install', 'i', 'ci'].includes(subcommand) && noPositionalPackage()) allow()
```

## 测试策略

- 框架：`node --test`（既有套件）。
- 位置：不新增用例（anti-cheat 门禁禁止新增测试用例），在既有分类器用例内追加断言。
- 覆盖点：
  1. `pnpm install --frozen-lockfile --config.confirmModulesPurge=false` → allow；
  2. `npm ci` → allow；
  3. `pnpm add left-pad` / `npm install left-pad` → 仍 deny；
  4. `pnpm build` / `npm run build` / `tsc -p …`（无 `--noEmit`）→ 仍 deny；
  5. worktree 内的同样命令仍 allow（既有断言不回归）。

## 边界

- 总是：只放宽「依赖恢复」；保留构建/编译与 manifest 变更拦截；更新拒绝消息使其与实际策略一致。
- 先问：允许 `pnpm add`/`npm install <pkg>` 或任何会改 `package.json`/`pnpm-lock.yaml` 的操作（本次不做）。
- 绝不：绕过 hook、删除既有断言、放宽 tsc/build 拦截。

## 成功标准

1. 上述 allow/deny 矩阵测试通过；
2. `scripts/guard-worktree.test.mjs` 既有用例不回归；
3. 合并后 primary 可执行 `pnpm install --frozen-lockfile --config.confirmModulesPurge=false`，并恢复标准 `node_modules/.modules.yaml`（storeDir 默认、virtualStoreDir=node_modules/.pnpm）。

## 假设

1. 允许依赖恢复不会破坏主检出只读边界：`pnpm install`/`npm ci` 只写 `node_modules`（本就被 gitignore 的 ephemeral 路径），配合 `--frozen-lockfile` 不改 `pnpm-lock.yaml`。
2. 用「子命令 + 无位置包名」可以机械区分依赖恢复与 manifest 变更；带位置参数的安装一律按变更处理（保守拒绝）。
3. 该放宽不会削弱构建拦截：`build`/`compile`/`bundle`/`tsc` 的判定仍先于安装判定。

## 证伪方式

1. 在修复前的门禁上运行新增断言：`pnpm install --frozen-lockfile` 应被 deny；修复后应 allow。若修复前已 allow，说明假设 2 的判定入口不对。
2. 构造 `pnpm add left-pad`、`npm install left-pad`，修复后仍应 deny；若 allow，说明放宽过头，会污染主检出。
3. 构造 `pnpm build`、`tsc -p tsconfig.json`，修复后仍应 deny；若 allow，说明构建拦截被误伤。
4. 合并后执行依赖重装，若 `.modules.yaml` 仍指向旧 worktree 路径，说明重装没有真正触发 purge 重建，假设 1 需要重新评估。

## 文档影响

只改本机维护门禁与拒绝消息，不改产品行为与用户可见文案；无需更新产品文档。
