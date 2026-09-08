# Issue #778 — 共享 backup 修复独立 QA

## 结论

**IS_PASS: YES。Routing Decision: NoOne。可以解除 T03 的共享 backup registration 前置阻断，由主理人恢复 T03 验证；不代表 T03 transaction、Host、产品 gates、L2、Dev 或发布已通过。**

2026-09-08 21:10–21:16（Asia/Shanghai）独立验证。固定任务树 base/HEAD：`580234923268673562cacb5cd01aebdb780339e1`；目标为工程145交付的共享非 Git 真源，不是远端 PR diff。未 fetch、切换分支、commit、push、部署或启动子代理。调用方默认 cwd 是产品 main；所有任务 bash 明确使用 `.worktrees/managed-tarball-778`。

已加载 agent-backup、skill-ops、code、omnimux-repo-workflow；完整读取[工程报告](../implementation/issue-778-shared-backup-fix.md)、[真实回执](../implementation/issue-778-shared-backup-receipts.md)、[故障诊断](../implementation/issue-778-backup-diagnosis.md)以及共享源737行、retention测试396行、backup测试283行。旧文档历史结论与最新工程结论按时间区分。

## 身份与恢复证据

| 文件 | QA 前后 SHA256 | mode |
| --- | --- | --- |
| `/Users/x/.agents/skills/agent-backup/scripts/backup.py` | `e744e95c03e3b60471621341e9a9610c674944bc04c83a4b4a978274f25605d7` | 0644 |
| `/Users/x/.agents/skills/agent-backup/tests/test_retention.py` | `343d081792f653d735fe222ef91330f1b7acbd4be9f1d054717517d396d3ee6b` | 0644 |
| `/Users/x/.agents/skills/agent-backup/tests/test_backup.py` | `90cf9422ed4a5be70636703369ff07b128e7f61e3e5e076eec50f157cccc8694` | 0644 |
| 本轮新增 `scripts/backup-shared.qa.test.py` | `7482b4217bf9f38f58ef2964d2525680a1157bc1668b15467c839714b4b0a245` | 0600 |

共享真源保持只读。只读打开恢复批 `20260908T110759Z-a717f5040af9/payload.zip`，校验 ZIP SHA256 等于 manifest，并在内存校验成员 hash、比较统一 diff；没有重复 capture 或 restore。

- 原 `backup.py`：`9f69426971ddd08ea7ca45c5d2b67188c8bce913be89f38f6129597042b1817f`。
- 原 `test_retention.py`：`236fced008ad0e72a8951c5f3c41a80c6f1a255c88ecd65e8d80626ee19733bf`。
- 实际 diff 仅 `register_project` 分类/ready payload 检查、`load_batch` JSON object 检查、`run` registration 回执。`index_batch` 的逐批 commit、cleanup 和 retention 算法无改动。
- AST 比较：retention 原有函数及断言未修改，恰好新增15个测试方法。前序真实 restore2 证据沿用，不冒称本轮重做恢复。

## 测试报告（严格两轮）

| 轮次 | 完整共享套件 | 独立 QA | 合计 | 退出/耗时 | 路由 |
| --- | --- | --- | --- | --- | --- |
| 1 | 45/45 | 10/12 | 55通过、1失败、1错误 | exit 1，7.877s | QA self |
| 2 | 45/45 | 12/12 | **57通过、0失败、0错误、0跳过** | **exit 0，7.717s** | **NoOne** |

第一轮两个问题均在新增 QA 文件，未修改共享源码：

1. `test_generated_id_boundary_is_exact`：大小写不敏感的本机文件系统中，大写模拟目录与小写精确 ID 撞名，mkdir 抛 FileExistsError。改为不同日期的精确 ID，保留大写近似 ID 的断言。
2. `test_index_only_absent_custom_batch_fails_closed`：原断言错误要求失败后整个 index 不变；实际先按排序成功登记正规批，再在 absent-custom 失败，符合逐批 commit 合同。改为断言孤立行不变且前序正规批已提交，不隐藏来源错误。

