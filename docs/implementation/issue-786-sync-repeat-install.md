# Issue #786 — sync 重复安装最小修复

## 范围与身份

**工程 IS_PASS: YES — 新回归 4/4、完整顺序 Alpha 9/9、targets 22/22、最终 test:gates 132/132，全部 exit0 / 零跳过；全局 cross-file consistency PASS。独立 QA 尚未执行本次 sync 增量，此报告不等于 QA 签收、合入、激活或 Issue 关闭。**

- 固定 base/HEAD：`59c19cdfb15b20556086c2255f3e43d019d66dd4`；分支 `agent/common-non-git-guard-786-issue-786`，目标为 `.worktrees/common-non-git-guard-786` 的未提交增量。SHA 不是子目录。
- 本轮开始 main/origin/main 已为 `06dc1d6c764bec96ded2d35feaa4ff70004d39a1`，未 fetch/rebase/merge/switch/commit/push；由主理人统一 Git。
- 主理人明确授权从 #778 已获用户纳管授权内的普通 sync 修复提取到先行 #786 blocker，无需重复请求同一授权。
- 已完整读取 [guard 报告](issue-786-non-git-guard.md) 84 行、[gates alignment 报告](issue-786-gates-alignment.md) 当前完整 119 行，以及 #778 树 `docs/implementation/issue-778-t01-followup.md` 92 行。#778 只读，未复制任何 managed-tarball 模块。
- 原有 guard、Market、Alpha 源码/测试/报告 dirty 全保留；没有子代理、main hook 激活、共享依赖安装或真实 Dev/Prod 操作。

## 最小实现与行为

| 文件 | 本轮改动 |
| --- | --- |
| `scripts/sync-stable.sh:651` | 唯一生产源码增量：在原安装调用增加 `pnpm_config_optimistic_repeat_install=false` |
| `scripts/sync-repeat-install.test.mjs` | 4 个真实 pnpm11.7 离线回归：hoisted/isolated 各普通连续两次 sync、frozen 缺入口重装 |
| `package.json:48` | 原 test:gates 未纳入新文件，仅在现有命令尾追加新测试路径 |
| 本报告 | 工程证据、范围、复现及交付状态 |

原调用的 `pnpm_config_frozen_lockfile=false` 完整保留；没有新增 force、删除锁、复制依赖补入口、替换备份/恢复或 fingerprint 核验。env 仅作用于该安装命令，不向测试全局注入。生产 sync 原本允许根据 manifest 更新锁，并非 frozen 安装；独立 frozen 回归证明关闭快捷判断仍可遵循 frozen 锁及跳过解析语义，不能混称生产 sync 已改为 frozen。

新测试依赖全部为本地 `file:` fixture，独立 workspace/store、offline/ignore-scripts、pnpm11.7；不连接 registry、不模拟 pnpm 返回值。两种布局均验证真实入口内容、锁字节相等、不兼容 OS optional 顶层缺席且从插件安装路径不可解析。测试没有手工修补 node_modules；frozen 用例只暂存旧入口，恢复由真实 pnpm 执行。普通 sync 用例不注入 optimistic 设置，因此可抓到生产调用回归。

## 红绿证据

- **RED（bash-400，已收集）**：修复前新测试 4 项，2 pass / 2 fail，0 skip，exit1，4289.393792ms。hoisted 与 isolated 普通 sync 均输出 `Already up to date`、pnpm11.7 exit0，随后真实 verifier ENOENT，原恢复逻辑退出1。两个显式 frozen 非乐观用例通过。
- **GREEN**：`node --test scripts/sync-repeat-install.test.mjs` exit0，4/4，0 skip，7561.507917ms。
- **完整顺序 Alpha**：`node --test scripts/sync-release-policy.test.mjs` exit0，9/9，0 skip，46077.228959ms；原 mixed-target case 成功，未 reseed/降断言。
- **完整 targets**：在下述安全隔离适配器下 `node --test scripts/sync-targets.test.mjs` exit0，22/22，0 skip，42283.570917ms；包含重复刷新、同版本 kit、安装失败恢复、fingerprint 失败恢复、L2 唯一 link 保留和 presets 原断言。
- **最终完整 gates**：在下述安全隔离适配器下 `corepack pnpm --config.verify-deps-before-run=false run test:gates` exit0，**132/132**，3 suites，0 fail/cancelled/skip，106834.626458ms。原128项全部通过，新增4项纳入真实命令；嵌套 guard、Market/Stage、targets、Alpha 均 PASS。
- 顺序执行后台 `bash-401` 已完成并收集，exit0；所有启动的后台任务均已收集，无运行中测试。
- `bash -n scripts/sync-stable.sh`、`node --check scripts/sync-repeat-install.test.mjs`、`git diff --check` 已 exit0。

