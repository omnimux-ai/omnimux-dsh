# Issue #786 — 最终集成独立 QA

## 结论

**IS_PASS: YES（仅固定基线本地集成 diff 的适用 QA）。Routing Decision: NoOne。P0 阻塞：0；本次范围内未解决源码缺陷：0。**

最终完整 `test:gates` **132/132，3 suites，0 fail/cancelled/skipped/todo，exit 0**；独立无适配器 repeat 回归 **4/4**；无适配器 Stage 合同 **10 components / 8 sidebar targets**。guard 局部 **53/53** 按相同哈希复用，不重复单跑，也不将其加算为本次 gates 直接用例数。

最多两轮已用完：第一轮唯一失败是 QA 的 Python PATH 选错导致缺少 PyYAML；第二轮只修正进程环境，完整 gates 通过。没有修改生产代码、原测试或配置，没有新增独立测试。唯一仓库交付物为本报告。没有执行 commit/push/PR/CI/Merge Queue、main 更新、hook 激活、Dev/Prod 物化或 Host/browser/Electron 验收；不能据此宣称 Issue 已关闭或 #778 已完成。

## 身份与读取范围

- 根：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/common-non-git-guard-786`。
- 分支：`agent/common-non-git-guard-786-issue-786`。
- 固定 base/HEAD：`59c19cdfb15b20556086c2255f3e43d019d66dd4`，目标为其全部未提交变更（包括已有未跟踪测试和报告），不是当前 main，也不是只审工程140的单行增量。
- 输入时主理人告知 main 为 `06dc1d6c`；本轮只读观察 main/origin/main 先前移到 `8a39dfbfc375df69be2e72845e74638c16b34da6`，交付前最终读回为 `fbaaca681fd36f2bfd3b936d19700252083ab598`。没有 fetch/rebase/merge/switch；主理人后续整合新基线时必须重新评估适用差异和证据。
- 全文读取三份工程报告：[guard，84行](../implementation/issue-786-non-git-guard.md)、[gates alignment，119行](../implementation/issue-786-gates-alignment.md)、[sync repeat，72行](../implementation/issue-786-sync-repeat-install.md)，以及[局部 guard QA，121行](issue-786-non-git-guard.md)。旧 123/128、127/128 是历史失败，不当作最终结果。
- 审查所有 tracked 完整 diff；全文读取新 repeat 测试98行、sync-stable790行、targets827行、Alpha309行、Stage capture248行、live QA240行、gate aggregator191行、安全适配器24行、原/私有 presets 各277行及相关合同。核对 Market 实际 apply、coordinator 排序/注销、相邻 rank、生命周期注册表和 PRD U10。
- `git diff --quiet HEAD -- scripts/sync-targets.test.mjs scripts/verify-ci-gates.test.mjs plugins pnpm-lock.yaml` exit 0；没有客户端变更。tracked 二进制格式 diff 的 SHA-256（`git diff --no-ext-diff --binary HEAD`）：`3068cc2a4078588d505beb7213cc031fa439a92c24cd46d72738d76ebe1d265d`。未跟踪脚本另按下表绑定，不能仅靠 diff 摘要遗漏。

## 安全适配器独立审计

**PASS（仅执行隔离，不是测试结果模拟器）。targets 及全 gates 从未裸跑。**

适配器：`.workbuddy/sync-repeat-786/safe-presets.cjs`；副本：同目录 `sync-agent-presets.sh`，两者均是工程已有 ignored 材料，本轮未改。

1. `child_process.spawnSync` 包装器只将 argv 中**精确等于本树原 presets 脚本绝对路径**的参数替换为私有副本；仍调用真实保存的 `spawnSync`，原样返回结果，没有修改 stdout/stderr/status、断言、skip、pnpm 参数或安装输出。
2. 私有副本 ROOT 仍指向本树；仅替换 ROOT 定义和 `/Applications/` 字面路径为任务目录中的 `absent-Applications/`。独立重新计算该两项变换，与副本逐字相等。原脚本仍未改。
3. 私有 Applications 在加载时及两轮结束都不存在；副本真实运行时由原 `materialize_into` 的 missing-directory 分支跳过 App 写入。私有 HOME 下 profiles/presets 逻辑仍实际执行，原 targets 断言保持不变。**这不证明真实 App 的 presets/asar/Plist 物化成功**，该不适用副作用被物理隔离；不能将“0 skipped tests”误写为所有 App 分支已运行。
4. 仅当 subprocess `options.env.COREPACK_HOME` 精确为原 targets 硬编码 `/Users/x/.cache/node/corepack` 时，替换为已验证的 #778 私有 cache。其他环境原样保留。包装器范围按路径值匹配而非检查测试文件名，在本次固定调用链中只有上述两种改写生效。
5. `syncBuiltinESMExports()` 使 ESM 导入也使用这个真实调用包装器；全 gates 的 `NODE_OPTIONS=--require=<absolute-safe-presets.cjs>` 由原 aggregator 环境继承到 nested targets。
6. 原 targets 中故障注入的 fake Corepack、stale helper、fingerprint 破坏仍是原测试设计，不是适配器造通过。新增 repeat 四项实际执行真实 pnpm11.7；它们不使用 fake pnpm。Alpha 的 wrapper 参数检查另有原有记录参数 fixture，不冒充该用例启动真实 Host。

两轮前后独立递归读取 #778 Corepack cache 和 Dev/Prod 两 App 的四个 presets 路径，以路径、mode、size、mtime、symlink target、文件 SHA-256 组成快照；均相等。不存在目标也作为 absent 记录。该快照证明被检查路径未变，不是整台机器或整个 App 所有文件的审计。未调用 App 物化入口、App 重启、共享依赖安装或 global skill 写入。

## 变更行为核定

### Market / Stage

对齐是修复失效 gate，不是降低产品要求：当前固定基线 PRD U10 要求项目→Skill工坊→发布、唯一入口、无 footer，发布保留原 Alpha 策略。实际代码 `apply.js` 的按钮使用 `addEventListener('click')`，coordinator 注册 rank 4.1，相邻项目4、发布4.2；Market 未在 Alpha 注册表。

capture 运行实际 concat 客户端和 workbench 代码，在受控 JSDOM/Host seats 中捕获真实注册，调用真实 DOM `action.click()`；检查无 footer、唯一 marker、rank、可见 single Tab、active 状态、重复打开幂等、折叠重开、会话隔离/恢复、row/Tab 注销。其余七目标的六方法及取消订阅要求仍保留；loading、失败态和 pending/pass:false 没有改成成功。新增 node_modules 只读 fixture 链接解决 esbuild 解析，不伪造导出。

这里的 DOM 事件为 JSDOM 上的生产监听器，不是 ego-browser 的真实页面点击；coordinator 排序依据实际源码另作审查，并非此 stub 运行了完整真实侧栏布局。React hooks/Host seats 原有受控替身是合同测试边界，不可称为 UI/L2 验收。注销验证限 row/Tab，未宣称全面无订阅泄漏。

### Alpha / sync 安装

- 新 workspace fixture 明确 `packages: [.]`，防止真实 pnpm 向上发现祖先 workspace。工程 boundary red 原始日志显示错误解析到 ancestor/node_modules 后 ENOENT；green1/1。该红绿为只读复核的工程证据，本轮独立执行的是最终 Alpha 完整顺序套件，不冒充独立重跑红态。
- 生产唯一新行为为 `sync-stable.sh:651` 当前安装进程添加 `pnpm_config_optimistic_repeat_install=false`。原 `pnpm_config_frozen_lockfile=false` 保留，故**生产 sync 不是 frozen 安装**；没有 force、锁删除、手补安装入口或放宽 verifier。
- 两布局 hoisted/isolated 的 ordinary 用例均实际连续两次 sync，事先删除继承 optimistic/frozen/force 设置，校验真实入口内容、锁字节不变、不兼容 OS optional 顶层缺席且从插件路径不可解析。两个 frozen 用例另行真实安装恢复暂存入口，断言 resolution skipped、锁不变、optional 仍不可解析。
- 独立 round1 新回归未加载适配器；全 gates 再次实际包含该文件。完整顺序 Alpha 和 targets 作为原 aggregator 的 nested subprocess 运行并通过，未重置混合目标历史来隐藏重复安装失败。
- 跨文件调用、原备份/恢复/入口与完整 fingerprint verifier 保持一致。没有引入 #778 managed-tarball 模块或额外生产修复。

## 独立执行结果（最多两轮）

原始输出保存在本次 DSH 工具任务 `bash-402` / `bash-403` 的完整结果中，均已 `job_output` 收集；未另写未授权日志文件。时间为 Asia/Shanghai。

| 轮次 / 命令 | exit | 实际结果 |
|---|---:|---|
| R1 `corepack pnpm --version` | 0 | 11.7.0 |
| R1 `node --test --test-reporter=tap scripts/sync-repeat-install.test.mjs`，无适配器 | 0 | 4/4；0 fail/skip；11871.174291ms |
| R1 `corepack pnpm --config.verify-deps-before-run=false run test:gates`，安全适配器 | 1 | 131/132；0 skip；142893.167583ms |
| R1 `corepack pnpm --config.verify-deps-before-run=false run verify:stages`，无适配器 | 0 | 10 components / 8 targets |
| R2 同一完整 gates 命令/同一安全适配器，只校正 Python PATH | 0 | **132/132**；3 suites；0 fail/cancelled/skipped/todo；109321.376542ms |
| `bash -n scripts/sync-stable.sh` | 0 | 语法通过 |
| `node --check` Stage capture、live QA、Alpha、repeat 四文件 | 0 | 语法通过 |
| `git diff --check` | 0 | 无空白错误 |
| 显式本地变更列表调用 `deriveImpactMatrix` | 0 | L0 required；isUiChange=false；browser not-applicable |

R1 `bash-402` 20:27:45–20:30:22；R2 `bash-403` 20:31:29–20:33:19。每轮前后14项输入哈希完全一致；Corepack/App presets 快照完全一致；私有 Applications 仍 absent。

R1 唯一顶层失败：`verify-ci-gates.test.mjs:140 agent presets splice and persona routing stay valid`；nested `verify-agent-presets.test.mjs` 为5/9，四个 YAML parse 用例均 `ModuleNotFoundError: No module named 'yaml'`。预期真实 Python 能导入 PyYAML，QA 的 clean PATH 将 `/usr/bin` 放在 Homebrew 前导致选错解释器。路由 **QA/self（执行环境，不是测试断言/源码缺陷）**。只读确认已有 `/opt/homebrew/opt/python@3.14/bin/python3.14` 与 `/opt/homebrew/lib/python3.14/site-packages/yaml/__init__.py` 后，R2 提前 `/opt/homebrew/bin`，未安装/改包、改测试或隐藏失败。R2 后退出，不存在第三轮。

最终 132 为顶层 runner 数，不能与 nested 用例直接相加。最终输出逐条显示 guard aggregation、targets aggregation、Alpha aggregation、Market 11个直接测试均通过；targets22项、Alpha9项的精确规模来自全文源码及工程独立日志，**本轮 nested 成功 stdout 被原 aggregator 捕获不透出，故不冒充另有本轮22/22、9/9独立 TAP**。它们各完整文件真实 subprocess exit0 是本轮独立证据。

## 可复现环境

工作目录固定为本树，使用 `env -i` 清除继承的 OMNIMUX/DSH/Git/npm/optimistic 配置。只设置下列进程环境，不写 env/config 文件：

```sh
QA_PRIVATE=/var/folders/s4/bq231_q12pg5k216kgk882d80000gn/T/non-git-guard-786-gates.Z5V5xt
TOOLCHAIN=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778/.workbuddy/managed-778-t01
PATH="$TOOLCHAIN/bin:/Users/x/.nvm/versions/node/v25.8.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
HOME="$QA_PRIVATE/home" TMPDIR="$QA_PRIVATE/scratch"
XDG_CONFIG_HOME="$QA_PRIVATE/config" XDG_CACHE_HOME="$QA_PRIVATE/cache" XDG_STATE_HOME="$QA_PRIVATE/state"
npm_config_userconfig="$QA_PRIVATE/user.npmrc" npm_config_globalconfig="$QA_PRIVATE/global.npmrc"
npm_config_cache="$QA_PRIVATE/cache/npm" npm_config_store_dir="$QA_PRIVATE/store" npm_config_prefix="$QA_PRIVATE/global"
COREPACK_HOME="$TOOLCHAIN/corepack"
COREPACK_ENABLE_NETWORK=0 COREPACK_DEFAULT_TO_LATEST=0 COREPACK_ENABLE_AUTO_PIN=0
npm_config_verify_deps_before_run=false npm_config_manage_package_manager_versions=false npm_config_ignore_pnpmfile=true
CI=true GIT_CEILING_DIRECTORIES="$QA_PRIVATE" PYTHONDONTWRITEBYTECODE=1
NODE_PATH=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/node_modules/.pnpm/dsh-ui-kit@file+..+..+personal+dsh-ui-kit_@deepseek-ai+dsh-client-ui-primitives@0.1.0-r_01b5a2d96805ee6fa669372349bfb5d4/node_modules
```

以上是环境值清单，重放时须 export 或作为 `env` 参数传给命令。两个 npmrc 已全文读取，均为空。Node v25.8.0、pnpm11.7.0；shim 全文2行只 exec 指定真实 Node/pnpm.cjs。root node_modules 是工程已有 #778 安装闭包软链；NODE_PATH 是现存真实 kit，无 kit stub 或共享链接修复。fixture 使用真实 local file 依赖、offline pnpm；不访问 registry。只对 gates 设置：

```sh
NODE_OPTIONS="--require=$PWD/.workbuddy/sync-repeat-786/safe-presets.cjs" \
  corepack pnpm --config.verify-deps-before-run=false run test:gates
