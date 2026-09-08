# Issue #778 — 共享备份 registration 只读故障定位

## 结论

**定位完成；故障未修复，现有合法 CLI 没有在保留这两处散件目录原状的同时使项目登记成功的入口。** 本报告不是架构评审，不修改 P0、合同、产品源码、共享工具、历史备份或 index。

1. `register_project()` 把项目 store 的每个非点号顶层条目都当作 managed batch，未按 manifest 存在与否区分散件，也没有逐项异常隔离。`load_batch()` 读取缺失 manifest 时终止登记。当前按排序先撞到 `legacy-4092a8f-diffs`；`worktree-archive-specs` 是独立的第二个同类故障。
2. **“登记返回失败”不等于“所有 batch 未写入 index”。** `index_batch()` 每批立即 commit。当前只读 index 快照已有全部 18 个 #778 batch；不能把它们视为未纳入到期策略。
3. 已只读验证当前全部 27 个正规 batch 的 archive；全部 `ready`，其中 #778 为 **18 批、36 个文件条目**。没有再 capture。两个散件目录使 audit 总体 `ok:false`，不表示 27 个 archive 都损坏。
4. `managed-tarball.mjs` 的真实默认执行路径确实依赖账户主目录中的共享脚本和生产全局 registry。此机解析为 `/Users/x/.agents/skills/agent-backup/scripts/backup.py`，脚本存在；不是路径找不到，也不是缺远端分支。其失败将交易阻断在 `PREPARED` 之前。

## 范围与证据身份

- 任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778`。
- 固定 base 与本轮 `git rev-parse HEAD`：`580234923268673562cacb5cd01aebdb780339e1`。目标是该 HEAD 上已有的本地未提交工作树，不是远端 PR diff。
- 完整读取背景 [T03 报告](issue-778-t03-followup.md) 1–108 行，尤其 38–67 行的真实失败与恢复记录；该记录中的 restore 成功属于前序证据，本轮未重演 restore。
- 完整读取共享 `backup.py` 724 行，以及 `tests/test_backup.py` 283 行、`tests/test_retention.py` 210 行。`backup.py:5–23` 仅导入 Python 标准库；此安装的实际 Python 实现没有另一层项目模块。两个测试文件动态加载该同一脚本（`test_backup.py:15–18`、`test_retention.py:8–10`）。
- 读取产品调用段、异常处理段及 transaction 测试相关部分；没有执行测试套件。
- 本轮 SHA256：

| 文件 | SHA256 |
| --- | --- |
| `/Users/x/.agents/skills/agent-backup/scripts/backup.py` | `9f69426971ddd08ea7ca45c5d2b67188c8bce913be89f38f6129597042b1817f` |
| `scripts/managed-tarball.mjs` | `05937f2f7948483ab7bda476659a14868fd1186bafee8838132d2dd66794d572` |
| `/Users/x/.agents/skills/agent-backup/tests/test_backup.py` | `90cf9422ed4a5be70636703369ff07b128e7f61e3e5e076eec50f157cccc8694` |
| `/Users/x/.agents/skills/agent-backup/tests/test_retention.py` | `236fced008ad0e72a8951c5f3c41a80c6f1a255c88ecd65e8d80626ee19733bf` |

## 精确调用链与最小故障位置

### 共享工具：capture 已成功，registration 随后失败

以下为源码确认的调用链，不是本轮重新 capture 的 traceback：

```text
backup.py main():715
  → run():685                       registry / 全局锁与 SQLite
  → dispatch():697 → capture():662
      → write_json(manifest):431
      → verify(stage, manifest):432
      → os.rename(stage, final):433
      → ready receipt:434           新批次已持久落地
  → result['backup_ok'] = True:700
  → register_project(db, primary):703
      → sorted(store.iterdir()):99
      → 跳过点号项:100–101
      → load_batch(primary, directory.name):102
          → manifest_path.read_text():342
          → FileNotFoundError（缺 manifest.json）
  → except:704 → ok:false, failed_phase:'registration':705
  → main():720 → exit 1
