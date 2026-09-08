# Issue #778 — T01 先行交接（环境 / fixture / 四格归因 / 接口冻结）

## 结论与边界

**T01 先行范围完成并交回；全工程 IS_PASS: NO，不具备最终集成、QA 签收或真实 Dev 操作条件。**

- 固定 base/HEAD：`580234923268673562cacb5cd01aebdb780339e1`；branch `agent/common-managed-tarball-issue-778`；目标为本工作树现有未提交增量，没有新 commit。
- 全文分页读取 followup 243 行、PRD 83 行、architecture 原 316 行、总工程报告原 91 行；followup §91–99 为接口真源，§197–202 为本轮写集。旧报告的测试数字仅为历史。
- 未派代理、未直连成员；未执行 PR/push/merge/commit；未修改 T02/T03 模块和测试、dev-env/Stage/git-wt 源码、真实 Dev/Prod/官方安装或其它工作区源码；没有 Host 启动或公共 App 重启。
- `test:gates` 内 git-wt 的临时 Git 仓库/本地 remote 操作仅属于任务 TMP 内原有测试，不是任务仓库提交或远端推送。

## 本轮实际改动

| 文件 | 增量 |
| --- | --- |
| `scripts/sync-stable.sh` | 唯一普通业务修复：安装调用增加 `pnpm_config_optimistic_repeat_install=false`；仍保留原入口备份/恢复、pnpm install 参数形态与完整 fingerprint 验证，不用 force、不删锁、不手补包 |
| `scripts/sync-targets.test.mjs` | 去除个人 Corepack 绝对路径；缺失 profile 补独立 workspace；presets 测试只执行 task-owned 脚本副本，App 路径重定向到私有不存在的 Applications；新增 hoisted/isolated 平台 optional 排除与锁不变的重复刷新断言 |
| `scripts/sync-release-policy.test.mjs` | 三组复制脚本 fixture 补 archive helper；seed profile 补 workspace，原 Alpha 断言不变 |
| `package.json`、`pnpm-lock.yaml` | 根 QA 闭包直接声明已在锁中的 jsdom30.0.1、react18.3.1、react-dom18.3.1；只增加 root importer 引用，不升级现有 packages/snapshots；保留前轮 yaml2.9.0 |
| `.github/workflows/quality-gate.yml` | QA 安装闭包包含上述三个包；managed 测试使用私有 HOME/config/cache/state/store/global/TMP/Corepack、固定11.7.0并关闭自动切版/下载；不改 job/required check 判定 |
| `docs/contracts/dev-pipeline.md`、`ops-entry.md` | 受控公开 registry 私有获取＋最终 frozen offline；无新增运维 CLI；引用冻结接缝 |
| architecture / class / sequence、总工程 report | 明确 followup 冻结 API、owner 与未完成状态；本报告为先行交接，不覆写历史证据 |

本轮未修改 `sync-to-app.sh`、scope/bypass/L2 tests；它们的 dirty 增量来自前轮。`managed-tarball.mjs`、archive、materialize-graph 与 transaction tests 同样保留原前轮字节。cache/recovery 测试文件尚不存在，**没有将它们注册为已完成或最终测试**；最终 T01 接手时必须显式加入存在的文件。

## 私有环境与实际缺失闭包

证据根：本树 `.workbuddy/managed-778-t01/`。准备脚本 `setup.mjs` 与 `env.sh` 仅为任务私有复现材料，不是公开安装器。

- Node v25.8.0、Python3.14.6、`pnpm --version` 与 `corepack pnpm --version` 均 11.7.0。复制已有11.7.0到任务私有 Corepack home，私有 lastKnownGood 精确11.7.0，PATH 首位为该版本真实 pnpm shim。没有下载新 pnpm 或 workspace install。
- HOME、TMPDIR、XDG config/cache/state、npm user/global config、store/global-dir/npm cache 均在证据根。user/global config **必须是两个不同文件**，否则 npm pack 会报 `double-loading config`；初次实验因此失败，已纠正后重跑三格，旧日志不当最终结果。
- 根 `node_modules` 新增只读链接：react、react-dom、dsh-ui-kit 指向主树现有已安装包；jsdom 为前轮已有链接，已实际解析成功。没有安装/写入链接目标。Market build 仅由原 gates 触发到本任务生成物，未改插件源码。
- 第一层缺 react 修复后暴露 Market concat 缺 `dsh-ui-kit`；补只读安装闭包后四项 live/stage gates 全通过。不能写成“仅缺 jsdom”。
- CI 的 root QA 声明已补，但正式 `test:gates` CI 完整接线仍需要已有 kit 安装闭包方案；本轮没有伪装出 CI 全绿，也没有添加假的 kit stub。
- targets 原 presets 测试使用固定 `/Applications/OmniMux*.app`，仅 HOME 隔离不足。运行前改为私有副本重定向；base 原夹具仅作同等安全重定向和 Corepack 路径规范化，不对它补 workspace。未执行真实 App 物化。

