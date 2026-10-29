# 3853 · guard-worktree 误判仓库外绝对路径为受保护 `.agents/`

> Issue: https://github.com/omnimux-ai/omnimux-dsh/issues/3853

## 假设

- `isProtectedScope` 的 `relative.includes('/' + prefix)` 匹配原本是为「绝对路径在仓库内但没被 `normalizedRoot` 前缀剥掉」兜底（例如符号链接后 realpath 离开 cwd 分支）。兜底逻辑只在路径真正属于本仓库时才该生效。
- 仓库外路径（如 `/Users/x/.agents/skills/x`）走不到 `marker = '/omnimux-dsh/'` 那一步，`relative` 保留原始绝对路径，又被 `includes('/' + '.agents/')` 兜底规则误伤。
- 修复策略：加一个 `insideRepo` 显式判定——若路径不以 `normalizedRoot + '/'` 开头、也没命中 `marker`，则 `relative === normalizedFull`（即剥壳没发生），判定为仓库外路径直接 `return false`，不再走前缀/文件名匹配。

## 用户操作旅程

Agent 在 Bash 里执行 `ln -sfn <skill-src> ~/.agents/skills/<name>`（或其他写家目录 `.agents` 的命令）。

## 期望界面反馈

`PreToolUse` hook 返回 `allow`，命令正常执行。仓库内 `.agents/...` 的写保护不受影响（仍然在 deny）。

## 验收用例

| # | 场景 | 期望 |
|---|---|---|
| A1 | `ln -sfn src ~/.agents/skills/x`（`toFullPath` 将 `~` 展开为 `$HOME`，落在仓库外）| `decision: 'allow'` |
| A2 | `ln -sfn src /Users/x/.agents/skills/x`（绝对路径，在仓库外）| `decision: 'allow'` |
| A3 | `cp src /tmp/.agents/x` | `decision: 'allow'`（`/tmp` 在仓库外）|
| A4 | 仓内 `.agents/skills/x` 写目标 | `decision: 'deny'`（回归不变）|
| A5 | 仓内 `plugins/foo` 写目标 | `decision: 'deny'`（回归不变）|

## 旧标准变更

无。仅修复一处误判；deny 语义不变。

## 证伪方式

新增 node --test 用例直接调 `isProtectedScope`/`decideBashCommand` 验证 A2–A5；本地实测 `ln -sfn` 不再被拦。

## 需求清单

- A1–A5 全部通过
- `guard-worktree.test.mjs` 中新增覆盖用例
- `pnpm test:gates` 全绿
