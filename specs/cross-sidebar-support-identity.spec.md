# 侧边栏 support 包身份单一真源（Issue #3766）

- 任务：`.worktrees/cross-sidebar-support-identity`（分支 `agent/cross-sidebar-support-identity-issue-3766`，基线 `origin/main` @ `a2a3c5286`）
- 日期：2026-10-25
- Issue：#3766（`type: fix`、`track: D-patch`、`risk-tier: R1`）

## 1. 问题

同一台机器上跑着两个不同版本的 `dsh-better-sidebar`，而且没有任何测试会发现这件事。

| 现象 | 现状 | 根因 |
| --- | --- | --- |
| Dev/Prod profile 实装 0.19.1 | `~/.omnimux-dev` 与 `~/.omnimux` 的 `.materialize-snapshots/plugins/dsh-better-sidebar/package.json` 是 `0.19.1`，`omnimux-build.json` 记录 commit `8753096a`、patchSha256 `d608b3ee` | 壳仓 preset 产物（`better-sidebar-source.md` 契约） |
| 插件仓声明 0.18.0 | `plugins/omnimux-studio/package.json:41` peer 与 `scripts/task-runtime-install.mjs:161` 门禁都写死 `0.18.0` | 版本字面量没有单一真源，散落 6 处 |
| 打包任务运行时拿到 0.18.0 | 任务图含 `omnimux-assets` / `omnimux-workflow` / `omnimux-automation` 时，support 包从 `plugins/omnimux-studio/node_modules/dsh-better-sidebar` 复制进任务沙箱 | 门禁只认 `0.18.0`，与 profile 实装版本无关联 |
| e2e fixture 已失效 | `plugins/omnimux-workflow/tests/e2e/asset-subject-import.e2e.test.mjs:27` 硬编码 pnpm store 路径 `dsh-better-sidebar@0.18.0_3339db82…` | 当前检出的真实哈希是 `08c0f89b` / `9ba3470c`，该路径根本不存在 |

字面量清单（本 Issue 要收口的 6 处）：`plugins/omnimux-studio/package.json:41`、`scripts/task-runtime-install.mjs:161`、根 `pnpm-lock.yaml`、`plugins/omnimux-studio/pnpm-lock.yaml`、`plugins/omnimux-workflow/tests/e2e/asset-subject-import.e2e.test.mjs:27`、`plugins/omnimux-studio/README.md:7`。

## 2. 设计（本规格的真相源）

1. **单一真源**：新增 `scripts/sidebar-support-identity.json`，记录 name / version / repository / commit，以及核对时 profile 实装构建的 `shippedBuild`（presetPatchSha256、pinnedLockSha256、verifiedAt）与 `ownership`（壳仓契约与构建器路径）。
2. **门禁读真源**：`scripts/task-runtime-install.mjs` 导出 `readSidebarSupportIdentity()` 与 `assertSidebarSupportIdentity(manifest, identity?)`，support 包校验改为与真源逐字段比对，取代 `!== '0.18.0'`。身份不符仍然 fail loudly（`INSTALL_SUPPORT_REQUIRED`），不降级、不静默跳过。
3. **声明对齐事实**：`plugins/omnimux-studio` peer 由真源版本驱动（本次 0.18.0 → 0.19.1），锁文件由 `pnpm install` 重算，不手改。
4. **漂移守卫**：`scripts/task-runtime-install.test.mjs` 断言 `identity.version === omnimux-studio.peerDependencies['dsh-better-sidebar']`，并断言身份不符时 `assertSidebarSupportIdentity` 抛错。任一侧单独改动都会红。
5. **脆弱路径消除**：workflow e2e fixture 改用 `createRequire(...).resolve('dsh-better-sidebar/package.json')` 动态解析，找不到时 fail loudly。
6. **归属可查**：`docs/contracts/workbench-split.md` 增一句指针，指向身份文件与壳仓的 pin/patch/构建契约；`plugins/omnimux-studio/README.md` 不再复述版本号。

## 3. 产品基线

新用户基线：装完官方 DSH 与 OmniMux 后，`dsh-better-sidebar` 由预设随包提供，用户不需要任何本地路径或开发机状态。本改动不引入任何开发机专属默认值：身份文件是仓库内相对路径，门禁读的是脚本自身目录，e2e fixture 缺包时抛错而不是回退到某台机器的 store 哈希。缺 support 包时行为不变——`INSTALL_SUPPORT_REQUIRED` 硬失败。

## 4. 非目标

