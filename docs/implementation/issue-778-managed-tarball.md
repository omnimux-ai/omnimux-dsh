# Issue #778 managed tarball 实施记录

## T01 先行补工更新（2026-09-08）

**总体仍 IS_PASS: NO；本次只完成基础设施、fixture、四格归因与接口冻结，不是最终集成。** 最新有限结果见 [T01 交接](issue-778-t01-followup.md)，下文旧计数保留为历史，不与新结果拼接。

- base原fixture9/22；base/当前同修正fixture均16/22且同六失败，定位普通pnpm optimistic重复安装快捷返回。纳管后第一次命名sync0、重复1复现同一缺陷；按followup条件只关闭 optimistic-repeat-install，保留锁/恢复/fingerprint，不用force或补包。修复后原targets22＋Alpha8全30通过，新增平台optional/锁不变测试后gates的targets与Alpha均通过。
- QA闭包实际补react/react-dom与只读已安装kit；固定私有pnpm11.7.0与HOME/config/TMP/store。最新真实 `test:gates` **127/128，exit1**；唯一git-wt fixture向上发现父workspace导致No projects matched，属于本轮写集外fixture，交主理人指定owner，不改门槛或断言。
- scope/bypass/原dev-env source/deps/L2负例28/28 exit0；真实Host业务断言、T02/T03修复、最终managed测试与backup演练均未执行。A09仍FAIL；A10–A12未执行，未真实Dev/Prod/官方操作、PR/push/commit或重启。
- 冻结API以followup§91–99为准，已镜像architecture和图；缺失cache/recovery测试未冒充最终注册。T02/T03可据此开工，待主理人后续派工。

## 当前阶段（前轮历史）
- 工程交接 **IS_PASS: NO**；尚未完成全部设计与集成验收，不得运行真实 Dev。
- 已读取 PRD、架构、class/sequence、相关合同及现有 sync；部分长输出发生截断，不能声称全文无遗漏核验。
- 全量新测试一次55/55通过（exit0）；后续冻结输入修订定向2/2、安全/锁32/32通过，尚未在最终修订重新跑完整事务套件。所有本轮后台测试已收集。
- 依赖：Node25.8.0、Python3.14.6、corepack pnpm11.7.0；本任务 node_modules 仅链接现有 acorn/esbuild/pngjs/yaml，只读消费，未运行 workspace install。
- 当前代码仍有事务完整性待证实，测试通过前不宣称A04–A09完成。
- 新增实证：真实 pnpm hoisted/isolated 完整payload纳管及files过滤拒绝3/3；事务故障19/19；搬迁冻结重建及INT/TERM/KILL提交中断恢复4/4；命名scope+bypass+原dev-env拒绝15/15。
- 普通targets回归尚有10项失败（12通过），pnpm11.7删入口后重装显示Already up to date但入口缺失；这段普通业务代码未改变，不为本任务扩大刷新方案。另有嵌套TMPDIR触发父workspace问题，部分fixture补workspace后恢复。
- `pnpm test:gates` 首次包装器自动安装失败，固定corepack/禁止自动deps后真正执行测试但缺jsdom与旧sync/Alpha fixture失败；不冒充门禁通过。
- 首次正式fork `yarn omnimux:dev start`：synthetic seed通过原严格来源/锁校验，真实DSH_SRC安装闭包通过；pnpm重建因目标fixture带install脚本却未声明ignoredBuiltDependencies失败，exit1，未创建L2 profile。后续新建无lifecycle、合法overlay的独立fixture已启动真实Host；不修改旧seed伪装。
- 唯一源码写范围：本工作树 `.worktrees/managed-tarball-778`。
- 分支 `agent/common-managed-tarball-issue-778`；核验 HEAD/base 均为 `580234923268673562cacb5cd01aebdb780339e1`。
- 接手时仅有四份未跟踪设计文档，保留原文不覆盖。

## 目标与边界
- 按 PRD、架构及 class/sequence 全文实施既有 sync-to-app → sync-stable 的互斥单 tarball 纳管模式。
- 不修改官方 DSH、真实 Dev/Prod、其他工作树；不 commit/push/PR/merge；不默认重启 App。
- 测试临时目录、候选 profile/store 置于本任务树；合成 seed/L2 必须显式标记 synthetic，经未修改 dev-env 校验。
- 验证失败留真实证据，不以设计审阅或单元测试替代 Host/L2。

## 阶段与下一步
1. T01 基础配置与入口：已实施，CI测试注册已写；CI未运行。
2. T02 安全归档与图检查：已实施并有局部验证，尚缺pnpm list闭包交叉核验/完整native/cache实证。
3. T03 候选事务与恢复：已实施并有真实pnpm/rename/信号恢复证据；前置恢复可行性、子进程回收和完整故障矩阵仍不完整。
4. T04 交付：真实合成L2启动成功，但业务集成断言缺失；test:gates失败；工程总体 **IS_PASS: NO**，不具备合并或真实Dev执行条件。