## 四格对照与归因

三格使用同一任务私有工具链、同一 env、同一 TMP/store/workspace 祖先边界；base 来自 `git archive 5802349` 的任务树内部文件副本，不是 repo 外 worktree。base-fixed 与 current-fixed 使用逐字相同的修正测试文件；输入 package 内容相同，临时目录名/时间身份不同。原 fixture 9/22 是完成 config 修正后的结果；更早 8/22、10/22 混有本轮 npm config 装配错误，不用于归因。

| 格 | 实际结果（源码最小修复前） | 证据 / 结论 |
| --- | --- | --- |
| base 脚本＋原 fixture | exit1，9/22，13失败 | `base-original-2.log`；缺 workspace 的 profile 向上发现父 workspace，安装到错误根/未装预期入口；包括 default/Prod/DSH/顺序、负例及 rollback 装配问题 |
| base 脚本＋必要隔离修正 fixture | exit1，16/22，6失败 | `base-fixed-2.log`；profile workspace 边界问题消失，剩重复刷新缺入口 |
| 当前脚本＋同一修正 fixture | exit1，16/22，同样6失败 | `current-fixed-2.log`；不是新锁 runner 独有回归 |
| 纳管成功后普通命名 sync | adoption committed/0；第一次 sync0；重复 sync1，`Already up to date` 后 ENOENT，原恢复入口成功 | `fourth-run.log`、`fourth-repeat.log`；受管 synthetic `omnimux-video`，无真实 Dev。证明该普通缺陷是纳管后合法命名 sync 必经路径，满足 followup §2.1 条件性最小修复资格 |

修正夹具下相同六个失败 case：
1. broadcasts to all profiles；2. dev/prod multi-selection；3. repeated pnpm sync 保留所有 managed entries；4. full sync 同版本 kit 刷新；5. post-install fingerprint failure 恢复；6. L2 唯一在研 link 之外的包刷新。

第四格三项前/后摘要（包括失败恢复后）保持一致：
- manifest `40dd68a93dea6a8268c0cfce3173f26a8117b3a40999747f1b88913a0cea448b`
- lock `bb98f656c9a07daecc14f1812773de5ed8ff4c8b2c4c5fd66b449730e4364289`
- entry `9b12675185aed31718cb398e5d88570f79464d18a6512ee6553256433a90bb1d`

**修复依据：**固定 pnpm11.7.0 help 提供 `--optimistic-repeat-install`；实际安装实现会在 workspace freshness 为真时直接输出 Already up to date，不验证此前已移走的目标入口。关闭此快捷判断即进入正常安装，不启 force 的跨平台 optional 语义。

`reinstall-probe.json`：hoisted/isolated 各使用私有 store、offline/frozen、ignore-scripts、ignore-pnpmfile、copy；关闭 optimistic 后入口恢复、lock 字节不变、不兼容平台 optional 不安装，exit0。没有额外解析（输出明确 resolution skipped），没有删锁或复制包补洞。新增正式 targets 测试在两种布局各重复两次检查相同性质。

修复后第四格 `fourth-fixed.log`：adoption0、第一次sync0、重复sync0；三项摘要仍同上。`sync-fixed.log` 原22 targets＋8 Alpha 全30通过；新增 optional 测试后最终 gates 内 targets 与 Alpha 均通过。

## 当前验证与剩余唯一 gates 阻断

所有命令先 `source .workbuddy/managed-778-t01/env.sh`；没有通过包管理器自动修依赖。

