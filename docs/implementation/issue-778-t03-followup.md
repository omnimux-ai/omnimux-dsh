# Issue #778 T03 — 事务与恢复工程

## 结论与状态

**IS_PASS: NO。** T03 完成主要异步接线及独立恢复模块，未完成成功交易/全发布故障矩阵的实际验收。真实共享备份 capture 在登记阶段被既有缺损 legacy 项阻断；未绕过、不伪造回执、不进入 PREPARED。当前代码不可作为最终交付或 Dev 操作依据。

- 唯一任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778`。
- base/最终 HEAD：`580234923268673562cacb5cd01aebdb780339e1`，未提交。
- 源码写集仅 `scripts/managed-tarball.mjs`、`scripts/managed-tarball-transaction.test.mjs`、新增 `scripts/managed-tarball-recovery.test.mjs` 与本报告。
- 临时测试、两文件恢复 staging 在本任务 `.workbuddy/`；共享工具按授权写同项目主路径 `.agent-backups/`。未改其他源码、shared tool、global index、旧备份材料。
- 未派代理/直连成员，未 stash/commit/push/PR、workspace install、全 gates、真实 L2/Dev/Prod/官方操作或重启 App。

## 完整读取与上游身份

指定 PRD83行、architecture329行、followup243行、总工程100行、T01报告92行、T02报告64行、QA106报告80行均完整分页读取。加载 agent-backup、repo-workflow、code 技能；实际读取共享工具 capture/restore 接口及源码。T02 精确参数按其报告落实。

T02 三个消费模块 SHA256 与接手相同：

| scripts/ 文件 | SHA256 |
| --- | --- |
| managed-tarball-archive.py | 0f211c1c878fe90bf7bf4a5f51d418b5004e56a52b8a3e8fe7eb0aa7d52d34d0 |
| materialize-graph.mjs | 0d888a6bf5f1932ad07151992073be1fcc02123248401d0e2f4b92ed57fd5935 |
| materialize-cache.mjs | 30937a076306c7d050c7d442f4fb2315d059519b32113e05c5fcd319e741a985 |

独立 T02 QA 新文件由主理人另派 owner 产生，未修改或将其结论混成本包 PASS。T02工程44项兼容通过不等于其新增独立QA问题已经修复。

## 已实现接线

1. `ManagedSync.run/recover/prepare/installCandidate/commit` 为 async，内部 CLI await；GraphInspector 前置统一 runner list JSON，传入批准 archive payload。Python freeze 0400 替代 Node 无限 readFileSync 冻结，五项 identity 全十进制字符串。
2. candidate deps 调用 `prepareCandidateDependencies`，含原 request.profile、私有 config/env/store、await runner；仍由 T02 执行锁先比较、获取和最终 offline。candidate/full live 图复核已接；storeRef 在 COMMITTED receipt 保留，不误删 dependencies 私有根。
3. `runPnpm(argv,{cwd,env,signal,...})` 使用固定任务 PATH 真实 pnpm；ManagedSync 首次命令前验证11.7.0。Python supervisor 拥有进程组，以 stdin 生命周期管道响应协调器退出，TERM宽限后自身进程组KILL；只杀当前仍持有组ID的 supervisor 组，不对遗留 PID 发信号。输出有界、stderr丢弃不出凭据、超时/abort返回脱敏结果。
4. worker kernel lease 写入 journal 的 starting/reaped 状态；恢复先检查原 PID 是否存活（含重用时保守拒绝，不杀）及 lease 可获取。无原 tgz/pnpm/network 的恢复核验使用前态 manifest/lock、完整 node_modules bytes/mode/link 和 protected 清单，绑定已捕获图。
5. 恢复空间计入全安装图×3、全部sources、冻结/展开输入和64MiB余量；probeRecovery核同FS/正反rename/fsync/availableBytes，检查目录权限及live四项设备。并非承诺运行中永不ENOSPC。
6. 每次业务rename持久intent后调用T02 FD safeMove，保存after身份；恢复反向intent、可二次中断，错误7不假称没动。journal/创建父目录/清理复用Python DirectoryAnchor；旧Node绝对路径业务rename删除。
7. 两份非秘密manifest/lock staging绑定before hash；生产默认调用shared capture并restore到空目录。注入RecoveryReceipt也必须实际shared restore核bytes/mode，假verified无法进入PREPARED。
8. PREPARING无move异常只清本事务scratch，不覆盖外部修改；终态原子compact receipt上限64KiB、不含全图，terminal后清理可显式重试。旧图材料只在终态写成功后清理。

## 真实 backup 阻断与恢复演练

实际诊断命令：

```sh
python3 /Users/x/.agents/skills/agent-backup/scripts/backup.py capture \
  --root "$PWD" --task 778-t03-diagnostic \
  --reason 'two-file managed transaction recovery point' -- \
  .workbuddy/managed-778-backup-0a702c9d-07f9-4998-9f08-bef4ac4c6f19/package.json \
  .workbuddy/managed-778-backup-0a702c9d-07f9-4998-9f08-bef4ac4c6f19/pnpm-lock.yaml
```

- exit1，`backup_ok:true`，batch **20260908T094720Z-7be2f7bccf32**，`failed_phase:registration`。
- 原因：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-backups/legacy-4092a8f-diffs/manifest.json` 缺失。未删除/改名/编造legacy manifest、未改global index、不使用测试registry override绕过生产登记。
- 交易批跑发现重复同因后取消；在停止前17个合成交易各捕获2文件，加诊断批1次，共**18批/36文件**（全部2文件最小范围，不是36个不同业务文件），登记未完成。保留这些真实batch和staging，未擅自prune；后续应修登记后使用工具管理，不按年龄删散件。
- 工具默认记录保守30天weighted retention，因登记失败不能宣称全局登记/到期清理成功。