## 实际文件
- 修改：`package.json`、`pnpm-lock.yaml`、`.github/workflows/quality-gate.yml`、`scripts/sync-to-app.sh`、`scripts/sync-stable.sh`、`scripts/sync-plugin-scope.test.mjs`、`scripts/sync-bypass.test.mjs`、`scripts/sync-targets.test.mjs`、`docs/contracts/ops-entry.md`、`docs/contracts/dev-pipeline.md`。
- 新增：`scripts/managed-tarball.mjs`、`scripts/managed-tarball-archive.py`、`scripts/materialize-graph.mjs`、三份 `managed-tarball*.test.mjs` 和本报告。
- 四份设计保持原文；`scripts/dev-env.sh`、resolver、官方Host、其他workspace、真实Dev/Prod未修改；无commit/push/PR。

## 全局一致性审查（工程，不是独立QA）
结论 **IS_PASS: NO**。第一轮联合审查修复了 target locator带包名前缀/目录锁省略version、Bash空数组、输入inode复核、journal精确move白名单及candidate fsync；第二轮仍有以下必需问题，停止扩大改动并回传主理人：
1. 普通sync现有删除file安装入口后pnpm11.7返回Already up to date，入口缺失；targets 12/22，需主理人判断最小修复是否属于现有链缺陷并协调设计，不改锁过滤/补拷绕过。
2. `sync-release-policy.test.mjs` 复制脚本fixture未带新archive helper，导致两项新增回归；文件不在架构列写集，本轮未改，需主理人批准必要fixture增量。其余Alpha pnpm失败与父workspace发现相关。
3. 图检查尚未按设计用pnpm list JSON与锁做完整交叉验证；内嵌payload/node_modules与安装依赖目录的区分不完整；name/lock完整一致性应强化。当前仅真实file依赖+peer/hoist样本证实，不足泛化287包图。
4. 私有store仅离线新建，缺从只读cache校验复制必要registry对象的实现，因此真实Dev有registry依赖时会前置失败。不能上线试装。
5. 首次写入前同文件系统/恢复权限/全图空间估计、非秘密manifest/lock的agent-backup恢复演练未完成。已加载agent-backup skill，但其Git worktree默认写主checkout backup库超出本次唯一写范围，未调用capture越界。
6. SIGINT/TERM在提交点有明确恢复证据；准备期间pnpm子进程终止回收、恢复器二次中断、ENOSPC/fsync失败、journal损坏及每个rename前后完整矩阵未全。实际恢复不承诺掉电/硬件损坏。
7. journal PREPARING阶段保护数据漂移会返回recovery-required且保留数据，不覆盖外部改动；terminal receipt目前保留完整图，后续需压缩到小型脱敏receipt并补cache引用说明。
8. 安全helper目前内存解码（有544MiB硬上限），不是设计流式decode；输入冻结追加有上限检查但读取方式需要进一步严格流量边界。目标祖先inode长期持有/提交窗口TOCTOU仍需专门测试。
9. 真实Host有进程/监听/装配日志，但合成包只包含静态入口/空patch，尚无独立业务RPC/HTTP返回，不以HTTP200代替A09。

## A01–A12工程状态
| ID | 状态 | 实证与缺口 |
|---|---|---|
| A01 | 部分PASS | missing/conflict参数、显式target、公开fork幂等链成功；完整main/别名/多目标负例未穷尽 |
| A02 | 部分PASS | hash/name/version、duplicate JSON、inode替换有负例；事务中所有漂移点矩阵未全 |
| A03 | 部分PASS | 32安全/锁测试，路径/链接/特殊/大小写NFC/截断/限额；流式与祖先TOCTOU仍欠 |
| A04 | 部分PASS | scoped完整archive/source/installed、隐藏/test/模式、peer/bundle保持，hoisted/isolated成功；embedded node_modules/native未全 |
| A05 | 部分PASS | pnpm生成锁、offline搬迁且删除原input/profile后重建通过；registry cache复制欠缺 |
| A06 | 部分PASS | 同合成图全部nodes/edges/可见解析与protected哨兵比较；复杂pnpm全图证据不足 |
| A07 | 部分PASS | unchanged no-pnpm、冲突/不合规输入实现、原dev-env严格负例；kit与完整非目标故障矩阵欠 |
| A08 | 部分PASS | 14阶段故障、INT/TERM/KILL提交点恢复、前图复核；准备kill/恢复中断/磁盘/损坏日志未全 |
| A09 | FAIL | 真实synthetic L2启动成功；业务集成证据缺失；test:gates121/128、普通targets12/22，未全通过 |
| A10 | 未执行 | 待工程补齐→独立QA→CI/PR/MQ，由主理人负责 |
| A11 | 未执行 | 合并后协调真实Dev窗口与新前态；本轮未读取真实Dev |
| A12 | 未执行 | 合并后正式指定viewer修复与真实seed/L2；synthetic不是真实修复 |