没有第三轮；没有未修测试失败或需路由 Engineer 的本次源码问题。覆盖为本次要求的关键行为矩阵，不提供未经测量的行覆盖率百分比。

### 隔离与复现

完整45项 discover 与独立12项组合到同一 unittest suite；外层 `TemporaryDirectory` + `patch.dict` 隔离 HOME、AGENT_BACKUP_STATE_DIR、PYTHONDONTWRITEBYTECODE。既有 setUp 再隔离 registry/root，独立 QA 每例另设私有 HOME/registry/project。CLI 子进程继承隔离环境；所有写入、capture/register/cleanup/prune/import/restore 与 Git fixture commit 均只作用于临时测试目录。

在本任务树可用下列命令复现57项，不涉及产品 transaction：

```sh
python3 -B - <<'PY'
import importlib.util, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
with tempfile.TemporaryDirectory(prefix='backup-778-full-qa-') as home:
    with patch.dict(os.environ, {
        'HOME': home,
        'AGENT_BACKUP_STATE_DIR': home + '/registry',
        'PYTHONDONTWRITEBYTECODE': '1',
    }):
        spec = importlib.util.spec_from_file_location(
            'qa778', Path('scripts/backup-shared.qa.test.py'))
        qa = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(qa)
        suite = unittest.defaultTestLoader.discover(
            '/Users/x/.agents/skills/agent-backup/tests')
        suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(qa))
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        raise SystemExit(not result.wasSuccessful())
PY
```

### 独立有限负例与源码核对

- manifest-only custom、payload-only custom（FIFO）、同 root index-only 且目录不存在：均 fail-closed，不当作 loose 跳过。
- 其他 root 的同名 index 不影响当前 root 的普通散目录；原位内容/元数据及别的 root 行不变。
- generated ID 采用精确 `\d{8}T\d{6}Z-[0-9a-f]{12}`；大写/前后缀近似名仅无其他证据时作为 unmanaged；精确空目录拒绝。
- null/false/数字/string/array manifest 输出 JSON 错误；原 index 不被替换。既有45还覆盖坏 JSON、错 root/id、目录与 dangling metadata symlink。
- ready FIFO、缺 payload 且有 adoption approval 均拒绝；不写0字节索引或补 retention。既有45覆盖普通 ready 的目录payload、无 policy、已入index bytes保护。
- expiring/pruned 缺 payload 仍可登记为0 bytes，expiry不延长、manifest不重写。既有45覆盖中断expiry继续、全局已登记项目到期、不清理unregistered、失败capture不触发cleanup。
- 真 CLI capture 遇 zz-invalid manifest：保留新 batch、backup_ok、failed_phase=registration、无cleanup，独立新 SQLite连接确认前序batch已commit。
- 原45覆盖 worktree 共 primary store；不是把 worktree 私有目录错误当生产 store。

## 真实回执审计与只读实测

前序21:05:55真实 `register` 的原始回执已完整审阅：exit0，indexed27、adopted0、unmanaged2。**本 QA 没有重跑真实 register**；正常register有锁、SQLite初始化/逐批UPSERT副作用，不能称只读。18个 #778 批此前已经登记，不是本轮新增。

本轮两次测试均在前后做只读快照：store/shared tree 以相对路径记录 mode、mtime_ns、kind，文件另记录 size、sha256；global SQLite 用 URI `mode=ro` + `PRAGMA query_only=ON` 查询 `SELECT * FROM backups ORDER BY root,batch`。通过内部 `audit(..., validate=True)` 只读核验，不走 CLI registry。

