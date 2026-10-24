# Spec: 插件仓 DSH 宿主兼容半边（#3688 声明面 + #3708 inject 重映射）

- Issue：#3688（宿主兼容半边）、#3668（peer 双代）、#3708（rc.3 删除 `dsh-client-runtime`）
- 授权：用户已授权 RC 变更，并选定「A：先落宿主兼容半边，devDeps 声明留在 0.1.x」
- 后续：#3715（代码级迁移 + devDeps/lock 翻到 rc.3）紧随其后，是壳层 rc.3 发布的关键路径

## 目标（本次 PR 只做这四件）

1. `peerDependencies` 里的 `@deepseek-ai/dsh-*` 改为**同时容纳两代宿主**的范围，宿主切到 rc.3 时不会因 peer 不满足拒绝装载。
2. `dsh.client.inject` 里 rc.3 已整体删除的 `@deepseek-ai/dsh-client-runtime` 换成 rc.3 实际提供该服务的包（`@deepseek-ai/dsh-client-ui-renderer`）。
3. 各插件 `scripts/build-client.mjs` 的 esbuild `external` 同步改名，避免产物继续 `require` 一个不存在的模块。
4. 新增声明面门禁（容纳新宿主 + 不得收窄 + inject/external 无已删包 + 预发布陷阱回归）并接进 `pnpm test:gates` 与 CI；更新受影响文档。

**不做**：`devDependencies` 的声明值仍停 0.1.x（本地构建 pin）；viewer 的类型导入重映射与 4 处代码迁移留给 #3715。

## 关键约束（预发布范围陷阱）

npm/pnpm 解析范围时**不开** `includePrerelease`：预发布版本只在范围内存在同 `major.minor.patch` 且自身带预发布标签的比较符时才被满足。因此

- ❌ `>=0.1.5-rc.3 <0.3.0-0` —— 看着宽，**不**容纳 `0.2.1-rc.3`
- ❌ `* || >=0.2.1-rc.3 <0.3.0-0` —— `semver.validRange` 会折成 `*`，预发布永远不满足
- ✅ 追加 `>=0.2.1-rc.3 <0.3.0-0` 分支，并**保留**原有各分支

## 假设

1. 宿主按 `dsh.client.inject` 里的**包名**解析客户端服务；rc.3 里 `dsh-client-ui-renderer` 是 `immediately: true` 的客户端基础半边、承载 Slot 服务（`dsh-client-ui-slots` 是无 `dsh.client` 字段的纯库），因此它是 `dsh-client-runtime` 的对位替代。
2. `devDependencies` 声明值不动时，本地构建与 typecheck 保持绿；peer 放宽只影响宿主装配判定。
3. lock 变化分两部分：(a) 根 `pnpm-lock.yaml` 的 specifier / peer 范围字符串（25 处 specifier + 1 处 peer 范围），**没有** `version: 0.2.1-rc.3` 解析条目；(b) 重新解析顺带改动的 **4 条传递依赖解析边**：`@deepseek-ai/cosmokit` 1.8.3→1.8.6（×2）、`@deepseek-ai/schemastery` 3.18.2→3.18.4（×2），均落在既有范围之内。`plugins/omnimux-studio` 是**独立安装根**（自带 `pnpm-workspace.yaml` 与 lock），其 peer 放宽后必须同步刷新该 lock 的两条 specifier，否则该根 `pnpm install --frozen-lockfile` 报 `ERR_PNPM_OUTDATED_LOCKFILE`（已实测）；刷新后解析版本仍是 `0.1.2-rc.1`，且该根 exit 1 的既有原因是 `ERR_PNPM_IGNORED_BUILDS`（node-pty 构建脚本，配置未动）。
4. 根 lock 里 `0.2.1-rc.3` 共 26 处 = 25 处 specifier 字符串 + 1 处 peer 范围字符串（`packages/dsh-ui-kit` 对 `@deepseek-ai/dsh-client-ui-primitives` 的 peer 声明），**没有**解析条目；各插件实际解析仍是 0.1.x（viewer `dsh-settings`/`dsh-fs` = 0.1.1-rc.2、market/browser `dsh-tools` = 0.1.5-rc.3）。schemastery 解析为 3.18.1 / 3.18.2 / 3.18.4（3.18.4 来自 hub 既有的精确 pin `3.18.4` 与上述 2 条传递边升级）。
5. `*` peer 无法容纳预发布，因此把 `*` 换成**其真超集** `>=0.0.0 <0.2.1-0 || >=0.2.1-rc.3`（`*` 只容纳稳定版，此式稳定版全覆盖且额外容纳 `0.2.1-rc.3`）。

## 证伪方式

1. 若 `pnpm verify:plugin-load` 报注入/装载失败，说明 inject 对位选错，按报错改到 rc.3 真实提供方。
2. 若门禁显示任一 peer 不满足 `0.2.1-rc.3`（默认语义），说明范围写错或又写回单分支。
3. 若门禁显示某 peer「收窄了旧世代」（不容纳任何代表版本），说明「加分支」被写成了「换范围」——反例自测已覆盖：`>=0.2.1-rc.3 <0.3.0-0`、`>=0.1.5-rc.3 <0.3.0-0`、`*`、inject 含已删包四种输入均必须 FAIL。
4. 若 `pnpm install --frozen-lockfile` 因 specifier 与 lock 不一致失败（根或 `plugins/omnimux-studio` 独立根），说明对应 lock 未同步 specifier，重跑该根的解析。
5. 若受影响插件 typecheck/build 变红，说明 devDeps 并未真的留在 0.1.x（或 primitives 升到 rc.3 后图标面有漏），逐条回到证据核对。若根 lock 出现 `version: 0.2.1-rc.3` 解析条目，或传递依赖解析边被改动而规格未记录，说明重新解析的影响面超出预期，需逐条核对后更新规格。
6. 若 `verify:plugin-load` 出现新的图标缺名警告且数量显著多于 main 基线（main 247 条，属既有桩环境噪音），说明兼容层取值或依赖解析异常，需单独排查。

## 验收

1. `node scripts/verify-dsh-declaration-range.mjs` 通过（44 条 peer 容纳新宿主且未收窄；inject 19 个与 build external 无已删包），且四种反例均 FAIL。
2. `pnpm verify:plugin-load` 22/22；`pnpm test:plugin-load` 通过。
3. 受影响插件测试与 `pnpm test:worktree-web` 通过并留证。
4. `pnpm test:gates`、`pnpm verify:stages`、anti-slop、`git diff --check`、`doc:pairing` 通过。
5. 文档与实现一致：`plugins/omnimux-publish/docs/architecture.md` 的 inject 示例、`plugins/omnimux-viewer` 的兼容性说明（引用该插件**实际**的 peer 范围字符串）。

## 残留（明确不在本 PR）

- #3715：viewer 的 `dsh-settings` / `ctx.fs` 迁移、browser/market 的 schemastery 类型适配、viewer 类型导入重映射、devDeps 与 lock 翻到 rc.3。它是壳层 rc.3 发布前的关键路径。
- RC 技能四屏证据：需要交付版 Dev 真的跑在 rc.3 上（当前 2.0.9 仍是 0.1.5-rc.3），本 PR 记为 `missing`。
- `verify:plugin-load` 的图标缺名警告是装载检查桩环境（absorb-anything 桩不提供图标）造成的既有噪音（main 247 条），非本 PR 引入。

## 风险

R1（跨 17 个包、宿主装配面）。采用双代范围降低顺序风险：旧宿主仍满足，新宿主也满足；devDeps 声明未动，本地构建不受影响。回滚为单 commit revert。
