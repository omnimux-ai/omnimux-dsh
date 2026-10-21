# 门禁识别管道下游命令（guards-install-pipe）

## 目标

修复 `decideMainCheckoutBuildCommand` 对带管道的依赖恢复命令的误判：`pnpm install --frozen-lockfile 2>&1 | tail -3` 目前把整段当作一条命令分词，`|` 与 `tail`、`-3` 被当成位置参数，导致合法依赖恢复被拒。

方案：主检出命令判定前按管道拆分（`|`，避开 `||`），只对管道各段分别做构建/包管理器判定；下游命令（`tail`/`head`/`tee` 等）不触发包管理器规则。

## 命令

```bash
node --test scripts/guard-worktree.test.mjs
node --test scripts/guard-worktree.qa.test.mjs
```

## 项目结构

- `scripts/guard-worktree.mjs`：`decideMainCheckoutBuildCommand` 内对 `rawCommandSegments()` 结果按管道再拆分。
- `scripts/guard-worktree.test.mjs`：既有主检出门禁用例内追加断言（不新增用例）。
- `specs/guards-install-pipe.spec.md`：本规格。

## 代码风格

只在本函数内拆分，避免影响 `extractCommandWriteTargets` 对引号内载荷的保留逻辑。

```js
const segments = rawCommandSegments(command)
  .flatMap((seg) => seg.split(/(?<!\|)\|(?!\|)/).map((s) => s.trim()).filter(Boolean))
```

## 测试策略

在既有用例内追加断言：

1. `pnpm install --frozen-lockfile 2>&1 | tail -3` → allow；
2. `pnpm install --frozen-lockfile | tee /tmp/x.log` → allow；
3. `pnpm build | cat` → 仍 deny（上游构建段被识别）；
4. `npm install left-pad | cat` → 仍 deny；
5. 既有 `>` 重定向、`--filter` 带值 flag、`pnpm add`、`tsc` 断言不回归。

## 边界

- 总是：只拆管道用于命令分类，不改变拒绝消息中的原始命令；不删除既有断言。
- 先问：支持子 shell/heredoc 等复杂语法（本次不做）。
- 绝不：把 `pnpm build | cat` 或 `npm install <pkg> | cat` 放过。

## 成功标准

1. 上述 allow/deny 矩阵全部通过；
2. `node --test scripts/guard-worktree.test.mjs` 与 `scripts/guard-worktree.qa.test.mjs` 全绿；
3. 合并后 primary 可执行 `pnpm install --frozen-lockfile 2>&1 | tail -3`（此前被误拦）。

## 假设

1. 误拦来自管道 token 与下游命令被并入同一次分词，而非依赖恢复策略本身。
2. 仅对命令分类逻辑拆分管道是安全的：每段独立判定即可，不需要模拟真实执行顺序。
3. 下游 `tail`/`head`/`tee` 等命令不会被视为构建或包管理变更。

## 证伪方式

1. 修复前运行 `pnpm install --frozen-lockfile 2>&1 | tail -3` 应 deny；修复后 allow。若修复前已 allow，说明假设 1 不成立。
2. 修复后 `pnpm build | cat` 仍应 deny；若 allow，说明管道拆分把上游构建段漏掉。
3. 修复后 `npm install left-pad | cat` 仍应 deny；若 allow，说明包名检测被下游段绕过。
4. 合并后真实执行带管道的安装命令，若仍被拦，说明 hook 未加载新规则或拆分正则未生效。

## 文档影响

仅本机维护门禁的解析逻辑与测试；不改产品行为、用户可见文案与构建规则。无需更新产品文档。
