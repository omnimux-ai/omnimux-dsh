# Issue #778 — 共享备份最小修复工程报告

## 最新结论（2026-09-08 21:08，接续工程145）

**IS_PASS: YES — 共享最小修复工程自检通过，真实 register 阻断已解除；独立 QA 待主理人安排。** 下文18:31/19:10记录保留为历史，不能作为当前阻断状态。未运行 #778 transaction、Dev、Prod 或子代理，不以此次 PASS 代替独立 QA 与产品验收。

- 正常 main hook 已包含 #786/PR792 的 `9b0ab289`；本轮观察 main `df0397b2860a4dcebe618651b3089febff350164`，只读确认其祖先和 hook/config 无漂移。会话默认 cwd 是产品 main，bash 验证 cwd 使用准确 #778 任务树。正常绝对路径 `edit` 首次及后续均成功，无拒绝后换工具/换路径重试，未改旧树 guard/config。
- 18:31 shared scripts/tests、19:05 恢复及正常 registry/expiry、19:41 hook 授权沿用，没有重复索权。修改前 hash/mode 与原记录完全相同，批 `20260908T110759Z-a717f5040af9` ready/registered、12543 bytes，archive 只读复验通过。复用前序实际 restore2 证明，无新 capture。
- 仅共享 `scripts/backup.py` 和 `tests/test_retention.py` 两文件变更，均0644。代码没有重构 retention/global policy/index 单批 commit；产品源码、SKILL、catalog 和历史备份未改。
- `register_project` 对当前 root 的 index 行与 store 项取并集，防止孤立 index 静默漏过；manifest/payload/同 root index/精确生成式 ID 任何证据均保留 managed fail-closed。仅无证据普通目录作为 unmanaged 返回，目录和元数据 symlink 均拒绝。
- ready 在 index 前必须存在普通 payload（含无 retention 批），不能写入0字节索引；expiring/pruned 缺 payload 继续原语义。registration 不增加全 archive verify，因此原损坏 archive 的 cleanup 阶段错误语义保留。`load_batch` 额外拒绝非 object JSON，保障错误 JSON 回执；成功 capture/import/prune 附 `registration` 结果，使散件可诊断。
- 先红后绿：原30 + 新15 = **45测试**。红测 exit1、6 failures/3 errors；修复后 exit0、45/45，4.317s。全过程 HOME/registry 私有。三个 Python 文件 compile 语法通过，内存对比恢复 ZIP 原文件完成全局一致性检查。
- 21:05:55 正常生产 CLI `register --root <#778 task tree>` **exit0**，`adopted:[]`、`indexed:27`、`unmanaged:[legacy-4092a8f-diffs,worktree-archive-specs]`。现有18个 #778批此前已登记，不能称新增登记；前后产品27行全部ready，全局38行逻辑内容完全一致。
- 真实只读 audit 前后均验证27个正规 archive，整体 `ok:false` 仍仅两处散目录缺manifest。audit 行为未改，不能冒称全绿。store全部101项及18个散文件bytes/mode/mtime前后相同，无移动、删除或伪造manifest；未调用cleanup，无新增capture/删除payload。
- 完整命令、测试、原始 register receipt、side effects 和散文件hash见[验收回执](issue-778-shared-backup-receipts.md)。正常register确实执行锁/SQLite/27次逐批UPSERT，逻辑内容相同不等于零写入。

| 文件 | 修复后 SHA256 | mode |
| --- | --- | --- |
| `/Users/x/.agents/skills/agent-backup/scripts/backup.py` | `e744e95c03e3b60471621341e9a9610c674944bc04c83a4b4a978274f25605d7` | 0644 |
| `/Users/x/.agents/skills/agent-backup/tests/test_retention.py` | `343d081792f653d735fe222ef91330f1b7acbd4be9f1d054717517d396d3ee6b` | 0644 |
| `/Users/x/.agents/skills/agent-backup/tests/test_backup.py`（未改） | `90cf9422ed4a5be70636703369ff07b128e7f61e3e5e076eec50f157cccc8694` | 0644 |

**下一 owner：主理人安排独立 QA。** 复核此共享diff及45项隔离测试、真实登记回执和预变更恢复批。独立QA放行前不运行任何 #778 transaction/Dev 操作。无 commit/push/fetch、无他人dirty覆盖、无子代理。本轮新增文档仅验收回执，并更新本报告；其余既有报告保留原样。

## 历史状态与授权（18:31）

