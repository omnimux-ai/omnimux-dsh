# Issue #778 — 共享备份修复验收回执（2026-09-08）

## 执行身份

- 任务 cwd：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778`；HEAD/base：`580234923268673562cacb5cd01aebdb780339e1`，保留既有 dirty。
- 工具会话默认 cwd：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`。main 观察 HEAD `df0397b2860a4dcebe618651b3089febff350164`，包含 `9b0ab28906e72b69ac1c5dcd47c3ddaee59d0865`。main hook/config 与 `9b0ab289` 对比无差异；未修改 main、旧任务树 guard、hooks 配置或构造 hook 上下文。
- 18:31 shared scripts/tests、19:05 必要 capture/正常 index/既有 expiry、19:41 hook 最小修复授权继续有效。此次正常 edit 实际成功，无拒绝后改工具绕过。
- 恢复批 `20260908T110759Z-a717f5040af9` 仍为 ready，ZIP 校验通过，index 12543 bytes，expires_at `2026-10-08T11:07:59+00:00`。批内两文件原 SHA256/mode 与修改前 live 精确一致；复用前序实际 restore2 证明，本轮未再 capture/restore。

## 隔离红绿测试

使用真实共享脚本和完整 discover；外层 HOME 私有，每个既有 setUp 另设私有 registry/root。没有改 `tests/test_backup.py`，没有将真实项目伪装到测试 registry。

```sh
python3 -B - <<'PY'
import os,tempfile,unittest
from unittest.mock import patch
with tempfile.TemporaryDirectory(prefix='backup-778-tests-') as home:
 with patch.dict(os.environ, {'HOME':home,'AGENT_BACKUP_STATE_DIR':home+'/registry','PYTHONDONTWRITEBYTECODE':'1'}):
  suite=unittest.defaultTestLoader.discover('/Users/x/.agents/skills/agent-backup/tests')
  result=unittest.TextTestRunner(verbosity=2).run(suite)
  raise SystemExit(not result.wasSuccessful())
PY
```

| 阶段 | 实际结果 |
| --- | --- |
| 原实现 + 新增15测试 | exit 1；Ran 45 tests in 4.419s；FAILED (failures=6, errors=3)，其余36通过，原30测试均通过 |
| 修复实现 + 同一45测试 | exit 0；Ran 45 tests in 4.317s；OK |
| 语法 | 三个 Python 文件逐一 `compile(text, path, 'exec')` 通过；无 pycache |
| 全局一致性检查 | 以已验证恢复 ZIP 内原文件为基线，在内存生成统一 diff；仅 register 分类/payload guard、manifest object 校验、registration 回执和15个测试；IS_PASS: YES（工程自检，非独立QA） |

红测失败：混合 store、其他 root 同名散目录（FileNotFoundError）；worktree 混合 store（capture ok:false）；孤立 index 目录消失被忽略；ready 缺 payload/非普通 payload/无 policy 缺 payload 错误成功；JSON 数组 manifest 产生非 JSON 异常输出。均在源码修复，不通过修改既有断言掩盖。

新增覆盖：混合 store bytes/mode/mtime/expiry 保留；生成式 ID 全元数据丢失；仅 payload；仅同 root index；store 消失但 index 仍在；跨 root 同名不误分类；错误 JSON/非 object/错误 id/root；ready 缺 payload 不改既有 bytes、不建0字节行；无 retention ready 仍拒绝缺 payload；目录/manifest/payload dangling symlink；非普通 payload；expiring/pruned 缺 payload 及中断清理恢复；失败仍保留新 recovery ID 和单批 commit；worktree 共 primary store。

## 真实登记原始回执

执行开始：`2026-09-08T13:05:55.520799+00:00`（21:05:55 Asia/Shanghai）。

```sh
/opt/homebrew/opt/python@3.14/bin/python3.14 -B \
  /Users/x/.agents/skills/agent-backup/scripts/backup.py register \
  --root /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778
```

实际 HOME `/Users/x`，未设置 `AGENT_BACKUP_STATE_DIR`，未传 adoption approval，默认生产 registry `/Users/x/.agent-backup/index.sqlite3`。exit 0，stderr 为空；stdout：