同一诊断batch实际执行：

```sh
python3 /Users/x/.agents/skills/agent-backup/scripts/backup.py restore \
  --root "$PWD" --batch 20260908T094720Z-7be2f7bccf32 \
  --to "$PWD/.workbuddy/managed-778-t03-restore-diagnostic"
```

exit0，verified_files=2。源/恢复独立核bytes及POSIX mode均相同：
- package.json `334d14daa3b79a966377577539984cfb45592a06485ef2e8388110c49efea361` / 0644。
- pnpm-lock.yaml `06d29e353f9b1e218d17067023e87fe7d648efa04209422d4fb46a54b61bace8` / 0644。

**restore成功不掩盖capture登记失败，未把该回执用作生产放行。** 新代码会保留backupFailure的batchId/backupOk/failedPhase到终态，staging失败材料保留。

## 实际验证（不拼成完整事务PASS）

统一环境：`source .workbuddy/managed-778-t01/env.sh`，Node25.8.0、Python3.14、pnpm11.7，任务私有HOME/TMP/config/cache/store及只读依赖，不workspace install。

| 命令/范围 | 实际结果 | 日志（.workbuddy/managed-778-t01/） |
| --- | --- | --- |
| 首个真实hoisted交易诊断 | 失败；最初runtime目录未建，修复；随后真实backup登记阻断 | 工具输出 |
| 全transaction第一轮 | **取消，非完整计数**；到backup之前负例通过，成功/提交矩阵因登记失败未触发 | t03-transaction-round1.log |
| recovery第一轮 | 11/12，唯一KILL测试lease路径误指父home，修复fixture | t03-recovery-round1.log |
| recovery第二轮12 + T02兼容44 | **56/56，0fail/0skip，exit0** | t03-compat-final.log |
| transaction定向未发布负例 | **7/7，0fail/0skip，exit0**；filter packing、source/lock/install失败、伪回执、PREPARING外部漂移、公开混参 | t03-prepublication-final.log |
| recovery最终（新增3个journal IO点） | **15/15，0fail/0skip，exit0** | t03-recovery-final.log |
| Node syntax三文件、git diff --check | exit0 | 工具输出 |
| shared restore两文件＋独立hash/mode对照 | exit0 | 上述batch和恢复目录 |

recovery15项覆盖：反向rename前/后KILL再恢复；缺失/截断/schema/move坏journal；旧图和protected外部漂移；未知活PID无信号拒绝；compact receipt cleanup失败重试；恢复intent/result/terminal三点ENOSPC注入；日志上限/timeout/abort；协调器KILL生命周期pipe释放lease。

这些是合成恢复fixture，不是完整成功交易前态。prepared以后的7个发布rename×前后共14用例、真实提交INT/TERM/KILL、搬迁/幂等成功用例仍在transaction文件，**未通过真实backup gate，不宣称已验收**。本包没有靠去掉journal或backup gate做测试。

## 全局一致性审查与明确欠项

**IS_PASS: NO（必需完整交易证据缺失，另有需最终工程收敛的实现边界）。**

- 主理人/backup legacy owner：处理既有legacy缺manifest登记问题；不让新工程伪造该历史来源。恢复登记后才重跑完整transaction，失败最多两轮定向修正。
- T03/最终工程：成功live完整图路径、全部发布rename前后、真实准备INT/TERM/KILL及提交信号、恢复多move二次中断、提交数据fsync/terminal/journal多点IO矩阵还需实际证明；当前15项不是该全集。
- 候选sources复制/若干准备写仍使用Node路径API；已发布四项、journal、父目录创建和删除使用FD锚定，但不能把全准备写的祖先竞态覆盖宣称完成。需结合T02独立QA的解包子目录绑定修复收敛。
- 当前no-op仍需controlled list用于三方图证明，并建立短命事务用于冻结/runner lease；没有第二份安装图，不运行install。与架构“no pnpm”字面存在接缝差异，最终owner应明确只读list例外或提供等价无pnpm证明，不能靠测试checkpoint断言声称没有list进程。
- worker证明依赖合作pnpm不自行setsid逃逸；lease缺失/占用保守7。没有Linux执行证据、硬件损坏/永久不可写不保证自动恢复。
- 源父目录mkdir成功但身份journal写失败的狭窄窗口保守exit7，未声称所有掉电窗口自动恢复。
- T01新增cache/recovery测试注册、全gates、真实synthetic Host业务及最终独立QA仍未执行；不修改其写集。最终#778仍QA之前，不能关闭、不能宣称#760环境解除。

## 最终源码身份与下一owner

| scripts/ 文件 | SHA256 |
| --- | --- |
| managed-tarball.mjs | 05937f2f7948483ab7bda476659a14868fd1186bafee8838132d2dd66794d572 |
| managed-tarball-transaction.test.mjs | a8b5be5e5985785083e1e64c891685e4399791a510456a510da0e23ff8a727d9 |
| managed-tarball-recovery.test.mjs | ea0a9f87b22093d2fe9c1fd50ac27e9d5b67f602e51d90944459be1ba8c5a492 |

所有测试job已结束并收集；无后台编码承诺。本包写权交回主理人，建议先解决backup登记及T02独立QA三根因，再指定最终工程owner接管余项和完整同状态验收，不直接进入QA放行/发布。