**IS_PASS: NO — 工程在必要恢复保护前阻塞；未修改共享源码，不能交付修复通过结论。** 既有完整隔离 unittest 基线为 30/30 通过，但不覆盖本次混合 store 修复，不能替代修复或独立 QA。2026-09-08 18:31 用户明确授权仅修改用户级共享 `agent-backup/scripts/backup.py`、相关测试及本报告。禁止修改产品源码、CI、历史 manifest/index/retention，禁止真实 capture/import/register/global cleanup、commit/push/重启与子代理。

## 已核实身份

- 共享真源：`/Users/x/.agents/skills/agent-backup`，realpath 相同，非软链，不搬迁 catalog 或启用布局。
- `scripts/backup.py`：SHA256 `9f69426971ddd08ea7ca45c5d2b67188c8bce913be89f38f6129597042b1817f`，mode `0644`。
- `tests/test_backup.py`：SHA256 `90cf9422ed4a5be70636703369ff07b128e7f61e3e5e076eec50f157cccc8694`，mode `0644`。
- `tests/test_retention.py`：SHA256 `236fced008ad0e72a8951c5f3c41a80c6f1a255c88ecd65e8d80626ee19733bf`，mode `0644`。
- 对共享目录执行 Git root/HEAD/status/remote 查询均退出 128：`not a git repository`。尚无该目录的可达 Git 恢复证据，也不能据此猜测发布仓库。
- 已完整读取 [故障诊断](issue-778-backup-diagnosis.md) 143 行、共享源码 724 行和两个既有测试文件。诊断的 27 正式批与 #778 的 18 批已登记属于前序只读证据，本轮未改动或重新登记。

## 实现边界与验收

只在具备合法恢复保护后修改既有文件。分类必须使用 manifest/payload/index 等受管迹象，不可跳过所有无 manifest 条目；未纳管散件应报告并原样保留，损坏正式批次必须继续拒绝。测试仅使用现有 TemporaryDirectory 与隔离 registry 模式，覆盖混合 store、缺 manifest/坏 JSON/缺 payload、历史内容和 mode、worktree 共根、逐批提交及 retention。

## 恢复闸与交付

已完成有界核实，当前授权内未找到可用恢复点：

1. 共享目录没有 `.git` 或既有 `.agent-backups`，也不属于父级 Git 仓库；没有可确认的 git remote 归属。未猜测远端仓库、建依赖 Issue 或 push。
2. 原脚本 Git blob 为 `9e13ad83968ec796352a464ad436164bd4efbf23`。对 `/Users/x/Desktop/Project/opc-skills` 和 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh` 执行只读 `git rev-list --objects --all`（均 exit 0），均没有此精确 blob 或 `agent-backup` 路径。限定检索 opc-skills/Github 下 `agent-backup/scripts/backup.py` 未命中。这不是全机所有 Git 的不存在证明，但当前没有恢复来源可据。
3. 现有 `project_roots()` 的独立非 Git root 支持可把共享包自身作为 root，使用包内 `.agent-backups/`；但合法 CLI capture 在 `run():685,703,707` 必然进入默认全局 registry、registration 和 cleanup。没有 `--no-cleanup` 等合法参数。本轮明确禁止真实 capture/登记/全局清理，故未执行，也未通过 `AGENT_BACKUP_STATE_DIR` 将真实包伪装测试，未绕开 `run()` 直接调用内部 capture。
4. 未初始化 Git、未创建 commit、未补造 manifest、未做旁路 `.bak`，共享源码和两个测试仍为上表原 hash/mode。测试临时 Git commit 仅为既有测试 fixture 的行为，不是任务仓库 commit。

**下一 owner：主理人。** 需要先提供已有可达 Git 的精确恢复来源，或协调允许一次必要的共享包单文件恢复 capture 及其标准 registry/expiry 副作用；该决定不由本子代理扩大。本轮不提出改保留策略、手改 index、禁用 cleanup 或移动真源作为替代。恢复闸解决后工程继续修复，再由主理人安排独立 QA。真实产品登记和清理仍由最终集成协调。

## 代码审查所得的最小修复注意事项（未实施）

- `register_project():99–102` 必须区分未纳管散件和正式批，manifest/payload 存在（包括不安全软链）或同 root 的 index 行均是受管迹象；有迹象时不能当作散件跳过。对生成式批次 ID 但丢失全部元数据的目录也须保守失败，不能仅凭无 manifest 将其洗成散件。
- 可诊断散件应出现在 register/capture 回执中并保持字节、mode 和路径。不能只在内部跳过而使调用者看不到。index 仅可查当前 primary 的行，不得按其他 root 的同名 batch 分类。
- 额外核实：当前 `index_batch()` 对缺 payload 取 size=0，register 仅在 adoption 分支调用 `verify()`；所以只加分类条件不足以通过用户要求的“缺 payload 正式批拒绝”。修复应保守检测 ready 批缺失/不安全 payload，并保留 expiring/pruned 回执语义；不得无区分校验所有状态，破坏已到期回执与中断恢复。
- 保留逐批 `index_batch()` commit 的现有语义；登记中途失败仍可能已有成功行。保留 `backup_ok`、新 batch ID、`failed_phase: registration`，不能把失败说成事务整体回滚。现有损坏 archive 在 cleanup 阶段报告的测试语义也需维护。

## 实际测试与证据边界

在任务树执行：

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s /Users/x/.agents/skills/agent-backup/tests -v
```