```

- **最小故障入口是 `backup.py:99–102` 的无差别枚举与无逐项容错；实际异常行是 `backup.py:342`。** 不是只枚举新 batch，也不是扫描所有项目的 store；这是当前项目 primary store 的全部非点号顶层条目。所有已登记项目的扫描发生在另一阶段 `cleanup():117–118`。
- `project_roots():184–203` 用 `git rev-parse --show-toplevel` 和 `git worktree list --porcelain -z` 解析 source/primary，取主工作树。因此从 #778 worktree 运行仍使用主产品根 `.agent-backups/`，不是任务树私有 store。无需、也未使用 `origin/develop`。
- 该异常返回发生在 `cleanup(db):707` 之前；**这一次失败调用没有进入 cleanup**。不能据此推断此前或其他项目调用也没执行 cleanup。
- `register_project():109–110 → index_batch():90–92` 每个正规 batch 执行 INSERT/UPSERT 并独立 commit，没有覆盖全项目的原子回滚。当前时间戳 batch 均排在两个字母目录前；它们先写 index，后遇到 `legacy-4092a8f-diffs` 报错。
- 显式 `register` 走 `run():694–695`，不走 704–705 的带 batch 回执分支；同样的缺 manifest 会由 `main():716–718` 输出通用错误并 exit 1。

### audit：逐项收集错误，而不是全部 archive 校验失败

`audit():539–553` 同样枚举 store，但 `547` 的 `load_batch()` 和 `549` 的 `verify()` 位于逐项 try/except 中；`551–552` 收集错误，继续后续条目，最终 `ok = not errors`。因此两个散件错误与 27 个成功 batch 可以同时存在。

本轮用 `PYTHONDONTWRITEBYTECODE=1 python3 -B` 内存加载同一脚本，仅调用已读过的 `project_roots()`、`audit(validate=True)` 与 `load_batch()`；**未调用 `main/run/registry`**。诊断 Python 进程 exit 0，因为它打印结果并捕获预期异常；这不是 CLI `audit --verify` exit 0。得到：

```json
{
  "audit_ok": false,
  "verified_managed_batches": 27,
  "managed_states": ["ready"],
  "task_778_batches": 18,
  "task_778_files": 36,
  "errors": [
    {"batch": "legacy-4092a8f-diffs", "error": "[Errno 2] No such file or directory: .../legacy-4092a8f-diffs/manifest.json"},
    {"batch": "worktree-archive-specs", "error": "[Errno 2] No such file or directory: .../worktree-archive-specs/manifest.json"}
  ]
}
```

对两个名称分别直接调用只读 `load_batch()`，均得到真实 traceback：`backup.py:342 → pathlib.read_text():787 → pathlib.open():771 → FileNotFoundError`。目录清单显示第一处为 14 个 diff/status 散件，第二处为 4 个历史规格 Markdown；均无 `manifest.json` 或 `payload.zip`。没有更名、移动、删除或补 manifest。

### index 的实况与保留风险

用 SQLite URI `file:///Users/x/.agent-backup/index.sqlite3?mode=ro&immutable=1` 加 `PRAGMA query_only=ON` 做只读 SELECT，未通过共享 `registry()`，没有初始化表、chmod、写锁或写 index。结果：该项目 27 行，其中 `task` 以 `778-` 开头的 18 行全部 `ready`，batch IDs 与只读 audit 的 18 批一致。

该读取是不持全局锁的观察快照，不承诺与其他并发进程形成事务级一致证据；但足以否定“当前 18 批一条也没有登记”。逐批 commit 也从源码独立解释该现象。

诊断批 `20260908T094720Z-7be2f7bccf32/manifest.json:31–48` 明确记录 `weighted-expiry-v1`、30 天、`starts_at=2026-09-08T09:47:20+00:00`、`expires_at=2026-10-08T09:47:20+00:00`。**登记命令返回失败不是保留锁；已入 index 的 payload 仍可能在后续其他项目成功备份触发的全局 cleanup 中按各自记录到期。** 本轮没有运行 cleanup，也没有变更保留期。

## 产品调用的真实影响

产品源码 [managed-tarball.mjs](../../scripts/managed-tarball.mjs)：