| 观察项 | 实测 |
| --- | --- |
| 全局 index | 38行，前后逻辑逐字段相等 |
| 产品 index | 27行，全部ready；其中18行task以778-开头 |
| 产品 store | 101项，两轮前后 bytes/mode/mtime_ns 均相等 |
| 共享包树（含恢复批） | 两轮前后相等 |
| 正规 archive | 27个逐一verify通过 |
| 散目录 | `legacy-4092a8f-diffs` 14文件、`worktree-archive-specs` 4文件，原位保留 |
| 18散文件对工程回执 | 每文件 SHA256、size、mode均匹配；本轮mtime_ns前后相等 |
| 本QA真实操作计数 | capture0、register0、cleanup0、restore0、移动0、删除payload0 |

独立快照摘要（`json.dumps(value, sort_keys=True)` UTF-8 SHA256）：

- Global rows：`2d65d804935cf76ebeef648535a026a363f9dbfdfa25f373b07a9ad5791b3534`（匹配工程回执）。
- 本轮 store：`d1b4bc5a03ead5e77ee91a0a9d629cdc2989e2a6b1e879867eec76fe2ca0aa96`，两轮四次观察一致。
- 本轮 shared tree：`3f4582e6ace999e87d1775c5e502f3d1ad769bcf590ee3337f8d54e082a083b7`。

工程回执store摘要为 `fe3cf22cdcff73aa440840365366ab80c29a58786e10789f88a290bde546e442`，与本轮不同；缺少工程原始101项JSON，不把两种摘要直接相等作为证据，也不据此推断历史被改。明确可证的是本轮逐项前后不变、回执18个文件bytes/mode匹配、27archive验证通过；历史mtime逐项相等只属于工程回执。只读快照不持全局锁，不承诺排除其他进程并发。

## audit 假阳性／漏检边界

1. **真实 audit 整体仍为 false。** 只有两个错误：上述散目录缺 `manifest.json`。对“正规 archive 是否损坏”而言属于散件导致的告警噪声/假阳性；不是27批损坏。没有通过 skip所有missingmanifest 消除它们，也没有伪造manifest。
2. **独立可复现的既有漏检边界：** audit只遍历store、不对账index；已登记目录整体移走时，audit可返回 `ok:true,batches:[]`。这是audit不能作为index完整性证明的边界，新register通过同root index/store并集会拒绝，故不是本次registration修复漏检。
3. 在store中确实存在的坏archive仍被audit verify捕获；新增用例同时放散目录和坏archive，得到两个独立错误，坏archive不被掩盖。
4. register不是全archive校验器；它新增ready普通文件存在性检查但不验证zip内容hash，保留原有audit/restore/到期cleanup完整验证及cleanup阶段错误语义。不得把register exit0当作恢复可用证明。
5. 无index且所有证据丢失的非生成式普通目录无法从内容外推managed身份；精确生成式ID目录保守拒绝可能包含刻意同名普通目录。该边界符合指定分类，不虚构历史来源。
6. 未纳管dot临时条目仍按旧register语义跳过，audit会报incomplete temporary operation；本次没有扩展该策略。真实store未见此类额外audit错误。

这些既有审计边界保留并披露，不阻止当前共享修复放行；如果后续要求audit与index完整性对账，应由主理人另定范围，不能在QA只读授权内扩写共享源。

## 文件交付、检查与下一 owner

- 新增测试：[scripts/backup-shared.qa.test.py](../../scripts/backup-shared.qa.test.py)。新增报告：本文件。其余产品dirty、共享文件、SKILL/catalog、历史manifest/index策略均未修改。
- 4个Python文件内存compile通过、无pycache；任务树 `git diff --check` exit0。新增文件另检查尾空白、相对链接和代码围栏。
- QA未运行产品transaction、全产品gates、Host/L2/浏览器、Dev/Prod：这些不属于本轮共享修复QA执行范围，且真实备份副作用由主理人协调。未改hook、构造hook上下文或绕过拒绝；新增测试write和两次正常edit均直接成功。
- **下一 owner：主理人/T03工程。** 保持当前共享hash，恢复既有T03事务与恢复验证，再执行对应Host/gates/独立集成验收。共享前置阻断解除，不授权本QA执行这些后续写操作；不宣称整个#778可合入或关闭。
