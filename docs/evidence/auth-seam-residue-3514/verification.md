# Issue #3514 验收证据：env token 登出后的 credentials seam 镜像残留收口

- Issue：#3514（chore / omnimux / **risk: R0**）
- 授权：用户在会话中明确授权实施（「OK，那我授权你开始改吧」）；R0 边界动作仅限：写本插件自有 marker、通过**官方 credentials seam API** 执行 `unset`。不直写 `.credentials.yaml`、不改官方源码、不改变环境变量解析优先级。
- Worktree：`.worktrees/auth-seam-residue-3514`（分支 `agent/auth-seam-residue-3514-issue-3514`）
- base：`origin/main` = `0856e06c2`（提交时以 PR head 为准）
- Spec：`specs/auth-seam-residue-3514.spec.md`

## 问题

官方 seam（产品线 `@deepseek-ai/dsh-credentials-local@0.1.5-rc.2`）在 `inherited(ref)` 非空时，`set` 与 `unset` 都 `assertUnshadowed` 抛错。因此：

- env 期间登录不会写入新镜像（`set` 被拒，插件既忽略）；
- 残留路径 = **先在 env 未设置时登录**（镜像写入 seam）→ **再以 `OMNIMUX_ACCESS_TOKEN` 启动** → 登出时 `unset` 被拒（此前仅 warn）→ 镜像留在 seam；
- 撤销 env + 重启后，`resolve()` 第三级 seam 会把旧 token 读回，导致「已登出 token 仍可认证」。

## 修复

1. env 遮蔽导致登出 seam `unset` 被拒、且官方 `describe` 显示 seam 确实存有值时：写 **home 专属** marker `$DSH_HOME/omnimux/seam-cleanup-pending.json`（0600，严格校验 `version/ref/reason`，仅元数据、**不含 token**），保留 warn，登出仍 200；seam 只继承 env 时不写 marker（N2）。
2. 下次 token store 创建（env 已撤销、无 canonical token）时：通过**本 home 的**官方 `credentials.unset(CREDENTIAL_REF)` 清理残留并删除 marker；失败则 warn 并保留 marker 重试。
3. canonical token 存在（仍处于登录态）：**保留 marker、不删除 seam**（避免误删当前登录态的合法镜像）；正常登出（无 env）会经官方 seam unset 清理 seam 并删除 marker；`set` 镜像成功或 seam 清理成功时也清 marker。
4. marker 作用域与官方 seam 一致（per `$DSH_HOME`），Dev/Prod 共享 `configDir` 时互不消费/清除（评审 B1）；无法解析/形状不符的 marker 保留并 warn，不静默失效（S2）。
5. `resolve()` / `describe()` 先 `await store.seamCleanup`，确保撤销 env 重启后不再观察到旧 token；`store.seamCleanup` 可被宿主/测试等待。

## 可复现证据（`repro.log`，本目录）

```text
1) login (no env): seam = pat-seam-old
2) logout under env: seam = pat-seam-old | marker = true | markerPath = $DSH_HOME/omnimux/seam-cleanup-pending.json
   warn = "[omnimux-auth] credentials.unset failed: credentials-local: OMNIMUX_ACCESS_TOKEN is supplied read-only by the launching environment"
3) env removed, restart: cleanup = true | seam = undefined | marker = false
   resolve = undefined | describe = {"configured":false,"writable":true} | seam unset calls = 2
```

命令（worktree 根，使用 mock seam 复刻官方「env 遮蔽时 set/unset 均拒绝」语义；不接触真实凭据）：

```bash
node --input-type=module -e "…见 PR 描述/测试 store.test.js 同构脚本…"
```

## 测试与检查（实际执行）

| 命令 | 结果 |
|---|---|
| `node --test src/auth/store.test.js src/auth/http-routes.test.js` | **35 pass / 0 fail**（新增 7 个 #3514 用例：主路径/多 home/canonical 保留 marker+登出清理/损坏 marker warn/仅有 env 不写 marker/清理失败保留 marker/非 env 不回归） |
| `pnpm --config.verify-deps-before-run=false --filter omnimux test` | exit 0；**3617 pass / 0 fail**（386 文件：2 + 3526 + 89） |
| `pnpm --config.verify-deps-before-run=false check:boundaries` | ✅ 4289 source files |
| `pnpm --config.verify-deps-before-run=false verify:product-baseline` | exit 0 |
| `node scripts/verify-silent-catch.mjs --json` + delta | 改动文件新增 SC1/SC2 = 0；net +6 SC3：5 处带 `logCleanupFailure` 的失败可见路径 + 1 处 `seamHoldsStoredValue` 的显式保守降级（`catch { return true }`，意为「无法判断则按存有值处理」） |
| `git diff --check` | exit 0 |

> 备注：worktree 依赖通过软链复用主检出 `node_modules`；`pnpm` 的依赖状态检查在软链工作树会尝试重装，因此按仓库 CI 惯例加 `--config.verify-deps-before-run=false`；同时 `pnpm --filter omnimux build` 生成了被 git 忽略的 `lib/client.js`（materialized-pack 用例需要），未进入 diff。

## 安全边界

- marker 写在插件自有 `$DSH_HOME/omnimux/`（0600，per-home），内容不含 token/凭据值；严格校验 `version/ref/reason`；清理仅针对固定 `CREDENTIAL_REF`。
- 自动清理只在「env 已撤销 + 本插件 canonical token 不存在（仍处于登出态）」时执行；canonical token 存在时保留 marker、跳过删除，避免误删当前登录态；下一次正常登出会完成 seam 清理。
- marker 作用域为 per `$DSH_HOME`，与官方 seam 一致；Dev/Prod 共享 `configDir` 时不会互相消费/清除。
- 所有失败都 `logger.warn` 留痕并保留 marker，next start 重试；清理 promise 内部全捕获，不产生 unhandled rejection。
- 未改官方源码/配置，未直接读写 `.credentials.yaml`，未改变 env → secrets → seam 的解析优先级。

## 残留

- env 仍存在时官方 seam 拒绝写，marker 会保留到 env 撤销后的下一次启动（符合官方 seam 设计）。
- 旧版本已经写入 seam 的历史镜像：本修复通过「登出时被拒 → marker → 环境撤销后清理」覆盖；若用户从不再次登出且 env 一直存在，无法在 seam 遮蔽期间删除（官方限制已记录在 #3514）。
