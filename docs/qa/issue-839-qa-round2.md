# #839 第二轮独立 QA

## 结论与 Route

**IS_PASS: YES（仅固定未提交树的工具级验收）。Route: NoOne（E1/Q1 已关闭，无新增生产缺陷）；集成未决交主理人/Engineer。**

允许进入后续 Git 集成准备，不代表最新 main 上可直接合并、required CI 已通过、Dev 已转换、真实 Host/L2 或 #765 ego 已验收。Alpha fixture 与最新 main 有三处真实文本冲突，须在集成修订中消解并验证，不能直接把本报告复用为集成后修订的通过证明。

- 审查 base/HEAD：`867b192ecf6aa35be4e1639db7351a89bea782c7`，目标为用户固定的 13 文件未提交树。
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/common-viewer-managed-upgrade-839`。
- 只读 fetch main 后使用的比较 SHA：`e3f71ae6097c49ed507130d7ece566f73ad78386`。
- 已读原 QA、工程返修报告、repair-integrity、E1 红测原始日志、源码及两处 fixture。13 项 hash/mode 前后不变，验证副本全量 tracked 文件与原树逐字节一致；git diff --check exit0。
- 未修改任何生产或测试代码，未 commit/push/merge/rebase/Dev/外仓写，未再委派。新增仅本报告和 ignored 执行日志。

## 本岗实跑证据

| 检查 | 本轮实际结果 | 原始日志 |
| --- | --- | --- |
| source 五类 + 原样 QA 三例，初次环境尝试 | 8 tests / 0 pass / 8 fail；均 fixture 的 symlink ancestor，未进入转换；exit1 | `.workbuddy/qa-round2-source-public.log` |
| 同一专项，修正 canonical TMPDIR 后第二次执行 | **8 / 8 pass / 0 fail / 0 skip/cancel/todo，140587.633625ms，exit0** | `.workbuddy/qa-round2-source-public-final.log` |
| `pnpm test:managed-tarball:unit` | **71 / 71 pass / 0 fail / 0 skip/cancel/todo，38126.896ms，exit0** | `.workbuddy/qa-round2-unit.log` |
| 验证副本 `pnpm test:gates` | **149 / 149 pass / 0 fail / 0 skip/cancel/todo，4 suites，157338.207916ms，exit0** | `.workbuddy/qa-round2-gates.log` |

以上最终结果为本岗执行，不引用工程结果充数。149 是外层 tests，包含 guard、target-selection、Alpha 子进程聚合与16项 non-Git QA；不称作149个穷尽叶子。子进程成功 stdout 不在聚合日志展开，因此不伪称本岗另行得到 Alpha9/9、guard36/36 的叶子原始输出。工程 Alpha9/9、10/10 source+相关回归仍属已读工程证据。原174是旧实现历史，本轮按要求不重跑20分钟 transaction/recovery/T02，不计入当前总数。未测代码覆盖率，不虚报百分比。

专项命令：

```bash
source .workbuddy/qa-env/env.sh
export TMPDIR="$(python3 -c 'import os; print(os.path.realpath(os.popen("getconf DARWIN_USER_TEMP_DIR").read().strip()))')"
node --test --test-name-pattern='839 final source|QA839' scripts/issue-839-source-verification.test.mjs scripts/issue-839-independent.qa.test.mjs
```

不匹配的 imported transaction 测试没有执行，不能加入8项结果。最多两次专项尝试，未进入第三轮。

## E1 与恢复语义

1. 工程 `.workbuddy/source-red.log` 明确给出旧实现 source-only bytes 漂移后 `COMMITTED/code0`，且 failing assertion 为 `notStrictEqual(committed)`；这是工程动态红证据，本岗未反向修改生产重跑红测。
2. `managed-tarball.mjs:675–676` 在原 installed graph、relocatability、protected guard 后且 afterDigest/COMMITTED 前，重新读取 source 完整 `payloadManifest(...).entries` 与冻结批准归档 `this.payload.entries` 对照。没有 exclusion、catch 或删除原 guard。普通 payload entries 包含路径、type、size、0o777 权限及 SHA256，隐藏/test 子项不省略；不将此描述为对 root inode 或全部特殊权限位的额外新保证。
3. 独立实跑 bytes/mode/type/extra/missing：installed/index.js 保持正确839字节；五例均 `recovery-required/code7`、journal `RECOVERING`、afterDigest null，外部漂移保留。owner 消除漂移后显式 recover code0，source 恢复778字节，journal `ROLLED_BACK`。未把无法确认所有权的外部写强行覆盖，未把部分恢复称为完成。
4. 原 QA 文件完全原样：真实子进程在 `after-rename-2` 和 `after-rename-8` SIGKILL，移除新旧 tarball 和 QA receipt，再走 `bash scripts/sync-to-app.sh --recover-managed-tarball=... --target=...`；两次均完整恢复独立递归 bytes/modes/links 快照及 `ROLLED_BACK`。oracle 使用 fs.lstat/readlink/SHA256，不借生产 GraphInspector/payloadManifest 计算预期。
5. 公开正向提交后移除 tarballs，再公开 recover：返回成功且完整快照保持新代，不退版。COMMITTED recover 是清理终态，不是 reverse transition。显式 reverse 仍须绑定原 forward receipt；此数据流静态复核，并沿用工程当前相关回归证据，不宣称本岗另跑 reverse。
6. 最终读回不构成对非协作 writer 永久禁止写的文件系统原子性保证；协调窗口仍适用。新两行有效补上 E1 指定的 live-verify 检查点反例。

## 两处 fixture / main 集成核对

### guard-worktree.test.mjs

唯一变更是 `.guard-fixture-*` 从 scripts 祖先 Git 范围移到 `tmpdir()/guard-fixture-*`。保留实际 git init、commit、registered worktree、fake metadata 拒绝及 protected 写保护断言；没有改 guard 或设旁路。canonical 系统根不含 tmp/temp/.tmp/.cache 路径组件，non-Git QA 明确断言 git rev-parse exit128，故不是靠 ephemeral 豁免让保护测试变绿。main 对此文件没有相对固定HEAD的变动，三方 merge-file exit0。

### sync-release-policy.test.mjs

`seedProfile` 固定真实 `pnpm@11.7.0`，三个 wrapper runner 创建真实 main 提交并对齐 refs/remotes/origin/main。保留原行为/拒绝/哨兵断言，未新增 unmerged bypass、伪造 Git 命令或改生产 sync 保护。mixed-wrapper 的下游参数记录 stub 原来就存在，只证明参数转发，不把它当真实安装；其余相关场景真实离线安装。

最新 main 已有 `initCleanMainRepo`（含隔离系统/global Git config）及 alias/mixed 两处调用。本树使用 `commitRunner`，另有 malformed-registry runner 调用和 packageManager 固定。使用任务 ignored 临时文件运行 `git merge-file --stdout ours base main`，**exit3，三处冲突**：helper 定义、alias runner 调用、mixed runner 调用。未改真实 index/worktree，未执行实际 merge。

**下一 owner：主理人/Engineer。** 集成时采用 main 单一 helper，保留本树 packageManager 固定和 malformed-registry 初始化，将第三处调用也统一到该 helper，避免重复定义/重复 init 或丢掉最新 main 的 config 隔离；然后在最终集成修订重跑 Alpha、guard 和 required gates。此为具体集成未决，不是 E1 修复失败。本岗固定树范围不消解冲突。

## 环境与证据边界

复用既有 `.workbuddy/qa-env/env.sh`、私有依赖/node_modules、Corepack 11.7.0 cache、私有 HOME/XDG；不重装依赖，不改共享 store。PATH 保留 `/usr/sbin` 的 lsof；COREPACK_ENABLE_NETWORK=0、AUTO_PIN=0、DEFAULT_TO_LATEST=0，npm_config_offline=true，pnpm_config_verify_deps_before_run=false。后者避免 pnpm 启动自动依赖重建，不跳过测试断言。Node25.8.0、已有 Python 环境。

原 env.sh 的 TMPDIR 在仓内，不适用于 non-Git gate；第一次取 getconf 得 `/var/folders/...`，因 macOS /var -> /private/var 被生产 assertPath 正确拒绝。第二次用 realpath 得 `/private/var/folders/s4/bq231_q12pg5k216kgk882d80000gn/T`，只修环境、不放宽符号链接检查。测试临时 profile 为 synthetic、自清理，未写实际 Dev/Prod。

所有后台 job 已收集终态：bash-170 exit1（环境失败保留）；bash-172/173/174 exit0。无本岗遗留 job。

## 哈希封存

13项完整 hash/mode 以已独立重算一致的 `issue-839-repair-integrity.json` 为输入清单，文件本身 SHA256：`57adf1b49c3486d24987c5bbbfe5be13a2c7dfd63a09ac49892b6795985ffa57`。

| 输入 | SHA256 | mode |
| --- | --- | --- |
| scripts/managed-tarball.mjs | b82bb29514783d2eb3e97b26a31e3c85b91cbfeabc1844902731fd3659fa1ed5 | 0644 |
| scripts/issue-839-source-verification.test.mjs | 176af238009f79cff2f0bd67f8845c5900fff25067aa09afada1ea13953a4ef0 | 0600 |
| scripts/issue-839-independent.qa.test.mjs | bfcba01c30f491fb2456a3f8102f0849a3618edde2b836d3c55d418cec1cdf36 | 0600 |
| scripts/guard-worktree.test.mjs | c3fc51bf2ed0db26e127b84ef50df50532c0118d1bf983d3c0e462d16969775a | 0644 |
| scripts/sync-release-policy.test.mjs | 7a4a09e75a46b2e0063f11899e4aa00276628865832500fd2b8f81c72772e75f | 0644 |

| 本岗日志 | SHA256 |
| --- | --- |
| qa-round2-source-public.log | 43c4fb2397a4c81c7f6c696411e5fea25f6bae19f1a220e24432b0f640c67257 |
| qa-round2-source-public-final.log | df0a1cadaed5c160896062be5413d8a6e5e0d8d29990b0e7626e3e14aa1f5a49 |
| qa-round2-unit.log | 5af64e6b8793a8eca724d0435a7d56a650dad8f786e79655cf17ded96c20141f |
| qa-round2-gates.log | c7635a2f13e7eff6bcea73275ee821c132877b4bc0478179d3eb45651c53c13f |

## 放行边界

E1/Q1 工具级验收完成，无待返修生产缺陷。主理人仍负责上述 fixture 集成冲突、最终修订 required CI，以及任何后续获授权的 Git/MQ 步骤。真实转换需要原0.1.0 tgz、真实receipt/live graph、正式release报告及相应Host/L2/#765 ego证据；本报告不能替代，亦不授权 Dev 或生产写入。
