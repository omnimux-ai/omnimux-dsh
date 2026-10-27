# Spec: 侧栏支持包身份升至 0.28.1，并让受管快照漂移指名失败（#3835）

- Issue: #3835
- 风险级别: R2（支持包身份 + 物化校验链；可逆，不改官方 DSH 源码、不手工改 profile）
- base: `origin/main` @ `a643e6829`
- 工作树: `.worktrees/cross-sidebar-0281-issue-3835`

## 1. 目标与用户故事

桌面壳 `dsh-desktop-next` 已声明 `dsh-better-sidebar ^0.28.1`，而本仓身份文件与
`omnimux-studio` 的 peer 仍停在 `0.28.0`，Dev 受管快照里更是 0.19.1。

用户故事：用户升级 Dev 后点左侧栏任一 OmniMux 一级入口，右侧工作台应当打开对应页面。
若受管快照被打回 0.19.1（只读 `sessions.list.current`），宿主 `0.2.1-rc.3` 在该字段留空时
槽位恒为空，入口点击静默失效（#3800）——用户看到的是「按钮有高亮、页面不打开、也不报错」。

因此本单要交付两件事：

1. 身份与 peer 对齐到 `dsh-better-sidebar@0.28.1`（与壳仓声明同代）；
2. 物化校验链把「受管快照 / 已装包版本 ≠ 身份声明」变成**指名失败**，不再静默降级。

## 2. 已核实的上游事实

| 事实 | 证据 |
|---|---|
| 0.28.1 与 0.28.0 的 `peerDependencies` / `peerDependenciesMeta` 完全一致 | 两个 npm tarball 解包后逐字段比较，diff 键为空 |
| 0.28.1 不含已在宿主 0.2.x 移除的 `dsh-invariants` | 同上，peer 列表无该包 |
| 0.28.1 与 0.28.0 都不读 `sessionList.current`，都读 `.mounted`（各 9 处） | `lib/client.js` 计数 |
| 0.28.1 的 git tag `v0.28.1` → commit `59131330bb837cf48dc4117b17c091998b595df0` | GitHub API `git/ref/tags/v0.28.1` |
| 0.28.1 相对 0.28.0 仅多一条 `"./icon": "./icon.svg"` 导出 | package.json 字段 diff |

结论：升级不引入代际缺口，无需 `peerExemptions`。

## 3. 现状缺陷（本单真实要修的）

`~/.omnimux-dev/profiles/omnimux` 实测：

| 位置 | 版本 |
|---|---|
| `.materialize-snapshots/plugins/dsh-better-sidebar` | **0.19.1** |
| `node_modules/dsh-better-sidebar` | 0.28.0 |

profile 的 `package.json` 声明 `dsh-better-sidebar: file:.materialize-snapshots/plugins/dsh-better-sidebar`，
因此一次 `pnpm install` 就会按快照把 `node_modules` 装成 0.19.1——**静默降级**，且现有
`scripts/verify-profile-dependency-snapshots.mjs` 只校验快照目录是否存在、owned 依赖是否指向快照，
从不比较版本，所以整条物化链没有任何一处会报错。

## 4. 交付范围

1. `scripts/sidebar-support-identity.json`：`version`、`shippedBuild.spec`、`shippedBuild.gitTagCommit`
   改 0.28.1 / `59131330bb837cf48dc4117b17c091998b595df0`；`verifiedAt`、note 同步。
2. `plugins/omnimux-studio/package.json`：`peerDependencies["dsh-better-sidebar"]` 0.28.0 → 0.28.1。
3. `pnpm-lock.yaml`：importer specifier、`packages:`/`snapshots:` 条目随 peer 一起改，保持 CI
   `--frozen-lockfile` 可解。
4. `scripts/verify-profile-dependency-snapshots.mjs`：新增支持包身份校验——受管快照与
   `node_modules` 里实际装到的 `dsh-better-sidebar` 版本都必须等于身份声明，不一致时把
   包名、期望版本、实际版本、路径一起写进 `failures`。
5. `scripts/sync-stable.sh`：物化前先用同一实现做一次身份预检（`--support-only`），
   在写 `package.json`/跑 `pnpm install` 之前就指名失败，避免先降级再回滚。
