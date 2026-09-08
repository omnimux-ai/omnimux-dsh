# Issue #778 T03 — 共享前置解除后的有限恢复验证

## 状态与范围

**本轮事务/恢复矩阵局部 IS_PASS: YES（最终65/65）；T03整体 IS_PASS: NO。不是独立QA签收。** 第一轮原有完整 transaction/recovery 45/45；新增定向诊断3项有2个真实失败，已修源码，第二轮完整65/65，未第三轮。T03 原 no-pnpm 与准备写 FD 合同缺项未被放宽，#778 整体仍不具备关闭、合入或真实 Dev 操作条件。

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778`。
- base/HEAD：`580234923268673562cacb5cd01aebdb780339e1`；审查对象是指定本地 dirty 状态，未 fetch/rebase/commit/push。
- 本轮仅修改 `scripts/managed-tarball.mjs`、`scripts/managed-tarball-transaction.test.mjs`、`scripts/managed-tarball-recovery.test.mjs`，新增本报告。
- 已完整读取 architecture329行、followup243行、T03旧报告108行、qa-fixes58行、T02独立retest77行、shared独立QA122行，以及三份T03源码/测试；按需读取T02接口。`issue-778-shared-backup.md` 实际位于 `docs/qa/`，不是 implementation 目录。
- 加载 code、agent-backup、omnimux-repo-workflow；检索历史后以最新 shared QA 与用户授权为准。无子代理、无独立 QA 签收，无 workspace install、App/Host/L2/Dev/Prod 操作；未修改 shared、T02、原独立QA或其他 dirty 文件。

## 修改与实际定位

### 1. 真实 shared backup 测试隔离

旧 `captureRecoveryInput` 和注入回执复验的 subprocess env 强制 `HOME=userInfo().homedir`，丢弃所有 registry override。仅 source 私有 env.sh 不能隔离该调用。

新增内部 `backupEnvironment()`：默认生产仍使用账户 HOME/默认 registry；仅显式 `AGENT_BACKUP_STATE_DIR` 存在时允许测试 override，要求 HOME 不等于账户 HOME，registry 为该私有 HOME 内绝对路径。capture 与 restore 都消费同一环境；仍调用账户下同一真实 shared `backup.py`，仍要求真实 capture batch 与 restore 两文件 bytes/mode 验证，不 skip、不伪造 receipt、不替换备份实现。

测试命令：

```sh
source .workbuddy/managed-778-t01/env.sh
export AGENT_BACKUP_STATE_DIR="$HOME/t03-resumed-registry"
node --test --test-reporter=tap scripts/managed-tarball-transaction.test.mjs scripts/managed-tarball-recovery.test.mjs
```

Node v25.8.0、Python3.14.6、pnpm11.7.0 均实测；pnpm 路径复用现有私有 wrapper，不下载或切换版本。HOME/TMP/config/cache/store沿用任务环境。

### 2. 两处状态分类修复

新增定向诊断实际复现，不凭静态推测重写交易：

- 首个 intent 尚未持久化时 ENOSPC：内存已有 move，旧代码据此返回 code6；磁盘仍是无 move 的 PREPARED，应为拒绝/no-publication code5。catch 改以磁盘 journal 的 moves 判定，而不是尚未持久化的数组。
- COMMITTED 已持久化而 save 随后报错：旧 finish 回退内存 active journal，catch 调用 recover 读到 COMMITTED，最后却输出 `rejected/code6`。catch 先识别磁盘 COMMITTED，返回 `recovery-required/code7` 和明确终态复核信息，保留材料交显式恢复清理；不虚称回滚。

没有改发布顺序、safeMove API、GraphInspector、cache实现或原退出码定义。

## 测试证据与计数

| 执行 | 实际结果 | 证据 |
| --- | --- | --- |
| 第一轮完整原有矩阵 | **45/45，0 fail/cancelled/skipped，exit0，297286.935167ms** | 工具job `bash-407`，30 transaction + 15 recovery |
| 新增定向诊断 | **3项，1 pass、2 fail，exit1，32880.475583ms** | job `bash-408`；after-reverse-1通过，intent/durable-COMMITTED失败；两个断言保留，修源码 |
| 第二轮完整矩阵 | **65/65，0 fail/cancelled/skipped/todo，exit0，469725.249542ms** | job `bash-409`；19 recovery + 46 transaction，2026-09-08 21:27–21:35 +08:00；同一最终源码状态，不拼旧轮 |
| 三份Node syntax、git diff --check | exit0 | 全局审查命令 |

第一轮已通过真实hoisted/isolated完整payload/peer闭包、成功后幂等、搬迁、7次发布rename前后14项、提交INT/TERM/KILL与原全部负例，全部真实越过backup gate。

本轮新增20个测试（不替换原45项）：

- transaction16：准备 `lock-generated` 点 INT/TERM/KILL 3项；完整7 move后先KILL，再在 reverse7/4/1各前后第二次KILL 6项；fsync/rename/intent/result/terminal/cleanup 6个IO点；durable COMMITTED结果误报1项。
- recovery4：真实 pnpm exec 中持续运行的测试子进程 ready 后 INT/TERM/KILL，等待 coordinator 与 lease释放3项；transaction祖先被替换为symlink后的journal写拒绝1项。
- 原45项文本逐字保留：从真实源码恢复批读取原测试，新增段前prefix/后suffix均精确相同，旧断言无删除、替换、skip。新增定向失败断言同样保留。

**证据边界：**IO测试在真实事务的现有hook/保存方法边界注入 EIO/ENOSPC，不是把物理磁盘填满或在内核fsync系统调用内部制造故障。真实 pnpm exec 只运行自有持续等待fixture来证明活动进程回收，不是业务包install脚本；生产install仍ignore-scripts。准备信号在真实lock生成后、worker已回收的checkpoint，活动worker信号由独立runner三例补证。不是全部时序笛卡尔积、掉电或Linux证据。

## 恢复点、registry 与 shared 身份

必要源码恢复点在任何源码改动前真实 capture：

- batch `20260908T132050Z-a105fabc5c19`，本轮3份dirty源码/测试，60029 bytes，ZIP18302 bytes；保守30天weighted retention。
- 默认生产registry登记成功，产品indexed28、unmanaged2；cleanup删除0、freed_bytes0。账户39行是新增该必要源码恢复点之后的基线，不称账户全程零写。
- 所有后续测试 capture/restore 均用私有 registry；账户 index只读逻辑摘要在21:22与21:28一致：39行、SHA256 `7fe63c1e2870a5222de5a03a0aca207c16c3cb4968759d07e524caab46bc4a1b`（`SELECT * FROM backups ORDER BY root,batch`，json.dumps sort_keys=True）。21:35最终核对仍相同；测试未向账户registry登记。
- 本轮最终真实新增63批/127个文件条目：必要源码批1×3，测试批62×2（第一轮22、定向3、第二轮37），不是127个不同业务文件。所有63 ZIP CRC与manifest payload SHA256核验通过；测试两文件restore/bytes/mode由真实调用逐批完成。私有registry最终90行，包含原有28批与测试62批，SHA256 `5cd1d46e6aa832088f5722feb0e13a7b738379870bf037a8353d93131870c3ae`；保留该registry供工具后续管理，不手工删除payload或索引行。
- 测试仍按shared worktree合同把payload归同项目主路径 `.agent-backups/`；只隔离registry，不把工作树私有store冒称标准实现。未prune新旧payload、未搬散文件，未调用audit整体false判正规损坏。
- shared源码hash实测匹配用户与独立QA：backup.py `e744e95c03e3b60471621341e9a9610c674944bc04c83a4b4a978274f25605d7`；test_retention.py `343d081792f653d735fe222ef91330f1b7acbd4be9f1d054717517d396d3ee6b`。两者未写。

## 全局一致性与仍须报告的缺项

1. **no-op no-pnpm 尚未解决。** `ManagedSync.prepare()`在判断managed spec前capture，并在no-op复核时再次capture；capture必跑受控pnpm list。GraphInspector.capture目前硬性要求listJson且校验其profile path。不能把旧checkpoint无触发断言当成无pnpm实证。精确跨包缺口是T02图检查缺少无外部pnpm进程、同样保持lock/disk occurrence/consumer解析保证的capture入口；不能在T03伪造listJson，不能改文档授予只读list例外。
2. **准备FD覆盖仍不完整。** publication safeMove、journal、mkdir/remove复用DirectoryAnchor；新增祖先替换测试只证明已替换路径下journal写拒绝且outside sentinel未改，不证明候选准备全窗口。T03的snapshots cpSync、候选父mkdirSync、copyFileSync/writeFileSync以及syncTree目录递归仍是路径API；T02 privatePnpmEnvironment也采用assertPath后mkdir/write。缺的是持有源/目标祖先FD并核绑定的有界copy/write/config准备能力，以及与真实pnpm阶段的所有权重验；现有safeMove只允许journal四项rename，freeze/extract只处理输入归档，不能据此声称通用候选写已锚定。本轮未擅自扩T02 API。
3. **CI shared路径可移植性未解决。** 工具仍从account home `.agents/skills/agent-backup/scripts/backup.py`读取；registry隔离不安装工具、不证明CI runner具备该路径。T01/主理人处理真实工具可用性，不允许复制另一实现或假receipt。
4. 原事务源父mkdir成功、identity journal未持久化的窗口仍可能保守7；合作writer/lease与现有pending保证范围不扩大为任意恶意同用户进程或永久IO故障的自动恢复。
5. full gates、普通sync回归、最终同状态T02集成、真实synthetic Host业务、独立QA、CI/MQ与Dev未执行，归T01/主理人，不用本包矩阵替代。

T02三模块与独立QA测试在21:28hash均匹配其66/66独立retest，未修改；历史66项未重复计入本包。

## 源码身份

| 文件 | 本轮源码SHA256 |
| --- | --- |
| scripts/managed-tarball.mjs | `15d34377ee5df206a5f31ac547d3d52021a0298c967e59d4f4801e8c6dc04495` |
| scripts/managed-tarball-transaction.test.mjs | `2840f003e85c6512dd090b560cfa916d2552415f9a17bc175b8dee7b4fb2d524` |
| scripts/managed-tarball-recovery.test.mjs | `596da224327ea4255dc8485b1669c34cd0b583d98a94497070effa749f7d804e` |

三个测试job均已完成并收集，第二轮后未再改源码。最终HEAD不变，T02/shared hashes均不变，syntax与git diff --check通过。任务TMP中仅发现旧 `managed-transaction-wggfm8`（mtime 17:47:29，早于本轮21:19），未删除或认领该历史材料；本轮recovery临时目录已清理，无本轮存活后台任务。

下一owner为主理人/T01；四文件写权交回。主理人先核对本报告的no-op/FD/API与CI工具可用性缺项，按owner分派必要接缝，再做最终同状态gates/Host及独立QA。当前已完成本次有界矩阵验证，不自行启动独立QA、第三轮或发布。