结果：**exit 0，Ran 30 tests in 2.544s，OK**。完整加载两个既有测试文件；`setUp()` 使用 `TemporaryDirectory` 并以 `patch.dict` 设置隔离 `AGENT_BACKUP_STATE_DIR`，所有 capture/register/cleanup/import/restore 和 Git fixture 操作只作用于临时 root/state。未执行产品 transaction 测试，避免其真实默认备份接缝写入。

没有新增测试、没有修复后测试、没有独立 QA、没有真实登记/清理/恢复成功证据。上表源 hash 对应本轮测试基线，而不是修复版。现有 27 批和其中 18 个 #778 批均未由本轮写入、删除或重新登记；本轮未重读真实 index，因此不把前序快照表述为本轮新快照。

本任务唯一文件产出为此报告；未修改既有诊断报告、SKILL 文档、产品 managed-tarball/source/CI。工作树 HEAD 为 `580234923268673562cacb5cd01aebdb780339e1`，已有其他 owner 的脏文件保持原样；未 fetch、stage、commit、push 或重启。

## 2026-09-08 19:10 接续工程131：恢复闸已解除，文件编辑被平台门禁阻断

**最新状态：IS_PASS: NO。** 19:05 新授权明确允许最小共享包备份、正常全局 index 登记及既有到期策略副作用，取代上文旧轮次的相应禁止。必要 capture/restore 已成功；首次共享测试编辑被平台拒绝，源码及测试尚未修改，未进入独立 QA。当前缺口是执行门禁，不是备份授权，不应再次询问同一备份操作。

### 已执行的合法恢复保护

- 再次核对共享真源是非软链实体目录；`git -C /Users/x/.agents/skills/agent-backup rev-parse --show-toplevel` exit 128，`not a git repository`。capture 前及编辑拒绝后，脚本、两个既有测试的 SHA256/mode 均与本报告第 10–12 行一致，没有并发漂移证据。
- 仅选将修改的 `scripts/backup.py`、`tests/test_retention.py`，未选择不需要修改的 `tests/test_backup.py`。没有设置 `AGENT_BACKUP_STATE_DIR`，没有旁路调用内部 capture，没有另外创建 `.bak`。
- 正常 CLI capture exit 0，`ok:true`、`backup_ok:true`。registration 成功并进入正常全局 cleanup；不是跳过或绕过副作用。

```sh
python3 -B /Users/x/.agents/skills/agent-backup/scripts/backup.py capture \
  --root /Users/x/.agents/skills/agent-backup \
  --task 778-shared-backup-fix-131 \
  --reason 'Authorized minimal pre-change recovery for shared backup script and retention tests; preserve exact non-Git bytes and modes' \
  -- scripts/backup.py tests/test_retention.py
```

实际 receipt：

```json
{"ok":true,"action":"capture","status":"ready","batch":"20260908T110759Z-a717f5040af9","directory":"/Users/x/.agents/skills/agent-backup/.agent-backups/20260908T110759Z-a717f5040af9","files":2,"stored_files":2,"source_bytes":47484,"archive_bytes":12543,"retention":{"policy":"weighted-expiry-v1","scores":{"irreproducibility":5,"impact":5,"uncertainty":5,"rollback_window":5},"weights":{"irreproducibility":35,"impact":30,"uncertainty":20,"rollback_window":15},"reason":"No contextual assessment supplied; conservatively retain for 30 days.","days":30,"starts_at":"2026-09-08T11:07:59+00:00","expires_at":"2026-10-08T11:07:59+00:00"},"backup_ok":true,"cleanup":{"ok":true,"applied":true,"deleted":[],"eligible":[],"freed_bytes":0,"errors":[]},"index":"/Users/x/.agent-backup/index.sqlite3"}
```