6. 文档与测试字面量同步：`docs/contracts/workbench-split.md`、`tests/e2e/sidebar-session-source.e2e.test.mjs`。

## 5. 明确不做

- 不重落桌面壳补丁（`omnimux-desktop-fork/patches/dsh-better-sidebar/` 只到 0.19.1，属外部依赖）；
- 不手工编辑 `~/.omnimux-dev` 下的 profile 或 `node_modules`；
- 不改官方 DSH 源码；不动插件自身版本号。

## 6. 用户操作旅程与期望反馈

| 步骤 | 期望 |
|---|---|
| 运维在 Dev 工作树跑 `yarn omnimux:sync`（受管快照仍是 0.19.1） | 同步在写入前中止，stderr 指名「dsh-better-sidebar 受管快照版本 0.19.1 ≠ 身份声明 0.28.1」，并给出快照路径与修复方向 |
| 壳仓补齐 0.28.1 构建后重跑同一命令 | 预检通过，物化继续，`node_modules` 与快照都是 0.28.1 |
| 用户点左侧栏「资产库」 | 右侧工作台打开资产库页面（0.28.1 读 `mounted`） |

## 7. 验收用例

1. `node --test scripts/verify-profile-dependency-snapshots.test.mjs`：新增用例覆盖
   快照 0.19.1 → 硬失败并含包名/版本/路径；快照与 node_modules 都是 0.28.1 → 通过；
   profile 完全没有该包 → 不产生噪音。
2. `node --test scripts/task-runtime-install.test.mjs`：身份 = 0.28.1，studio peer 与之相等。
3. `node --test tests/e2e/sidebar-session-source.e2e.test.mjs`：实装版本 = 身份版本。
4. `bash scripts/sync-stable.sh --support-only` 类预检在漂移 profile 上退出非 0 且 stderr 含包名。

## 假设

假设 A：0.28.1 与 0.28.0 的宿主 peer 声明完全一致，因此把身份与 peer 从 0.28.0 提到 0.28.1
不会在宿主 `0.2.1-rc.3` 上产生新的 peer 缺口，也不需要重新引入 `peerExemptions`。

假设 B：Dev 受管快照被静默打回 0.19.1 的机制是「profile 用 `file:` 依赖指向快照，pnpm 按快照
版本安装」，所以只要在安装前和安装后都用身份文件比对快照与 `node_modules` 的实际版本，
就能把静默降级变成指名失败，而不需要改宿主或手工改 profile。

## 证伪方式

- 证伪 A：若 0.28.1 的 `peerDependencies` 出现 0.28.0 没有的包或区间变化（例如重新带回
  `dsh-invariants`），或 `node scripts/task-runtime-install.mjs` 的 peer 判定在宿主 0.2.1-rc.3
  上不再满足 → 假设 A 错，必须补 `peerExemptions` 或放弃本次升级。
  复核命令：解包两个 npm tarball 逐字段比较 `peerDependencies`；`node --test scripts/task-runtime-install.test.mjs`。
- 证伪 B：若把快照或 `node_modules` 之一改成 0.19.1 后校验仍返回 0 失败项，或
  `sync-stable.sh` 预检在漂移 profile 上仍继续执行 `pnpm install` → 假设 B 错，说明校验点
  放错了位置，必须改到真正决定安装版本的那一步。
  复核命令：`node --test scripts/verify-profile-dependency-snapshots.test.mjs`；
  在合成 profile 夹具上跑 `bash scripts/sync-stable.sh <plugin>` 并检查退出码与 stderr。

## 旧标准变更

- `scripts/task-runtime-install.test.mjs` :: `the shipped support package needs no peer exemption on the running host`

  原断言：`assert.deepEqual(unmetHostRequirements(manifest, hostVersion), {}, '0.28.0 satisfies the pinned host without an exemption')`——断言语义（空 unmet 集合、`supportPeerExemptionDecision(...).status === 'not-needed'`）完全不变，只有失败消息里的版本字面量需要跟随身份声明。

  必须改的理由：身份文件已升到 0.28.1，消息里仍写 0.28.0 会让失败输出指向一个已不存在的交付版本，误导排查方向。

  新期望证据：同一断言仍是「unmet 为空」，消息为 `0.28.1 satisfies the pinned host without an exemption`；`node --test scripts/task-runtime-install.test.mjs` 全绿。
