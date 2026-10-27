# 主检出 install 必须冻结 lockfile（Issue #3821）

## 目标与成功标准

堵住主检出保护的一个真实口子：`pnpm install` 被放行，但它会按 `package.json` 重写 `pnpm-lock.yaml`，这一步不经过 `edit/write`，因此绕过了 tracked-file 保护。主检出反复出现 lockfile 与插件 `package.json` 漂移就是这么来的。

- 主检出执行**不带冻结 flag** 的 `pnpm install` / `npm install` / `yarn install` → deny，理由写明要带 `--frozen-lockfile`。
- 带冻结 flag 的 install → 继续放行（`--frozen-lockfile` 本身保证 lockfile 不被改写）。
- `npm ci` → 继续放行（天然冻结）。
- 工作树内的 install → 完全不受影响。
- 既有 812 / 817 两条「依赖恢复仍可用」的断言原样保留。

## 实测依据（已完成，见 issue #3821 评论）

| 测点 | 结果 | 对方案的约束 |
|---|---|---|
| PostToolUse 能否拿到 `tool_input.command` 与 `tool_response` | 能 | 数据可得 |
| PostToolUse 的 `permissionDecision: "deny"` 能否阻断 | **不能**，命令照常执行完 | 事后拦截无效，只能在执行前收紧 |
| PreToolUse 能否读 `pnpm-lock.yaml` 算哈希 | 能 | 前置判定可行 |

结论：**原方案的「事后哈希比对 + 报错」不可行**，改用前置静态判定（冻结 flag 白名单）。

## 用户旅程

1. 开发者在主检出跑 `pnpm install`（想修 node_modules）→ 被拒，提示「主检出 install 必须带 --frozen-lockfile」。
2. 同一命令加 `--frozen-lockfile` → 放行，node_modules 正常维护。
3. 在任务工作树里跑 `pnpm install`（任意形态）→ 不受任何限制。

## 项目结构与复用

- 改动点唯一：`scripts/guard-worktree.mjs` 的 `decideMainCheckoutBuildCommand()` 里 `['install','i','ci'].includes(subcommand)` 那个分支。
- 复用既有的 `positionalArgs()` / `VALUE_TAKING_FLAGS` 做参数解析，不新写解析器。
- 复用既有 `forbidden-main-checkout-build` 拒绝原因，不新增 reason 码（保持失败面一致）。

## 新用户基线

不依赖任何开发机状态。判定只看命令形态与当前 cwd 是否在主检出，纯静态。

## 命令与测试策略

- `node --test scripts/guard-worktree.test.mjs`（守卫单测）。
- `node --test scripts/guard-worktree.qa.test.mjs`（同守卫 QA 面）。
- `pnpm test:gates`（含上述两个文件）。
- 静态：`node scripts/verify-plugin-boundaries.mjs`、`node scripts/verify-product-baseline.mjs`。

## 假设

`--frozen-lockfile` 是 pnpm 与 yarn 的共同 flag，且两者的语义都是「lockfile 与 manifest 不匹配时失败而不是改写」。因此「带该 flag 即视为安全」对这两个包管理器成立。`npm ci` 天然要求 lockfile 与 package.json 一致且不改写，故等价安全。

## 证伪方式

若实测发现某个包管理器在带 `--frozen-lockfile` 时仍会改写 lockfile，则「带 flag 即安全」不成立，需改为前置哈希 + 执行后校验的组合，并在本规格记录结论。证伪步骤：在临时目录用 pnpm 与 yarn 各跑一次 `install --frozen-lockfile`，故意让 manifest 与 lockfile 不一致，检查 lockfile 的 sha256 是否变化；变化则方案不成立。

## 边界

- 总是：先读既有测试确认哪些断言受保护，只改判定分支，保留既有 reason 码。
- 先问：若某包管理器的等价 flag 无法映射，先记录再决定是否保守拒绝。
- 绝不：禁用依赖恢复本身，改工作树内行为，或删掉「install 仍可用」的保护断言。

## 旧标准变更

- `scripts/guard-worktree.test.mjs` :: `denies build and package mutation commands on the main checkout while allowing in worktree`

理由：该用例内有一条断言 `pnpm install --filter omnimux > /tmp/install.log` 期望 `allow`，而它不带任何冻结 flag——**这正是本 issue 要堵的口子**：主检出不带冻结 flag 的 install 会按 manifest 重写 `pnpm-lock.yaml`，这一步不经过 `edit/write`，绕开 tracked-file 保护。不改变这条期望就无法修复问题。

新期望比原断言更严：同一条命令加上 `--frozen-lockfile` 后仍断言 `allow`（保留「重定向与带值 flag 不被误判为包名」的解析保护），并**追加**一条负向断言确认不带冻结 flag 时判 `deny`。该用例内的其它断言（`npm install left-pad` deny、`pnpm build` deny、管道下游不参与判定等）原样保留。