```json
{"ok": true, "action": "register", "adopted": [], "indexed": ["20260907T011853Z-c702117cbdd1", "20260907T011854Z-172d6d61f625", "20260907T011854Z-69397d74239c", "20260907T011854Z-91084edceb60", "20260907T011854Z-c48714fb0297", "20260907T011854Z-fc033353cbd2", "20260907T011855Z-6f31ebb38908", "20260907T011855Z-8096a8837438", "20260907T011855Z-a119fbdae438", "20260908T094501Z-d8954e95f9c3", "20260908T094507Z-3d2e85a05d45", "20260908T094537Z-1aa54708603d", "20260908T094545Z-a0b69eabe085", "20260908T094552Z-e5ff6848d545", "20260908T094600Z-fded6563265f", "20260908T094607Z-a99223c1d1ad", "20260908T094615Z-ca53d718f647", "20260908T094623Z-8ad20a2e3e48", "20260908T094630Z-ec576c3a51b0", "20260908T094638Z-46bee7c64984", "20260908T094645Z-fff11c207233", "20260908T094654Z-2a975f5a9de0", "20260908T094702Z-dd308ea4b04f", "20260908T094709Z-f0dd5f55858f", "20260908T094717Z-c8a18ef1310a", "20260908T094720Z-7be2f7bccf32", "20260908T094725Z-4098fe6c1a57"], "unmanaged": ["legacy-4092a8f-diffs", "worktree-archive-specs"], "index": "/Users/x/.agent-backup/index.sqlite3"}
```

正常 registry lock/SQLite CREATE TABLE IF NOT EXISTS/chmod/commit 与27次逐批 UPSERT 属真实执行副作用，不能称 register 只读。未手写数据库。前后 SELECT 全局38行逻辑内容逐字段相等；不声称 SQLite 文件物理字节未变。

```json
{
  "store_entries": 101,
  "store_before_sha256": "fe3cf22cdcff73aa440840365366ab80c29a58786e10789f88a290bde546e442",
  "store_after_sha256": "fe3cf22cdcff73aa440840365366ab80c29a58786e10789f88a290bde546e442",
  "store_unchanged": true,
  "global_rows_before": 38,
  "global_rows_after": 38,
  "global_rows_before_sha256": "2d65d804935cf76ebeef648535a026a363f9dbfdfa25f373b07a9ad5791b3534",
  "global_rows_after_sha256": "2d65d804935cf76ebeef648535a026a363f9dbfdfa25f373b07a9ad5791b3534",
  "global_rows_unchanged": true,
  "project_rows": 27,
  "project_778_rows": 18,
  "project_states": ["ready"],
  "new_captures": 0,
  "cleanup_invoked": false,
  "payload_deleted": 0
}
```

摘要算法：store 相对路径→`mode,mtime_ns,kind`，普通文件另含 `size,sha256`，排序后 `json.dumps(value,sort_keys=True)` UTF-8 SHA256；global rows 为 `SELECT * FROM backups ORDER BY root,batch` 的 dict 列表，同一算法。真实 snapshot 的相等断言通过。只读 SQLite URI `mode=ro` + `PRAGMA query_only=ON`，不持全局锁，不声称排除其他进程并发；仅证明此次前后观察相等。

## 真实只读 audit 结果（前后相同）

为真正只读，在 `python3 -B` 内加载共享模块，调用 `project_roots(task)` 和 `audit(source, primary, validate=True)`，不进入 CLI registry。27 正规批均 ready、archive verified；audit 总体 `ok:false`，errors 仍只有：

```json
[
  {"batch":"legacy-4092a8f-diffs","error":"[Errno 2] No such file or directory: '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-backups/legacy-4092a8f-diffs/manifest.json'"},
  {"batch":"worktree-archive-specs","error":"[Errno 2] No such file or directory: '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-backups/worktree-archive-specs/manifest.json'"}
]
```

此次有意不重构 audit。注册阻断已解除不等于 audit 全绿，更不等于 #778 transaction 已通过。

## 散件保留证据

下表文件前后 SHA256、size、mode、mtime_ns 均相同；两个目录原位保留，未补 manifest。全部纳入上述101条目精确比较。