```

**不得省掉适配器单独裸跑 targets 或本机全 gates。** shell fixture 的 Dev/Prod/L2 命名目录全部在任务私有 TMPDIR/HOME 下，不是实际部署环境。

## 最终哈希绑定

下表在入场、两轮开始/结束及最终审查绑定相同字节。tracked diff 哈希另见身份节。

| 文件 | SHA-256 |
|---|---|
| `package.json` | `0f2a2ce38bef0417a3f480ed8002bcb33baad7b19f6a6c7489aaf1d498a9e059` |
| `scripts/guard-worktree.mjs` | `2830eb4e3eccc1cae845846d3eb73c038927c5cd633172cc3c5f41e33e40ffde` |
| `scripts/guard-worktree.test.mjs` | `6355f8021706d2cb930ae73338e192cbc09fb0226a1ebb4774f055c347762002` |
| `scripts/guard-worktree.qa.test.mjs` | `5ba2b31a3202a63bec1db2201830fe917530773d30517e6218c3e53fc82004ad` |
| `scripts/live-stage-contracts.mjs` | `5b8c4f41c3564137e8e2c4e65793be1dcc647abc8ba49844329b241dd6acffaa` |
| `scripts/live-qa.test.mjs` | `6d61122aa0a43d15ae4bfb2ed755fd8c670704f869261e7920af65221f12cce6` |
| `scripts/sync-release-policy.test.mjs` | `22ef1ec394df55ffbf2e56b9fd978fb90e9518c571d8d9e3390cf39c2426d18b` |
| `scripts/sync-stable.sh` | `de2e9163193d6eb1eb0e302cd4eeb543bdf741540f5369c6140207c8228f3dd1` |
| `scripts/sync-repeat-install.test.mjs` | `5866e726750a27b321a57efb900131e6b9948a900cfcce2df42e964f500b75d3` |
| unchanged `scripts/sync-targets.test.mjs` | `6637e125be8c3b9f094350e7fe7fdef71d59923e35d2fb7b907fc0ef8df47006` |
| unchanged `scripts/verify-ci-gates.test.mjs` | `f9e41ce4ec4f5eeff6ee133fa7568f22f800d577c6d8c36477388be64d23ed0d` |
| unchanged `pnpm-lock.yaml` | `3cce2f364bcf1a547ae65f51fe566a1928a7edaa2e2db65c63908df8053d3ba2` |
| private `safe-presets.cjs` | `f6c55bb32bcd6b622f42ce432c816fe20425c2cbcc23b991e46d9c3641ae16c4` |
| private `sync-agent-presets.sh` | `e7121b7394c4d68c7ef27d96b2aa0bacc290635e9b684d81ae2c0a2b9bbb1a06` |

## 适用性、缺口与下一责任

依据 [plugin-qa 适用矩阵](../contracts/plugin-qa.md#适用矩阵) 和 [Git/PR 证据条件](../contracts/plugin-git-pr.md#证据与合入条件)，本次属于仓库 Hook / 运维安装脚本 / gate与fixture，而非 Host/插件业务运行或 Client/Stage 产品变更。风险至少 R1 不等于机械要求不相关浏览器层。

| 层 | 最终判定与边界 |
|---|---|
| 真实 Node/Git/文件系统 Hook | PASS，复用局部53/53；本轮 gates 又实际运行既有36项聚合 |
| Bash/Node/pnpm安装集成 | PASS；真实进程与合成profile检验完整安装/锁/optionals/错误恢复，未伪造 L2 |
| 全 gates / 静态Stage合同 | PASS；如上实际结果，不等于 live UI |
| L2 Host | N/A（不是 PASS）；改动不依赖 Host HTTP/RPC、启动、插件注册执行，真实运维依赖已经在隔离文件系统和真实 pnpm 中验证；启动 Host 不增加这处安装快捷判断的必要因果证据 |
| ego-browser / verify:live | N/A（不是 PASS）；无客户端改动。pending fixture 仍明确 false，不提交假 runtimeProof 或截图 |
| Electron | N/A；无 shell/platform/UI门控改动，不把文件安装布局测试当作实机壳层验收 |
| Dev/main hook 生效 | 未执行；合入后由主理人通过正常 main 更新与授权官方入口核验，不能候选覆盖main或复制到公共Dev |
| 实际 Prod/App/global skill | 未执行、未授权扩展；本报告不批准实际发布或写入 |
| CI/PR/Merge Queue/新main集成 | 未执行；主理人接手新基线整合和必要重验 |

**持续回归登记缺口（非本次 P0/放行阻塞）**：`scripts/guard-worktree.qa.test.mjs` 的17项既不在 `package.json:test:gates` 也不在 `verify-ci-gates.test.mjs`。既有36项由 aggregator 覆盖，新增 repeat4项已进入根命令。因此本次“132/132全 gates”不包含该17项。相同 guard/QA 哈希允许复用原独立53项结果；若保留此 QA 文件作为长期回归，**应由主理人/Engineer 后续将它显式纳入 test:gates 或 guard 聚合命令**，避免文件存在却从不自动运行。本轮无配置写权限，未擅改；若接入，需按实际新命令重新绑定计数和证据，不能继续宣称还是本报告的132项。

覆盖率未做行/分支统计，不给虚构百分比；未证明所有OS/全部pnpm版本或真实产品profile安装。没有剩余失败 Known Issues；安全适配器对本机依赖、App路径隔离的依赖应在后续重放时保留并重新核验。此次结果可交主理人进入后续集成，不等于可跳过新基线检查、required CI、合法合入或 #778 的备份/事务/Dev验收责任。
