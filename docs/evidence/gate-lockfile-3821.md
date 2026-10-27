---
title: "主检出 install 冻结 lockfile · 实测与验证证据（#3821）"
id: "evidence-gate-lockfile-3821"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-27"
authors: ["agent"]
subsystem: "scripts"
---

# 主检出 install 冻结 lockfile · 实测与验证证据（#3821）

## 结论

主检出不带冻结 flag 的 install 会静默改写 `pnpm-lock.yaml`，这一步不经过 `edit/write`，因此绕开 tracked-file 保护。本任务把该形态改为拒绝，冻结形态继续放行。

## 实测一：口子真实存在（pnpm 11.7.0，隔离探针项目）

| 场景 | lockfile sha256 前 16 位 | 结果 |
|---|---|---|
| 基线（manifest 只有 `is-number@7.0.0`） | `88818e6e51b71df8` | — |
| manifest 改为 `is-odd@3.0.1`，跑 `pnpm install`（无 flag） | `c10e5b055fe195da` | **被改写** |
| manifest 改为 `is-number@7.0.1`，跑 `pnpm install --frozen-lockfile` | `88818e6e51b71df8` | **未变**，命令以「specifiers 不匹配」失败退出 |

结论：`--frozen-lockfile` 的语义确实是「不匹配就失败，绝不改写」，可作为安全判据；无 flag 的 install 确实会改。

## 实测二：三种 hook 路径的拦截能力

| 路径 | 实测结果 |
|---|---|
| `decideWrite` 写主检出 tracked 文件 | deny（`tracked-file`） |
| 从别的 worktree cwd 写主检出 | deny（同样拦） |
| bash `cp` 覆盖主检出文件 | deny（`forbidden-main-checkout-copy`） |
| `pnpm install` | **allow** ← 本任务堵的口子 |

跨工作区/跨会话**不是**绕过路径，hook 在三种写入形态下都拦住了。唯一的口子是 install 被刻意放行。

## 实测三：PostToolUse 不能用于「事后拦截」

| 测点 | 结果 |
|---|---|
| PostToolUse 能拿到 `tool_input.command` 与 `tool_response` | 能 |
| PostToolUse 输出 `permissionDecision: "deny"` | hook 被调用，但**命令照常执行完毕**，deny 无效 |

与 `dsh-hooks-plugin` 文档一致：PostToolUse 只消费 `additionalContext`，不阻断。因此原方案（事后哈希比对 + 报错）不成立，改为前置静态判定。

## 实现与验证

改动：`scripts/guard-worktree.mjs` 新增 `isFrozenInstall()`，install 分支在原有「无位置包名」判定之后追加冻结判定；新增拒绝原因 `forbidden-main-checkout-unfrozen-install` 与配套中文提示。

| 命令（主检出 cwd） | 判定 |
|---|---|
| `pnpm install` | deny |
| `npm install` | deny |
| `yarn install` | deny |
| `pnpm install --frozen-lockfile` | allow |
| `pnpm install --offline --frozen-lockfile` | allow |
| `yarn install --frozen-lockfile` | allow |
| `npm ci` | allow |
| `pnpm install --frozen-lockfile=false` | deny（显式关闭冻结不算安全） |
| `pnpm install left-pad --frozen-lockfile` | deny（原有包名保护不被盖掉） |

工作树内任意形态仍全部放行。

## 端到端实证

用真实 hook stdin 载荷驱动改后的脚本：

```
pnpm install                      -> deny，输出完整可执行的修复指引
pnpm install --frozen-lockfile    -> allow
```

## 测试

| 检查 | 结果 |
|---|---|
| `node --test scripts/guard-worktree.test.mjs` | 74/74（原 69 + 新增 5） |
| `node --test scripts/guard-worktree.qa.test.mjs` | 17/17 |
| `verify-plugin-boundaries` | ✅ 4528 文件 |
| `verify-product-baseline` | ✅ |
| `verify-anti-slop` | ✅ 3/3 |

## 边界

- 只约束 pnpm / npm / yarn。`bun install` 的等价 flag 未实测，暂按拒绝处理（保守）。
- 不改变工作树内的任何 install 行为。
- 已有「install 仍可用」的两条保护断言（冻结 install、`npm ci`）原样保留。