## 私有环境与安全隔离

复用工程135/138 retained root `/var/folders/s4/bq231_q12pg5k216kgk882d80000gn/T/non-git-guard-786-gates.Z5V5xt`：HOME=`home`、TMPDIR=`scratch`、XDG config/cache/state、npm user/global 两个独立配置、cache/store/global、Git ceiling 均为原私有设置。Node v25.8.0，真实 pnpm11.7.0。

只读工具链：#778 `.workbuddy/managed-778-t01/bin` 与 `corepack`；禁用 Corepack 网络、自动切版和 auto-pin。`npm_config_verify_deps_before_run=false`、`npm_config_manage_package_manager_versions=false`、`npm_config_ignore_pnpmfile=true`、CI=true。既有 root node_modules 软链未修改，未运行 workspace install。

只读 NODE_PATH kit 闭包沿用138报告：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/node_modules/.pnpm/dsh-ui-kit@file+..+..+personal+dsh-ui-kit_@deepseek-ai+dsh-client-ui-primitives@0.1.0-r_01b5a2d96805ee6fa669372349bfb5d4/node_modules`。没有 kit stub 或共享链接修复。

本机两个 OmniMux App 的实际 preset 目录存在，原 targets 直接运行会写真实 App，故不能裸跑。仅在 ignored `.workbuddy/sync-repeat-786/safe-presets.cjs` 测试执行适配器中：

1. 精确拦截原 `sync-agent-presets.sh` 的 subprocess 参数，指向任务私有副本；副本 ROOT 仍为本树，只将 `/Applications/` 字面路径映射到私有不存在的 `absent-Applications/`。
2. 精确将 targets 夹具硬编码的个人 Corepack home 替换为当前已验证的私有 Corepack home；仍运行同一真实 pnpm，没有安装参数或结果修改。
3. 保持 targets 文件及全部断言逐字不变；原生产 presets 文件未改；没有修改包安装行为、返回码、输出或测试跳过条件。适配器只用于 targets 与全 gates，独立回归和 Alpha 首轮无适配器。

本轮尝试向 retained root 新写 env.sh 被当前未合入 guard 误判拒绝；没有重试该路径或绕过拒绝。后续仅在命令进程中设置环境，日志/测试适配器置于合法任务树 ignored 路径。历史报告日志只读保留。

## 证据路径与一致性

任务私有 `.workbuddy/sync-repeat-786/`：`repeat-green.log`、`alpha-final.log`、`targets-final.log`、`gates-final.log`，以及 `safe-presets.cjs` / `sync-agent-presets.sh` 隔离材料，不纳入提交。

当前 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `scripts/sync-stable.sh` | `de2e9163193d6eb1eb0e302cd4eeb543bdf741540f5369c6140207c8228f3dd1` |
| `scripts/sync-repeat-install.test.mjs` | `5866e726750a27b321a57efb900131e6b9948a900cfcce2df42e964f500b75d3` |
| `package.json` | `0f2a2ce38bef0417a3f480ed8002bcb33baad7b19f6a6c7489aaf1d498a9e059` |
| unchanged `pnpm-lock.yaml` | `3cce2f364bcf1a547ae65f51fe566a1928a7edaa2e2db65c63908df8053d3ba2` |
| private `safe-presets.cjs` | `f6c55bb32bcd6b622f42ce432c816fe20425c2cbcc23b991e46d9c3641ae16c4` |

全局 cross-file consistency：PASS。完整 sync-stable 790 行的调用、原有备份/恢复/校验与新测试一起核查；无 API 签名或依赖变化，新测试只使用 Node built-ins，test:gates 路径真实存在。原 targets、gate aggregator、锁与 HEAD 完全一致；guard/Market/Alpha 已有增量哈希与138报告一致。最终 gates 后再次读取源码哈希，与上表及全部入场哈希一致；`git diff --check` exit0。HEAD/main/origin/main 与本轮开始相同，私有 Applications 目录仍不存在。最终工程判定 IS_PASS: YES。

## 验收边界与下一 owner

这是 standalone sync 安装行为修复。真实依赖（Bash、Node、pnpm、文件系统）由隔离 synthetic profiles 集成测试覆盖；不改 Host/UI/Electron，L2 Host/ego/Electron 对该工程增量 N/A，不冒充已通过。CI、PR、Merge Queue、Dev 物化和 main hook 生效均未执行。独立 QA 必须复核该适用性与私有适配器，不以工程自测替代独立签收。

主理人收集本报告后安排独立 sync / 最终集成 QA，保留 QA139 guard 局部结论的原边界；再统一处理 main 漂移与 Git 集成。#786 不因本轮安装修复自动关闭，#778 managed 交易与真实 Dev 验收也未完成。
