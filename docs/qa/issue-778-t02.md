# Issue #778 — T02 独立模块 QA

## 状态与边界

**T02 模块 QA：FAIL / IS_PASS: NO；Routing: Engineer，经主理人转交。两轮已结束，不进入第三轮。#778 整体仍未签收。** 独立 QA 仅检查已交还五文件，最多两轮；源码缺陷交主理人路由 Engineer，不自行修源码。未执行全仓/gates/L2、真实 Dev/Prod/官方目录操作、workspace install、commit/push 或委派。

- 本地固定 base/HEAD：`580234923268673562cacb5cd01aebdb780339e1`，目标为该 base 上未提交 T02 五文件；不是远端 PR 审核。
- 任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778`。
- 已完整读取 PRD 83 行、architecture 329 行、followup 243 行、最终 T02 followup 64 行，随后完整读取五文件。
- T03 正在改变协调器和 transaction/recovery tests，本轮不读取这些文件作稳定证据。
- 工程报告的 44/44 是工程证据，不能冒充独立 QA。原 `managed-tarball.test.mjs:9` 导入变化中协调器，本轮不运行该文件；独立新增测试仅导入 T02 模块。

## 精确 source fingerprint

2026-09-08 17:34 CST 实际 `shasum -a 256` 与工程交还值一致；17:46 结束复核仍全部一致，HEAD 未变。QA 测试文件最终 SHA-256：`f2a3be3a05952957d9aa7e66a32c42ea859d9cb22fe4d2d373e268b47fc97364`。

| scripts/ 文件 | SHA-256 |
| --- | --- |
| managed-tarball-archive.py | `0f211c1c878fe90bf7bf4a5f51d418b5004e56a52b8a3e8fe7eb0aa7d52d34d0` |
| materialize-graph.mjs | `0d888a6bf5f1932ad07151992073be1fcc02123248401d0e2f4b92ed57fd5935` |
| managed-tarball.test.mjs | `46da028b83eeb3d279bcfb9477182633015197cefecf8ea3a4cb4d0ce2dcb291` |
| materialize-cache.mjs | `30937a076306c7d050c7d442f4fb2315d059519b32113e05c5fcd319e741a985` |
| materialize-cache.test.mjs | `06075d9a76ff06f349d0f5f8431806d8c0dbe51fbc8d088bec9dd9ae17990c20` |

## 逐项验收矩阵（仅模块职责）

| 范围 | 当前状态 | 独立核查目标 |
| --- | --- | --- |
| A02 freeze/identity/完整 JSON | 局部 PASS | QA-ARC04 五字符串/0400/输入字节不变；完整 JSON/其余漂移仅静态读原测试，未独立重跑 |
| A03 流式归档/CRC/尾部/限额 | **FAIL** | QA-ARC01 子目录绑定、QA-ARC05 tar 截断失败；ARC02 根链接替换、ARC03 三种精确预算边界通过 |
| A04 完整 payload/embedded/native | 局部 PASS | QA-GRAPH02 新增 native 字节拒绝；embedded 仅审阅原测试，未独立重跑其真实安装 |
| A05 私有获取/offline/来源限制 | **FAIL（配置预检）** | CACHE02/06 来源 override 未在 install 前拒绝；CACHE01/03/04/05 已验证 config/env/CONNECT/lock 来源安全正面行为；无公网获取重跑 |
| A06 list/lock/disk/peer/hoist | 定向 PASS，非完整 A06 | 不同 peer locator 与同 locator 相同 payload 的两个 occurrence 均保留各自消费/ghost 边；peer 替换/漏 list/native 漂移拒绝，capture 不写原图 |
| A08 safeMove/probe/pending 原语 | 局部 PASS | QA-FS01 坏/缺/活动 journal gate、非法 move/probe 的7/5；safeMove 正反/竞态仅读原测试，不代表事务恢复通过 |
| A01/A07 入口/幂等/原 gate | 未执行 | 属于 T01/T03 集成，不由本模块 QA 签收 |
| A08 完整事务/A09–A12 | 未执行 | 当前用户明确排除；全工程仍未签收 |

## 静态审核与独立实证

- 解包 `_directory` 为子目录逐段 no-follow 打开，但没有像 DirectoryAnchor 那样保存并重验子目录路径绑定；QA-ARC01 确认错误成功，根 symlink 替换的 QA-ARC02 则正确拒绝。
- 图以 locator + 磁盘排序 ordinal 保存 occurrence。QA-GRAPH01/03 确认不同 peer 上下文及相同 locator 相同内容的多实例没有被折叠；仍不把有限布局样本概括成支持任意 pnpm 拓扑。
- `candidateConfig` 对 workspace 的 overrides 仅顶层 key 白名单，来源值校验缺失；QA-CACHE02/06 证明未批准来源配置到达 lock 生成，最后锁比较仍拒绝，因此没有 live 漂移。
- 归档逐块冻结/解码、gzip CRC drain、严格 JSON、五字符串 identity、safeMove 的祖先 FD/白名单及 pending 坏日志 gate 的实现均已静态核对；未重新执行其全部工程测试。

## 测试与路由

Round 1（2026-09-08 17:41 CST）：`node --test --test-reporter=tap scripts/managed-tarball-t02.qa.test.mjs`，15 项 / 11 PASS / 4 FAIL / 0 skip，3065.26 ms，exit 1。失败为 QA-ARC01、QA-ARC05、QA-CACHE02-local、QA-CACHE02-remote。没有后台任务。

Round 2（2026-09-08 17:44 CST）：同一命令，增加1项真实 pnpm 本地 override 补证并收紧 QA 自身临时目录环境；**16 项 / 11 PASS / 5 FAIL / 0 skip / 0 cancelled，3580.80 ms，exit 1**。原15项断言未降低，源码没有修订；失败为原4项及新增 QA-CACHE06。两轮累计执行31次，不是31个独立场景；最终独立用例总数16，三类根因。达到两轮硬上限后停止，不继续测试或修改源码。

环境：macOS arm64，Node v25.8.0、Python3.14.6、真实本地补证 pnpm11.7.0。QA 的持久文件只有本报告与 `scripts/managed-tarball-t02.qa.test.mjs`；样本位于本任务忽略的 `.workbuddy/managed-778-t02-qa-*`，每项 after 清理。本轮无公网请求；网络测试仅本地 CONNECT 拒绝。第一轮 Python TemporaryFile 使用系统默认匿名临时文件，关闭后不持久保留；第二轮显式 TMPDIR 固定任务目录。未运行原44测试，工程44/44不计入独立测试计数。未采集覆盖率，不虚报百分比。

### Known Issues（Round 2 仍失败；路由 Engineer，经主理人转交）

1. **QA-ARC01 / High：解包内部目录替换后错误返回验证成功。** `managed-tarball-archive.py:250–270,324–357,359–378`。在打开 `sub/data.txt` 输出 FD 后将 `sub` rename 为 `detached`，在原路径新建空 `sub`；helper 完成写入旧 FD，然后 chmod 新目录，根 inode 未变，最终返回成功。期望拒绝，实际 rejected=false。归档内容没有被修改，边界外哨兵未变；不是宣称任意恶意同用户抵御，而是 followup §2.4 已要求的写入祖先绑定竞态。需核验每个提取子目录/叶子路径绑定或最终完整物化清单，并保留根 no-follow 行为。
2. **QA-ARC05 / Medium：gzip 完整但 tar 缺结束块仍通过。** `_scan:198–203,281–285`。把 QA 自造 tar 的两个完整成员之后全部 end-of-archive blocks 删除，再合法 gzip；预期按 PRD A03 的截断归档拒绝，实际 freeze 成功。当前仅检查 gzip EOF/CRC 和剩余非零内容，依赖 tarfile 的宽容 EOF 行为。没有 payload 缺失或越界写，但不符合本合同严格归档要求。
3. **QA-CACHE02 / Medium（来源预检缺口，未证明越权获取）：workspace overrides 可以带未批准 file/URL 到达 install。** `materialize-graph.mjs:373–394` 仅校验顶层 key，`materialize-cache.mjs:115–143,168–174` 未校验 overrides 的解析来源；本地/未知 URL 两种输入均实际调用 install runner 1 次，而非预期 0 次。第一轮 runner 在安装边界主动返回9，未运行真实网络/外部读取，故不能据此声称未知 registry 已绕过 CONNECT gate。Round 2 的 QA-CACHE06 使用现有 T01 pnpm11.7 只读 wrapper、任务内另造 `unapproved-local` 目录：lockfile-only 实际 code0，generated lock 包含 override 来源字符串，随后 compareLocks code5 拒绝，未安装/提交替代包，源与 live 哨兵均不变。证据 **不能证明 pnpm 读取了替代包的 payload**（generated lock 未出现替代9.9.9版本），也不能证明 CONNECT gate 绕过。因此缺陷限定为“未批准来源配置进入受控 install，依赖下游失败而非显式来源拒绝”，不是数据泄露/远端代码执行结论。建议对 overrides 等允许字段的值递归分类，允许保持既有受控 semver 解析设置，提前拒绝 file/link/git/任意URL来源；不一律禁用所有合法 overrides。

## 交付与下一责任人

- 独立测试源码：`scripts/managed-tarball-t02.qa.test.mjs`；报告：`docs/qa/issue-778-t02.md`。源码五文件未变，无 commit/push、成员直连或委派。
- `node --check scripts/managed-tarball-t02.qa.test.mjs` 通过。新文件空白差异检查发现报告 EOF 多空行，已修正；未运行全工程 diff/gates。
- 两轮测试子进程均结束；所有 QA 命名样本目录已清理，没有后台服务或 pnpm 遗留。
- 下一责任人：主理人将上述三类根因路由 T02 Engineer 定向修复；保留独立 QA 断言，不在 T03 变化中做横向补丁。返修后的重新验收由主理人安排；本次不继续第三轮。
- 本模块 FAIL 足以阻止其被视为已签收；即使后续模块通过，A01–A12、全工程集成、正式 L2、CI/MQ 与真实 Dev 仍须各自实际证据，不由本报告替代。
