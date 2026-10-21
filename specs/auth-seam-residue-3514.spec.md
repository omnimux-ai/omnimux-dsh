# env token 登出后的 credentials seam 镜像残留收口（Issue #3514）

- 关联 Issue：#3514（type: chore / plugin: omnimux / track: D / **risk: R0**）
- 前置：#3503 / PR #3506（登出清理失败不再静默）；#3509 / #3528（market 侧已完成）
- 风险与授权：**用户在会话中明确授权实施**（「OK，那我授权你开始改吧」）。R0 边界内只做两件事：写本插件自有 marker；通过**官方 credentials seam API** 执行 `unset`。不直接读写官方 `.credentials.yaml`、不改官方源码、不改变 env token 的解析优先级。
- 合同：[plugin-git-pr](../docs/contracts/plugin-git-pr.md)（R0）、[anti-agent-fake-completion-guard](../docs/contracts/anti-agent-fake-completion-guard.md)、[hub](../docs/contracts/hub.md)（凭据边界）

## 问题

`createTokenStore().set()` 会把 token best-effort 镜像到官方 credentials seam（`$DSH_HOME/.credentials.yaml`）。产品线官方 seam（`@deepseek-ai/dsh-credentials-local@0.1.5-rc.2`）的 `set` 与 `unset` 在 `inherited(ref)` 非空时都走 `assertUnshadowed` 抛错，因此：

- env 期间的登录**不会**写入新镜像（`set` 被拒，插件忽略）；
- 残留路径是：**先在 env 未设置时登录**（镜像写入成功）→ 之后以 `OMNIMUX_ACCESS_TOKEN` 启动 → 登出时 `unset` 被拒（插件当前只 warn、登出 200）→ 镜像留在 seam；
- 撤销 env 并重启后 `resolve()` 第三级 seam 会把旧 token 读回来，等于「已登出的 token 仍可认证」（chat/page_fetch 等 seam 消费者同样可读）。

## 目标

1. **不再静默残留**：env 遮蔽导致登出 seam `unset` 被拒时，写 **per-home** pending marker（`$DSH_HOME/omnimux/seam-cleanup-pending.json`，0600，仅含 ref/原因/时间，**不含 token**），并把该事实写进 warn（既有行为保留：登出仍 200，不把 env 场景变成 5xx）。官方 `describe()` 在遮蔽下只报 env 层，插件无法探测文件层，因此遮蔽被拒即写；env-only 场景最多一次无害 no-op 清理。
2. **env 撤销后自动清理**：token store 下次创建时（env 已撤销、且 canonical `secrets.json` 无 token），通过**本 home 的**官方 seam `unset` 清理残留并删除 marker；仍失败则 warn 并保留 marker，下次启动再试。marker 作用域与官方 seam 一致（per `$DSH_HOME`），Dev/Prod 共享 configDir 时互不消费。
3. **不误删新登录态**：若 canonical token 存在（用户已重新登录），保留 marker 且不调用 seam `unset`（下一次正常登出完成清理）；正常登出/成功镜像成功时清理 marker。
4. **可观察**：`resolve()` / `describe()` 在 pending 清理完成后再判断，env 撤销 + 重启后不再从 seam 读出旧 token；`store.seamCleanup` 暴露清理 promise 供测试/宿主等待。

## 范围

| 文件 | 改动 |
|---|---|
| `plugins/omnimux/src/auth/store.js` | 新增 marker 读写与 pending seam 清理；`unset()` seam 被 env 遮蔽时写 marker；`set()` 镜像成功 / seam 清理成功时清 marker；`resolve`/`describe` 等清理完成；返回 `seamCleanup` / `seamCleanupMarkerPath` |
| `plugins/omnimux/src/auth/store.test.js` | 新增：env 遮蔽登出写 marker（不含 token）；env 撤销后新 store 清理 seam 并 resolve 为空；canonical token 存在时不删 seam；非 env 行为不回归 |
| `docs/evidence/auth-seam-residue-3514/` | 实测命令/结果/复现证据 |
| `specs/auth-seam-residue-3514.spec.md` | 本规格 |

## 非目标