## 下一动作与owner
主理人先审上述源码/设计差距，补派同一工作树工程定向修复（不得发布当前候选），尤其registry cache与完整图/恢复，以及必要Alpha fixture授权；再交独立QA。没有后台继续编码承诺；任务私有L2已通过正式stop停止（exit0），保留证据和fixture供后续工程读取。

## 验证记录
- `pwd; git status --short; git branch --show-current; git rev-parse HEAD`：exit 0；目录、分支、base 匹配。
- 历史检索确认 #778 是解除其他 Issue 环境依赖的独立任务；历史记录不作为当前测试证据。
- 以下本地测试环境均设 `TMPDIR=$PWD/.workbuddy/managed-778/tmp`；需要Git隔离时设 `GIT_CEILING_DIRECTORIES=$TMPDIR`。证据目录 `.workbuddy/managed-778/`。
| 实际命令 | 退出码 / 结果 | 证据 |
|---|---|---|
| `corepack pnpm@11.7.0 --config.verify-deps-before-run=false run test:managed-tarball` | 0；55/55，冻结输入最终修订之前 | managed-final.log |
| `node --test scripts/managed-tarball.test.mjs` | 0；32/32 | archive-lock-final.log |
| `node --test --test-name-pattern='real pnpm hoisted\|source-prepare' scripts/managed-tarball-transaction.test.mjs` | 0；2/2，冻结输入修订之后 | freeze-recheck.log |
| `node --test --test-name-pattern='SIG\|relocated' scripts/managed-tarball-transaction.test.mjs` | 0；4/4 | interruption.log |
| `node --test scripts/managed-tarball-l2.test.mjs scripts/sync-plugin-scope.test.mjs scripts/sync-bypass.test.mjs` | 0；15/15 | scope-l2.log |
| `node --test scripts/sync-targets.test.mjs` | 1；12/22，10失败 | targets-3.log |
| `pnpm test:gates` | 1；包装器自动依赖安装触发kit ENOENT，未完成测试 | earlier gates log |
| `corepack pnpm@11.7.0 --config.verify-deps-before-run=false run test:gates` | 1；121/128，7失败 | gates-final.log |
| `node scripts/verify-plugin-boundaries.mjs` | 0；2119源文件 | 工具输出 |
| `node --check scripts/managed-tarball.mjs`、`node --check scripts/materialize-graph.mjs`、`bash -n scripts/sync-to-app.sh scripts/sync-stable.sh`、`git diff --check` | 0 | 工具输出 |
| 公开fork `corepack yarn omnimux:sync` +四身份参数+精确synthetic task target | 0；unchanged，changedPaths为空 | public-sync.log |
| 公开fork `corepack yarn omnimux:dev start managed-tarball-778-real-l2 omnimux-video --source=<本任务树>` | 0；新seed严格克隆/冻结重建/Host启动；前三次fixture尝试exit1，均保留 | real-l2-4.log / real-l2-running.json |
| 公开fork `corepack yarn omnimux:dev stop managed-tarball-778-real-l2` | 首次1（遗漏COREPACK_HOME）；恢复既有缓存后0 | real-l2-stop-2.log |

### 真实Host证据与限制
- DSH_SRC=`/Users/x/Desktop/Project/Github/deepseek-harness`，只读安装层投影；无官方源码修改。
- synthetic task=`managed-tarball-778-real-l2`；SOURCE=`<本任务树>/plugins`；commit=`580234923268673562cacb5cd01aebdb780339e1`。
- profile=`<本任务树>/.workbuddy/managed-778/tmp/managed-transaction-wv59PE/hoisted/.dsh-dev/tasks/managed-tarball-778-real-l2/profiles/omnimux-dev-managed-tarball-778-real-l2`。
- 启动时间2026-09-08 15:34:57，PID52064，127.0.0.1:44201真实LISTEN，日志仅脱敏`dsh web`启动行；已stop。
- 仅证明Host启动与原严格seed重建，不证明合成viewer服务注册/业务返回。browser/Electron N/A（仅脚本/合同，无UI或壳行为变化）；业务HTTP/RPC仍是必需缺口，不标PASS。
- 无插件源码修改，不执行全产品build；正式L2启动触发既有单插件watch，不代表完整build门禁通过。未执行真实Dev修复或公共App重载。