| 命令 / 验证 | 结果 | 证据 |
| --- | --- | --- |
| `node --test scripts/sync-targets.test.mjs scripts/sync-release-policy.test.mjs`（最终文件，含 optional test） | exit0，31/31 | `sync-final.log`；较早30/30见 `sync-fixed.log` |
| `corepack pnpm --config.verify-deps-before-run=false run test:gates` | **exit1，127/128**，仅 git-wt 聚合失败；targets（含新测试）和 Alpha 通过 | `gates-final.log` |
| `node --test scripts/sync-plugin-scope.test.mjs scripts/sync-bypass.test.mjs scripts/managed-tarball-l2.test.mjs scripts/dev-env-deps.test.mjs scripts/dev-env-source.test.mjs` | exit0，28/28 | `scope-deps-final.log` |
| pnpm non-force reinstall 隔离探针 | exit0，hoisted/isolated均保持lock和平台optional集合 | `reinstall-probe.json` |
| bash/Node syntax、YAML parse、root declarations/lock 对应、`git diff --check` | exit0 | 本轮工具输出 |

唯一 gates 失败：`scripts/git-wt.test.mjs:206` 的 failing-gate fixture 自身没有 `pnpm-workspace.yaml`。在任务树内 TMP 运行时，真实 pnpm11.7.0向上发现本任务 fixture workspace，`--filter omnimux-workflow test` 输出 **No projects matched the filters** 并返回0，随后被真实 L2 gate 拒绝，断言预期的“门禁测试失败”未出现。base 脚本副本只增加错误输出后同样复现，见 `git-wt-diagnostic.log`。`npm_config_ignore_workspace=true` 探针没有解决 filter workspace 发现，见 `git-wt-ignore-workspace.log`；不是版本冲突，也不能靠忽略失败通过。

`git-wt.test.mjs` / `git-wt.sh` 不在本轮写集，未横改。**下一 owner 为主理人指定的 fixture owner**：给临时 mainRepo 和派生测试树提供独立 workspace 边界（plugins/*），确认测试真的执行 failing script，再重跑原 gates；不改真实 git-wt 交付门槛、不新增 --skip-l2、不降低断言。此 fixture 修正需要主理人明确扩展写集，不能由本轮自行接管。

## T02/T03 可直接接手的冻结接口

接口逐项保持 followup §91–99，已镜像到 architecture §3.3 和 class/sequence 图；没有实现不同API。

- **T02 归档**：保留 inspect/extract/lock/pending；`freeze(request, destination)` → entries/digest/identity（identity十进制字符串）；`safeMove(profile, txnId, from, to, expected)` → 两端身份，四项白名单/FD锚定；`probeRecovery(paths)`。不得 JSON 传可执行命令。
- **T02 图/cache**：`GraphInspector.capture({listJson})`、compare、assertRelocatable；`prepareCandidateDependencies({candidate, privateRoot, beforeLock, request, config, runPnpm}) -> {lockDigest, storeRef, acquisition}`。只写传入候选私有根，先比非目标锁后装，公开获取与最终offline同store。可以同步 capture，由T03预先 await list 获取后注入。
- **T03 runner/事务**：`runPnpm(argv, {cwd, env, signal}) -> Promise<{code, signal, stdout}>`；`ManagedSync.run/recover -> Promise<SyncResult>`。所有真实pnpm统一经该runner，固定11.7、有限输出/超时/回收；所有调用端await。
- **T03→T01恢复点**：`RecoveryInput={transactionId, sourceProfileDigest, paths[2], sha256[2], mode[2]}` → `RecoveryReceipt={batchId, verified, digest}`。T03 staging两份非秘密文件；最终T01工具capture/restore演练，未verified不得PREPARED。本轮尚无T03 staging，未伪造回执或执行共享备份。
- **公开合同**：CLI与SyncResult schemaVersion:1不变；安全输入拒绝3、前态/锁4、未发布候选失败5、提交失败已完整恢复6、恢复不确定7；check-locks exit10仅内部申请锁握手，不能当成功。当前invokeArchive全部异常映射3，T02/T03须按action/阶段正确接入测试，不能掩盖恢复错误。

### 后续范围与关闭准备度

T02 仍须实现流式冻结/FD安全、图发生实例三方核验、embedded/native、私有registry与完整cache/integrity矩阵。T03仍须实现async runner/worker回收、能力/空间前检、两文件staging、receipt压缩、全部rename与二次恢复/IO故障矩阵。它们不得把本轮普通sync30项或gates127项冒充全managed最终测试。

主理人收集T02/T03后再派T01最终集成：新增真实文件注册、backup演练、全量同状态测试、正式真实Host合成业务只读断言（当前L2只负例；旧Host仅启动不是业务证据）。A01–A08仍未全证，A09仍FAIL，A10–A12未执行。没有真实Dev修复、seed解除或#760运行恢复承诺。