| 目录/文件 | mode | bytes | SHA256 |
| --- | --- | --- | --- |
| legacy-4092a8f-diffs/omnimux-dsh-wt-assets-content-import-status.txt | 0644 | 764 | 685ea6fbedc71886eb5a9b1ca2d5952b38433d60971b35c8385bd45c553a09af |
| legacy-4092a8f-diffs/omnimux-dsh-wt-assets-content-import.diff | 0644 | 50227 | 942d02b57f24426b5027ed18d78193534833d1794c5cfbdfc8c415316a7d6b75 |
| legacy-4092a8f-diffs/omnimux-dsh-wt-file-selection-canvas-owner-status.txt | 0644 | 6460 | 370082056e8a2c2ba1f456ba269256492c55a6bb53b9d4dc82e7c1ec376e1c0c |
| legacy-4092a8f-diffs/omnimux-dsh-wt-file-selection-canvas-owner.diff | 0644 | 38331 | 880107a4e983007bd49c9873ea432f97e2d4026514e2c658418b1518bfe5958f |
| legacy-4092a8f-diffs/omnimux-dsh-wt-file-selection-reuse-status.txt | 0644 | 6757 | eb705f9760bb4d3159814e1e4c63d784410ba073101093e385254556ec5bc935 |
| legacy-4092a8f-diffs/omnimux-dsh-wt-file-selection-reuse.diff | 0644 | 431629 | 7cb9d92d9a1fcdf567097dab537cf6d0f4fa096170d14655951821bf9446f94f |
| legacy-4092a8f-diffs/omnimux-dsh-wt-hub-file-transfer-status.txt | 0644 | 533 | f646c07a23d70ecfed424fe397b7cd1c3ab364487f4b40aad8da9bfde40c2196 |
| legacy-4092a8f-diffs/omnimux-dsh-wt-hub-file-transfer.diff | 0644 | 17454 | 65ed2399bc44f0e9d2956f2523a27bfa286cf81cb2e42c987c53d6008d9d996f |
| legacy-4092a8f-diffs/omnimux-dsh-wt-product-path-entry-status.txt | 0644 | 739 | b9230da1b67f3249d971ddaec5cfe353757fa57b9a995c57dda7b50c44e0f2ae |
| legacy-4092a8f-diffs/omnimux-dsh-wt-product-path-entry.diff | 0644 | 3272 | 7c05bcba3aa4a9d1fc63099a8f3bbf3bb5c1f1922ff1e45dd88b39fd3a5b69ca |
| legacy-4092a8f-diffs/omnimux-dsh-wt-workflow-content-import-status.txt | 0644 | 3640 | 31dec51a982e56fa09ce52d02b3b5929c506d6f3c26ae77898935cbdbc10cc9d |
| legacy-4092a8f-diffs/omnimux-dsh-wt-workflow-content-import.diff | 0644 | 161417 | 878456c6d31bb42c2690871dc1f11ffdd1fbc8ca153432cecdaed913af69906d |
| legacy-4092a8f-diffs/wf-origin-before-20260906a-status.txt | 0644 | 3557 | fadc28711230be07f4dd5290df4228c1825a539eb9326e74ec69e7eb3cbd12fa |
| legacy-4092a8f-diffs/wf-origin-before-20260906a.diff | 0644 | 152544 | c2455db2d7aa3380563120d4aae27d47216d08dbc5244bf4b43c031ec62f77d4 |
| worktree-archive-specs/2026-09-05-composer-add-direct-trigger-design.md | 0600 | 27090 | d86bb3244ef81c3f912af0de55c33f4fa4164c7292e7b200c11cd6bab16b81fb |
| worktree-archive-specs/2026-09-05-composer-add-direct-trigger-prd.md | 0600 | 20793 | 2e9b2d823d4c24d698319be9aebeec6a8582db42a10c4355c5bb424e645d0bbd |
| worktree-archive-specs/2026-09-05-model-io-contract-compatibility-design.md | 0600 | 35869 | 1a0fa3afcc7d32a810963fe3880800cc2d8d9312f67bb4865307f0e73736ae4a |
| worktree-archive-specs/2026-09-05-model-io-contract-compatibility-prd.md | 0600 | 24034 | 57700a7ee38cb9c398f607b88c1ffa15cd9b58ee981f34d8a6f476b919eee5bc |

## 写集与后续

共享真源仅 `scripts/backup.py` 和 `tests/test_retention.py`；任务树仅[工程报告](issue-778-shared-backup-fix.md)与本回执。未改 SKILL、catalog/启用路径、retention/global policy、产品源码、CI、既有备份与 hooks。未碰 main 他人 `plugins/omnimux-market/catalog/covers/video-deconstruct.png`；未 stage/commit/push/fetch、启动子代理或执行 #778 transaction/Dev/Prod。工程交主理人安排独立 QA；独立 QA 通过后才恢复 #778 transaction 流程。