- 批次存储严格位于 skill 自身 `.agent-backups/`；原有全局 index 正常登记 1 行。到期 eligible=0、deleted=0、errors=0、freed_bytes=0；没有产品散件引起 cleanup failure。
- 正常 CLI restore exit 0，将该批次恢复到任务树内新建空目录 `.issue-778-restore-m2k5dmc7`，`verified_files:2`。逐文件比较恢复文件和当前源文件 bytes、上述 SHA256 与 POSIX `0644`，均一致。验证后移除这一个任务临时验证目录，正式恢复 batch/manifest/payload 保留。

```json
{"ok":true,"action":"restore","batch":"20260908T110759Z-a717f5040af9","destination":"/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778/.issue-778-restore-m2k5dmc7","verified_files":2,"index":"/Users/x/.agent-backup/index.sqlite3"}
```

后续必要恢复可使用现有 batch，不应重复 capture：

```sh
python3 -B /Users/x/.agents/skills/agent-backup/scripts/backup.py restore \
  --root /Users/x/.agents/skills/agent-backup \
  --batch 20260908T110759Z-a717f5040af9 \
  --to /absolute/empty/task-owned-destination
```

### 新阻断：共享文件 edit 被拒绝

首次通过 `edit` 向 `/Users/x/.agents/skills/agent-backup/tests/test_retention.py` 添加混合 store/受管损坏回归测试时，工具返回：

```text
🚫【DSH 核心门禁阻断】严禁在主 checkout 直接修改任何已加入版本管理（Git Tracked）的文件！
正确流程：先运行 ./scripts/git-wt.sh start <plugin> <topic> <issue_id>
```

目标文件不属于当前产品主 checkout，且共享真源的非 Git 身份已独立核实；此提示与文件身份不符，但这是实际平台拒绝，不能自行绕过。运行时同时明确禁止被拒操作换路径重试。本轮没有改用 bash/write、切目录重试、修改 hook、搬迁 skill、初始化 Git，亦未把共享源码写进产品树来规避。测试新增未落盘，`backup.py` 未尝试编辑。

### 本轮可用证据与边界

- 完整隔离 unittest：`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s /Users/x/.agents/skills/agent-backup/tests -v`，exit 0，**Ran 30 tests in 2.650s，OK**。仍是未修复基线，不是新增回归或修复 PASS。
- 三个现有 Python 文件只读 `compile(..., 'exec')` 语法检查通过，无 pycache 写入。恢复 batch 通过只读 `load_batch()`/`verify()` 再校验。
- 报告定向 `git diff --check` exit 0；报告为未跟踪文件，另执行 `git diff --no-index --check /dev/null docs/implementation/issue-778-shared-backup-fix.md`，exit 1 且无错误输出（新文件存在差异，不冒称 exit 0）。相对链接、围栏配对与逐行空白检查通过。
- SQLite URI `file:/Users/x/.agent-backup/index.sqlite3?mode=ro`、`PRAGMA query_only=ON` 的新快照：产品 root **27 行，其中 #778 为 18 行**；skill root 新增批次为 `ready`、12543 bytes、expires_at `2026-10-08T11:07:59+00:00`。未调用 audit/index 外层 registry，未手改数据库。该只读快照不持全局锁，不声称排除其他进程并发。
- 未运行真实产品 capture、产品 transaction、全 gates、Dev/Prod、重启、fetch、push 或 commit；未派代理。未动未纳管散件、既有 manifest/策略、SKILL/布局、产品源码或诊断报告。

### 下一步与 owner

主理人先处理本子代理的共享文件编辑门禁，或安排本来就具备该已授权范围的执行环境；不是请求重复备份授权。恢复点已经具备，接续前 recheck hash/mode 后可复用现有 batch，继续最小分类/ready payload 修复和新增隔离回归，再交独立 QA。本轮没有后台任务。

修复经独立 QA 放行后，最终工程的正常产品 capture 将使用产品 primary `.agent-backups/`，登记该 root 的正规批次并按原策略 sweep 所有已登记项目的到期 payload；未纳管散件应原样保留且回执可诊断。**现有 18 个 #778 batch 已登记，登记曾失败不构成保留锁**；它们仍受各自已记录的到期策略约束。该后续产品操作本轮未执行，也不以本轮备份成功替代产品 gate 或发布验收。