1. `11–12` 从当前脚本路径确定 `root`；`154–157` 的 `captureRecoveryInput()` 拼接 `userInfo().homedir + '.agents/skills/agent-backup/scripts/backup.py'` 并 `spawnSync('python3', ['-B', tool, ...args])`。
2. 本轮 Node 只计算该表达式：`accountHome=/Users/x`，实际绝对 tool 路径与上述已读脚本相同。它不是字面硬编码 `/Users/x`，但固定依赖账户级 skill 的安装位置；此机文件真实存在。
3. `157` 的 child env 只传 PATH 和真实账户 HOME，不继承测试的私有 HOME 或 `AGENT_BACKUP_STATE_DIR`。`166` 使用产品 worktree `root` 调用 capture；共享根解析将其归到主产品 store。这是合成交易也遇到真实 legacy 项的直接原因，不是假想的路径可移植性评审。
4. `160–161` 对非零状态抛 code 5，并保留 `batchId / backupOk / failedPhase`；`168` 的 restore 核验不会在该失败后继续。
5. `ManagedSync.run():607 → installCandidate():429 → backup():404 → captureRecoveryInput():166`；成功才到 `installCandidate():430` 设置 `PREPARED`。`run():611–613` 保存失败回执。当前阻断符合源码，不能将真实 archive 校验或既有 restore 成功替代其成功 gate。
6. 注入 `recoveryReceipt` 也会经过 `backup():405–406` 和 `verifyRecoveryReceipt():174–181` 的同一账户级工具 restore。这里仅说明现状，不建议绕过 gate、改变环境、替换回执或新增恢复系统。

## 现有合法 CLI 能否非破坏恢复

