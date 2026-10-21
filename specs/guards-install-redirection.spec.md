# 门禁识别 shell 重定向与带值 flag（guards-install-redirection）

## 目标

修复 `decideMainCheckoutBuildCommand` 对依赖恢复命令的两个误判：

1. **shell 重定向**：`pnpm install --frozen-lockfile > /tmp/install.log 2>&1` 里的 `>/tmp/install.log`、`2>&1` 被当成位置参数，导致合法的依赖恢复被拒；
2. **带值 flag**：`pnpm install --filter omnimux` 里的 `omnimux` 是 `--filter` 的值，却被当成包名参数，导致误拒。

保持既有边界：`pnpm add/remove/update…`、`npm install <pkg>` 等 manifest/lock 变更仍拦截，构建/编译仍拦截。

## 命令

```bash
node --test scripts/guard-worktree.test.mjs
node --test scripts/guard-worktree.qa.test.mjs
```

## 项目结构

- `scripts/guard-worktree.mjs`：新增 `stripShellRedirection()`、`VALUE_TAKING_FLAGS`、`positionalArgs()`，并在 `decideMainCheckoutBuildCommand` 分词前剥离重定向、依赖恢复分支改用 `positionalArgs()`。
- `scripts/guard-worktree.test.mjs`：既有主检出门禁用例内追加断言（不新增用例）。
- `specs/guards-install-redirection.spec.md`：本规格。

## 代码风格

纯函数、无副作用；正则只剥离重定向 token，不改动原始 command（拒绝消息仍用原文）。

```js
const words = tokenizeCommandLine(stripShellRedirection(seg))
// ...
const positional = positionalArgs(cleanWords.slice(2))
```

## 测试策略

在既有用例内追加断言：

1. `pnpm install --frozen-lockfile > /tmp/install.log 2>&1` → allow；
2. `pnpm install --filter omnimux > /tmp/install.log` → allow；
3. `npm install left-pad > /tmp/x.log` → 仍 deny；
4. 既有 `pnpm install --frozen-lockfile --config.confirmModulesPurge=false` → allow、`pnpm add left-pad` → deny、`pnpm build`/`tsc` → deny 不回归。

## 边界

- 总是：只剥离重定向/flag 值，不放宽 manifest 变更与构建拦截；不删除既有断言。
- 先问：支持 heredoc（`<<EOF`）与复杂 shell 语法（本次不做，保守按原样处理）。
- 绝不：把带包名的安装解释为依赖恢复。

## 成功标准

1. 上述 allow/deny 矩阵全部通过；
2. `node --test scripts/guard-worktree.test.mjs` 与 `scripts/guard-worktree.qa.test.mjs` 全绿；
3. 合并后 primary 可执行 `pnpm install --frozen-lockfile > /tmp/x.log 2>&1`（此前被误拦）。

## 假设

1. 误拦来自重定向 token 与带值 flag 被计入位置参数，而不是依赖恢复策略本身；因此只修分词/参数判定。
2. 用「剥离重定向 + 已知带值 flag 列表」可以机械地区分依赖恢复与 manifest 变更，且不会把 `npm install left-pad` 误放行。
3. `--config.*=value` 这类单 token flag 不在此列，但已被既有逻辑当作 flag 跳过，无需特殊处理。

## 证伪方式

1. 修复前运行新增断言：`pnpm install --frozen-lockfile > /tmp/install.log 2>&1` 应为 deny；修复后 allow。若修复前已 allow，说明假设 1 不成立。
2. `npm install left-pad > /tmp/x.log` 修复后仍应 deny；若 allow，说明重定向剥离破坏了包名检测。
3. `pnpm build > /tmp/x.log` 修复后仍应 deny；若 allow，说明剥离顺带绕过了构建拦截。
4. 合并后真实执行带重定向的 `pnpm install --frozen-lockfile > /tmp/x.log`，若仍被拦，说明 hook 未从 primary 加载新规则或正则未覆盖该写法。

## 文档影响

仅本机维护门禁的解析逻辑与测试；不改产品行为、用户可见文案与构建规则。无需更新产品文档。