- 不改变 env token 的解析优先级（env → secrets → seam 不变）。
- 不绕过官方 seam 直接写 `.credentials.yaml`；不修改官方 DSH 源码/包。
- 不在 env 仍存在时强行清理（官方 seam 拒绝；保留 marker 等 env 撤销）。
- 不把登出在 env 场景改成 5xx（沿用 #3503 的取舍：warn + 200）。
- 不处理 market 侧（#3509/#3528 已完成）与 C 档静默 catch 治理。

## 安全边界

- marker 只写插件自有 `configDir`（0600）；内容不含 token/凭据值。
- 清理只在「env 撤销 + 本插件 canonical token 不存在」时执行，且只对固定 `CREDENTIAL_REF` 调官方 `unset`；canonical token 存在时跳过（避免误删新登录态）。
- 所有失败都通过既有 `logger.warn` 留痕并保留 marker，不吞成无痕；清理 promise 内部全捕获，不产生 unhandled rejection。

## 新用户基线

- 全新用户（无 env、无 secrets、无 marker）：store 创建不做任何 seam 写/删；`resolve()` 返回 undefined。
- 普通登录/登出行为不变；只有「历史镜像残留 + env 撤销」这一路径会触发一次性清理。
- 清理失败不影响启动：warn + 保留 marker，下次启动重试；不依赖开发机私有状态。

## 假设

1. 残留根因是官方 seam 在 env 遮蔽下同时拒绝 `set`/`unset`，而插件只有 warn、没有「稍后清理」的状态；用一个插件自有 marker 记录待清理事实，就能在 env 撤销后的下一次 store 创建时通过官方 API 收敛。
2. marker 放在 `$DSH_HOME`（与官方 seam 同作用域）后，多 Dev/Prod home 共享 configDir 也不会互相消费/清除；清理条件（无 env、无 canonical token）足以区分「已登出等待清理」与「重新登录」，不会误删新 token；canonical 存在时保留 marker 供下一次登出收口。
3. `resolve()`/`describe()` 等待一次性 `seamCleanup` 后，行为在 env 撤销 + 重启场景下可被测试确定性验证，且对普通调用无额外副作用。

## 证伪方式

1. 构造「无 env 登录写 seam → 开启 env → 登出 → 检查 marker」：若没有 marker、或 marker 含 token、或登出变成 reject，假设 1 被证伪。命令：`pnpm --filter omnimux test`（`store.test.js` 新用例）。
2. env 撤销后新建 store（同一 configDir/credentials mock，且 canonical 无 token）：若 `seamCleanup` 未调用官方 `unset`、或 marker 仍在、或 `resolve()` 仍返回旧 token，假设 1/2 被证伪。（canonical token 存在时按 S1 保留 marker 属预期，下一次正常登出收敛。）
3. 构造「marker 存在 + canonical token 存在」：若清理调用 seam `unset`（删除当前登录态）或 marker 被删除，假设 2 被证伪（S1 预期：marker 保留到下一次正常登出收敛）。

## 验收（评审 B1/S1/S2/N1/N2 修订后）

- [x] env 遮蔽登出：warn 一次、登出 resolve、marker 存在且不含 token。
- [x] env 撤销 + 新 store：`await store.seamCleanup` 后 seam 值被清、marker 删除、`resolve()`/`describe()` 不再返回旧 token（repro.log 实测）。
- [x] canonical token 存在：marker 保留、seam 不被 `unset`；随后正常登出清理 seam 并删除 marker。
- [x] 非 env 登录/登出行为与错误路径不回归；auth 定向 35 pass / 0 fail。
- [x] `pnpm --filter omnimux test` 全绿（3617 pass）；`check:boundaries`、`verify:product-baseline`、`git diff --check`；改动文件无新增 SC1/SC2。
- [x] 证据落盘 `docs/evidence/auth-seam-residue-3514/`（含 env 撤销前后 resolve 的实际输出 repro.log）。

## 风险复核

- 定级 R0（凭据/token 边界）。本任务不改官方源码/配置、不直写官方文件、不改变凭据解析优先级；新增的自动清理受限条件严格（env 撤销 + 无 canonical token + 固定 ref），所有失败 warn 留痕并保留 marker。用户已明确授权本次实施；独立评审按 R0 核对授权、边界与证据。

## 文档影响

不新增合同条款；env 场景的已知残留与自动清理策略写入本规格、`store.js` 注释与 Issue #3514 评论。