- **本 PR 不改 `plugins/omnimux-workflow/tests/e2e/asset-subject-import.e2e.test.mjs`**：`scripts/guard-anti-cheat.mjs` 对该文件硬拒任何 edit/write（`runtime-code-execution-import-needs-review`，因为文件 import 了 `node:child_process`；实测连 no-op 都拒），且该原因不在可声明放行的集合里。它属于"既有测试标准变更须独立审查"的通道，需要独立评审，不由本任务擅自改写。证据与后续见 §8。
- 不扩 `scripts/managed-tarball.mjs` 的授权（其 target 仅 dev、授权限 `@crosery/dsh-viewer@0.1.0`）；"真受管纳管"另立 Issue。
- 不改壳仓 `patches/dsh-better-sidebar/**`、`build-patched-sidebar.ts`、preset 目录。
- 不 fork / 不 vendor 侧边栏，不新建自有侧边栏插件。
- 不升上游 0.28.0（需同时动 harness pin，属 RC 升级）。
- 不动官方 DSH、其它 profile、主检出里他人未提交的改动。

## 5. 假设

假设根因是"版本字面量没有单一真源"而不是"某人忘了升级"：如果只是漏升级，那么把 peer 改成 0.19.1 就够了；但门禁、锁文件、e2e fixture 与文档会各自再次分叉，因为没有任何一处把"当前应有的身份"记下来。因此把身份收敛到一个文件、让门禁与测试都读它，才能同时修掉"任务沙箱跑旧版"和"fixture 硬编码哈希"两个症状。另一个假设：0.19.1 与 0.18.0 在插件实际使用的 `ctx.betterSidebar` 面（registerTab / openTab / closeTab / getSnapshot / fileViewer）上没有破坏性差异——运行环境本来就已经在 0.19.1 上跑这些插件。

## 6. 证伪方式

若假设错误，会出现以下可观测结果，任一成立即推翻：

1. **升级其实会破坏插件**：把 peer 升到 0.19.1 后 `pnpm --filter omnimux-studio test` 或 `pnpm verify:stages` 红，说明 0.18.0 → 0.19.1 在这个面上不是无害对齐。
2. **单一真源没起作用**：把 `scripts/sidebar-support-identity.json` 的 version 改成 `0.0.0`（或把 studio peer 单独改成别的版本）后，`node --test scripts/task-runtime-install.test.mjs` 仍然全绿——说明守卫没有真正读真源。
3. **门禁没有读真源**：把 support 包 fixture 的 version 改成与真源不符，`assertSidebarSupportIdentity` 不抛 `INSTALL_SUPPORT_REQUIRED`。

复现与验证命令：

```bash
cd .worktrees/cross-sidebar-support-identity
node --test scripts/task-runtime-install.test.mjs          # 红→绿两次记录
pnpm --filter omnimux-studio test
pnpm test:gates
pnpm verify:plugin-load && pnpm test:plugin-load
node scripts/impact-matrix.mjs --git-diff --base origin/main
```

## 7. 验收

- [ ] 身份真源文件存在，且 studio peer 与它逐字一致（守卫测试覆盖）。
- [ ] `assertSidebarSupportIdentity` 对错版本/错包名抛 `INSTALL_SUPPORT_REQUIRED`（守卫测试覆盖）。
- [ ] 两个锁文件由 `pnpm install` 重算后解析到真源版本。
- [ ] 按 `docs/contracts/plugin-qa.md` 选型的最小命令集执行并记录真实用例数、skip 与退出码。
- [ ] 独立评审（实施者之外）核对 diff、证据与授权状态。

## 8. 残留与证据

1. **冻结的 e2e fixture**：`plugins/omnimux-workflow/tests/e2e/asset-subject-import.e2e.test.mjs:27` 仍硬编码 `node_modules/.pnpm/dsh-better-sidebar@0.18.0_3339db82…`，而当前检出的真实目录是 `…@0.18.0_08c0f89b…`（根 workspace）与 `…@0.18.0_9ba3470c…`（studio workspace）——该路径本来就不存在。修复它需要走独立评审通道（`guard-anti-cheat` 硬拒本任务的编辑），因此另立 Issue 跟踪，不在本 PR 内改。
2. **壳仓 patch 在飞改动**：壳仓 `patches/dsh-better-sidebar/0.19.1/omnimux.patch` 在核对后仍有未提交修改（哈希由 `d608b3ee` 变为 `f759291a`），因此身份文件里的 `presetPatchSha256` 只描述核对时 profile 实装的那份构建，不冒充壳仓 patch 的当前哈希。
3. 本任务不改变 profile 实装版本；`~/.omnimux-dev` / `~/.omnimux` 仍是壳仓 preset 产出的 0.19.1 补丁构建。