已真实运行以下 **help**，全部 exit 0；help 在 `parse_args()` 内退出，尚未进入 `run()/registry()`：

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /Users/x/.agents/skills/agent-backup/scripts/backup.py --help
PYTHONDONTWRITEBYTECODE=1 python3 /Users/x/.agents/skills/agent-backup/scripts/backup.py audit --help
PYTHONDONTWRITEBYTECODE=1 python3 /Users/x/.agents/skills/agent-backup/scripts/backup.py import --help
PYTHONDONTWRITEBYTECODE=1 python3 /Users/x/.agents/skills/agent-backup/scripts/backup.py register --help
PYTHONDONTWRITEBYTECODE=1 python3 /Users/x/.agents/skills/agent-backup/scripts/backup.py restore --help
```

下表是 help 和源码核实的合法命令形态，**不是执行记录或操作授权**：

| 入口 | 当前行为 | 能否解决本次登记故障 |
| --- | --- | --- |
| `audit --root ROOT --verify` | `audit()` 只读核验并列出错误，不修复。CLI 外层仍进入 registry | 不能 |
| `audit --root ROOT --legacy` | `521–538` 只发现候选；`25–26,527` 排除 `.agent-backups`，只按文件 backup 名称筛选 | 不能发现并转换 store 内这两目录，也不修 manifest |
| `register --root ROOT` | 仅为已有 retention 的合法 batch 重建 index；仍先 `load_batch` 每个条目 | 不能跳过缺 manifest 条目；无 `--batch`、`--exclude`、`--skip-invalid` |
| `register --root ROOT --approval TEXT [--assessment JSON]` | `103–107` 对已有合法 manifest、ready 且缺 retention 的 batch 验证后追加 policy；不是从散件生成 manifest | 不能；缺 manifest 在 adoption 分支之前已报错，而且会写 manifest/index |
| `import --root ROOT --task TASK --reason TEXT --plan PLAN` | `663–676` 调用 capture 创建新 batch，之后仍全 store register/全局 cleanup；不带 remove-source 时保留源文件，但不是只读操作 | 不能原地补 manifest；以当前 project 为 root 的 `.agent-backups/...` 在 `checked():224–225` 被保护拒绝 |
| `import --root ROOT --batch ID --remove-source --approval TEXT` | `664–667` 仅恢复已有 import 批次的源删除流程，无 plan 时才能用；`494–518` 必须加载现有合法 import manifest | 不能将散件注册成 batch；且本轮明确禁止源删除 |
| `restore --root ROOT --batch ID --to EMPTY_DEST [--path PATH]` | `469–491` 按指定正规 batch 核验并恢复，不扫描其他 store 条目；CLI registry 使用 `connect=False` 不打开 SQLite | 可以恢复已有正规 batch 的文件，但**不修登记**；会创建锁/目标文件，不属于本轮只读授权，未运行 |

不能靠 `--root` 指向这两个位于 Git 项目内的散件目录规避保护：`project_roots():188–203` 仍回到同一 Git source/primary，且 import plan 的 `source_root` 必须精确匹配（`387–388`）。不存在已验证的合法原地接管入口。本报告不构造重根、拷贝、改名或手写 index 的替代流程。

**CLI 的只读表象须单独区分：** `run():685` 对除 restore 外所有命令进入 `registry(connect=True)`；`registry():54–68` 可建状态目录、创建 lock、connect SQLite、chmod、CREATE TABLE、commit。故本轮不直接执行 `audit`、`index`、`register`，也不运行 cleanup preview。上述 audit 证据来自只读内部函数，index 证据来自只读 SQLite URI，而非声称原 CLI 零写入。

## 相关测试证明什么、缺什么

- `test_retention.py:187–194` 的 `test_registration_failure_preserves_new_recovery_id` mock `register_project` 抛 OSError，断言 `ok:false`、`backup_ok:true`、`failed_phase:registration`、新 payload 仍在；支持阶段分离，但没有覆盖真实混合 store、缺 manifest 与逐批 commit 的组合。
- `test_retention.py:82–93` 的 legacy adoption 测试先创建合法 batch，仅删除 retention；并不是缺 manifest 的散件目录。不能用该用例推断 register 能修本次故障。
- `test_backup.py:102–115` 验证 worktree 共用 primary store；`150–167` 验证 store/符号链接/嵌套仓保护；`196–229` 的 import 用例针对项目内普通历史文件和已形成的 import batch，不覆盖 store 内散件原地接管。
- `test_retention.py:176–185` 验证 corrupt index 不妨碍指定 batch restore；不代表 restore 能修登记。
- `test_retention.py:43–66,163–174` 覆盖成功备份触发跨项目到期处理，支持已入 index 的 batch 后续仍可能被清理的风险结论。
- 产品 `managed-tarball-transaction.test.mjs:61–83,93–103` 使用真实默认 ManagedSync 交易；`106–115` 仅证明伪造回执不能到 PREPARED。本轮未执行这些测试，以免再次 capture。共享 unittest 会在临时项目写入 capture/index，亦未执行。

## 验证边界与交回

- 实际完成：help、工作树 HEAD/status、源码/测试读取、目录清单、27 批只读 archive 核验、两条真实缺 manifest traceback、18 批 index 只读快照、产品路径表达式核实。报告定向 `git diff --check` exit 0（报告为未跟踪文件，故另做检查）；`git diff --no-index --check /dev/null docs/implementation/issue-778-backup-diagnosis.md` exit 1、无空白错误输出，表示新文件与空文件存在差异，不记为 exit 0。相对链接存在性和代码围栏配对检查通过。
- 未执行：capture/import/register/restore/cleanup/prune、共享测试、产品交易测试、远端查询、git fetch/rev-parse origin/develop、代码修改、数据更名/删除、index 更新。没有子代理。
- 唯一任务文件输出为本报告；不改 T03 原报告，以免跨 owner 修改。关于“全部未登记”的修正以上述当前证据交回主理人。
- **下一 owner：主理人。** 现有入口不能解除该混合 store 的登记阻断；是否请求用户扩大到共享工具或历史备份管理范围，由主理人决定。最小故障位置已经明确为共享 `register_project():99–102 / load_batch():342`；任何改变扫描行为、接管散件、重建/更新 index 都不在本轮授权内。风险包括历史来源不能凭空重建、现有 index 已部分成功且受自动到期策略约束、重跑交易将继续产生重复备份。
- 诊断任务可以收尾；#778 完整事务与发布验收仍未因此通过，不作解除阻断、合入或发布声明。
