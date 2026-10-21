# 门禁识别包装执行器（guards-exec-wrapper）

## 目标

让主检出门禁识别 `npx` / `pnpm exec|dlx` / `npm exec` / `yarn exec|dlx` / `bunx` 包装后的命令，按被包装命令本身判定，避免两种漏判/误判：

- **误判（应放行却拦截）**：`pnpm exec npm ci`、`npx --yes pnpm install --frozen-lockfile` 等依赖恢复；
- **漏判（应拦截却放行）**：`pnpm exec tsc -p tsconfig.json`、`npx vite build`、`pnpm exec npm install left-pad` 等构建/manifest 变更。

## 命令

```bash
node --test scripts/guard-worktree.test.mjs
node --test scripts/guard-worktree.qa.test.mjs
```

## 项目结构

- `scripts/guard-worktree.mjs`：新增 `unwrapExecutionWrapper()` 与 `skipLeadingWrapperFlags()`；`decideMainCheckoutBuildCommand` 在分类前解包包装器，再用 `effectiveWords`/`effectiveVerb` 走既有 tsc/build/install 规则。
- `scripts/guard-worktree.test.mjs`：既有主检出门禁用例内追加断言（不新增用例）。
- `specs/guards-exec-wrapper.spec.md`：本规格。

## 代码风格

纯函数、最多解包 3 层防止嵌套死循环；包装器前置 flag（`--yes`、`--package <pkg>`、`--`）在进入被包装命令前跳过。

```js
const effectiveWords = unwrapExecutionWrapper(cleanWords)
const effectiveVerb = (effectiveWords[0] || '').toLowerCase()
```

## 测试策略

在既有用例内追加断言：

1. `pnpm exec npm ci` → allow；
2. `npx --yes pnpm install --frozen-lockfile` → allow；
3. `npm exec -- pnpm install --frozen-lockfile` → allow；
4. `pnpm exec npm install left-pad` → deny；
5. `pnpm exec tsc -p tsconfig.json` → deny；
6. `npx vite build` → deny；
7. `pnpm exec node scripts/dev-doctor.sh` → allow（安全命令不被误伤）。

## 边界

- 总是：只解包已知包装器；不删除既有断言；构建/manifest 变更拦截不变。
- 先问：支持 `yarn dlx`/`bunx` 之外的第三方运行器（如 `tsx`）作为包装器。
- 绝不：因解包而放过 `npm install <pkg>`、`tsc`（无 `--noEmit`）、`vite build`。

## 成功标准

1. 上述 allow/deny 矩阵全部通过；
2. `node --test scripts/guard-worktree.test.mjs` 与 `scripts/guard-worktree.qa.test.mjs` 全绿；
3. 合并后 primary 可执行 `pnpm exec npm ci --dry-run`（此前被拦）。

## 假设

1. `pnpm exec`/`npx`/`npm exec`/`yarn dlx`/`bunx` 的语义都是「运行随后的命令」，可以先解包再判定。
2. 包装器前置 flag 可以用「已知带值 flag + 跳过 `--`」机械处理，且不会吞掉被包装命令。
3. 解包不会改变既有直接调用（`pnpm install`、`tsc` 等）的判定结果。

## 证伪方式

1. 修复前运行 `pnpm exec npm ci` 应 deny（当前被拦）；修复后 allow。若修复前已 allow，说明假设 1 不成立。
2. 修复后 `pnpm exec tsc -p tsconfig.json` 应 deny；若 allow，说明解包把 tsc 规则漏掉。
3. 修复后 `pnpm exec npm install left-pad` 应 deny；若 allow，说明解包后包名检测失效。
4. 合并后真实执行 `pnpm exec npm ci --dry-run`，若仍被拦，说明 hook 未加载新规则或解包分支未命中。

## 文档影响

仅本机维护门禁的解析逻辑与测试；不改产品行为、用户可见文案与构建规则。无需更新产品文档。
