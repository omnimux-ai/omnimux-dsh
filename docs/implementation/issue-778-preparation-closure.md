# Issue #778 — no-pnpm 与准备 FD 合同收敛

## 状态与范围

**两项准备合同局部闭合，工程 IS_PASS: YES；最终同状态 149/149。#778 整体仍 IS_PASS: NO。** 本文不签发独立 QA，不放宽 architecture/followup，不把历史 T02 66/66、T03 65/65 拼成本次通过；最终数量来自单次六文件合并执行。

- 固定工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778`。
- base/HEAD：`580234923268673562cacb5cd01aebdb780339e1`，指定本地 dirty 审查面；不 fetch/rebase/commit/push。
- 写集：`scripts/managed-tarball.mjs`、`scripts/managed-tarball-archive.py`、`scripts/materialize-graph.mjs`、`scripts/materialize-cache.mjs`、新增 `scripts/managed-tarball-preparation.test.mjs` 和本文。
- 原独立 `scripts/managed-tarball-t02.qa.test.mjs`、既有 archive/cache/transaction/recovery 测试均未修改。未改 shared 工具路径/实现、CI、package/lock、公开 sync、真实 Dev/App/Host/Prod；无子代理或成员交流。
- 已完整读取 architecture 329 行、followup 243 行、最新 resumed 90 行、T02 retest 77 行及四模块。最新用户授权优先于历史共享阻断记载；未重试已熔断架构评估。

## 实现

### 1. 无 pnpm 进程的等价图证明

`GraphInspector.capture({withoutPnpm:true})` 不构造 listJson。新增 lock occurrence 遍历：从 importer 沿精确 lock locator（含 peer context）逐 consumer Node 搜索路径解析，验证磁盘 package identity；保持原完整磁盘 inventory、approved embedded payload、native bytes、absence、bin、拓扑、declared/peer/visible ghost 边和保护面检查。

普通 `capture({listJson})` 使用相同 occurrence 映射，并额外交叉核验真实 list，因而两种模式共用后续所有图语义。默认缺 list 仍拒绝；不能同时提交 list 与无进程模式。managed spec 的前态及 no-op 二次复核选择该入口，非 no-op 仍由原受控 runner 调用真实 pnpm。

### 2. 现有 DirectoryAnchor 的准备扩展

Python 新增内部 `prepareFiles` action，只有 copy/write/mkdir/sync/identities/batch 数据操作，不接受命令。普通复制持有源和目标完整祖先链，递归子目录延伸原 DirectoryAnchor，no-follow/O_EXCL 分块复制、bytes/mode/身份核验；不重新解包、不实现安装器。写通过持有目标目录 FD 创建私有临时叶、fsync、rename 并核验绑定。递归 sync 不跟随 pnpm symlink，核验目录 inventory 与叶身份。

T03 候选快照/三文件 copy、manifest/.npmrc 写、source 父目录与递归 sync 接通原语。T02 私有 HOME/config/cache/store 等通过同一 anchored batch 创建；空 npmrc 经 no-follow FD 检查。runner 持有 cwd、私有环境目录和 candidate source FD 至进程结束，以 fchdir 设置 cwd，启动前及结束后复核路径/dev/ino；T02 调用前后亦核对候选/source 预期身份。保留原 lifetime pipe、process group、lease、timeout/output/abort/reap 语义。

范围仍为受支持本地 FS、合作入口和协调窗口；不是抵抗任意同 UID 恶意程序持续改写路径的承诺。

## 红绿证据与待汇总全集

- 新增第一批 10 个红例：job `bash-410`，0 pass / 10 fail，exit1，7897.78825ms。2 项缺无进程图入口；3 项真实 pnpm sentinel 被触发；5 项缺 prepare_files API。
- 定向 job `bash-411`：5/10，通过祖先替换拒绝，暴露新原语将 rename 引起的正常 ctime 变化误判；修源码，只在 rename 后比较 dev/ino/size/mtime，临时叶 rename 前仍五字段检查。
- 定向 job `bash-412`：9/10；payload mutation 夹具实测 pnpm file 安装与 source 共享 inode，原地写同时修改两面。改夹具为 unlink 安装叶后写漂移，新增 source hash 未变断言，保留原拒绝断言，不改变产品行为。
- 定向 job `bash-413`：11/11，exit0，12254.581459ms。增加真实 pnpm exec 自有 fixture 替换 cwd 的结束后拒绝及预期 inode 启动前拒绝；hoisted/isolated 均输出 spawns=0 / graphEquivalent=true / nodes=3。
- 第一轮完整 job `bash-414`：142 tests / 141 pass / 1 fail / 0 cancelled/skipped/todo，exit1，608349.980209ms；T02 65/66、T03 65/65、新增11/11。独立 QA-GRAPH02 所需旧 `missing from pnpm list` 诊断被新比较提前替换，属于错误消息兼容回归；源码补精确 missing 检测，不修改独立断言。定向 QA-GRAPH02 1/1、exit0。
- 第一轮运行期间，只新增未被该轮加载的7个 preparation 测试，不改该轮产品源码；递归源/目标/sync三个窗口定向3/3，已打开源/目标FD、完整复制正例、no-op二次突变四项定向4/4。它们不计入第一轮142项。
- 第二轮最终 job `bash-415`：**149 tests / 149 pass / 0 fail/cancelled/skipped/todo，exit0，655897.736292ms**，2026-09-08 22:02–22:13 +08:00。开始前固定五文件SHA，结束后全部相同。第一轮后只修诊断、删除cache未用import和重复candidate fsync（事务根递归已包含candidate）。共两轮完整，无第三轮。

| 最终同次文件组 | 测试数 | TAP编号 |
| --- | ---: | --- |
| 新增 preparation | 18 | 1–18 |
| 原 recovery | 19 | 19–37 |
| 原独立 T02 QA（只读） | 16 | 38–53 |
| 原 transaction | 46 | 54–99 |
| 原 archive/request | 40 | 100–139 |
| 原 cache/graph | 10 | 140–149 |
| 合计 | **149** | **T02 66 + T03 65 + 新增18** |

新18项组成：两种linker的真实list/无进程完整输出等价及spawn sentinel2、旧图突变3、no-op第二次全图重验1、copy/sync完整模式正例1、真实pnpm前后身份1、祖先/递归/已打开文件FD的绑定替换10。用例内多个断言不重复计数。原131项文本与hash全部保留，原独立测试未降低断言。

pnpm exec 仅执行本任务自有 cwd 置换fixture验证worker边界，不运行业务包构建。FD竞态在既有helper的进程内测试seam注入，不来自生产JSON/env，不宣称穷尽所有内核指令间隔或永久IO故障。

完整命令：

```sh
source .workbuddy/managed-778-t01/env.sh
export AGENT_BACKUP_STATE_DIR="$HOME/preparation-closure-registry"
node --test --test-reporter=tap \
  scripts/managed-tarball.test.mjs scripts/materialize-cache.test.mjs \
  scripts/managed-tarball-t02.qa.test.mjs \
  scripts/managed-tarball-transaction.test.mjs scripts/managed-tarball-recovery.test.mjs \
  scripts/managed-tarball-preparation.test.mjs
```

实测 Node v25.8.0、Python3.14.6、pnpm11.7.0，复用私有 env.sh / wrapper，未 workspace install。最终结果如上，所有测试job均已收集结束，未留后台任务；preparation任务临时目录已由after清理。

## 恢复点与测试隔离

四份 dirty 模块当前 bytes/mode 没有既有精确恢复点，真实共享 capture `20260908T134025Z-0d1f3241ebc7`：4 files、108359 source bytes、31478 archive bytes、30天保守 retention，default global registry 登记成功，cleanup deleted0/freed0。没有重复备份已有精确内容，没有 stash/reset。

实际 shared restore 在私有 HOME/AGENT_BACKUP_STATE_DIR 内完成，4份 bytes/mode 均比对 manifest 通过，恢复演练临时目录已清理；payload ZIP CRC 和 archive SHA256 再验通过。后续事务测试均显式私有 registry；shared payload 仍按工具原合同落主项目 `.agent-backups/`，没有另造存储体系。

21:51账户只读逻辑摘要：102行，SHA256 `a225e525077361018382a1a47228d994793e8db5dcda33b88b87c187b23cc030`（SELECT * ORDER BY root,batch 后 json.dumps sort_keys=True）；包含本次必要 capture 自动登记旧项目批的标准副作用，不宣称账户始终零写。22:02变为103行、摘要 `010ee5fe4e20cc6aefb943dff0d710714d6ea963d8c41999326a78507dd43c9e`；只读归因发现唯一更新批为外部 `landing-light-cards`（root `/Users/x/.codex`、批 `20260908T135429Z-5fb38895ae1a`）。不能宣称全账户零变化；本次事务测试仍只登记私有 registry。22:13最终104行、摘要 `6f3b2d372fc554e26d79c2ea2325ad4deb452448532b11f73cf8d75eef3db613`，另一个外部批为同root的 `landing-copy-rewrite` / `20260908T140707Z-5fd1b8a63a5a`；本项目在必要源码批之后的账户新增行实测为空。

本次实际新批73（源码1×4文件，事务测试72×2文件），148个归档条目；最终全部ZIP CRC、每成员SHA256通过。私有registry163行，摘要 `ba0a2ab58d47b9ca150fdd61e898e6c63359376a75a5eb005f64299b0c1b9a55`。私有registry包含工具自动登记的旧项目批，163不是本次新建数量。没有prune或删除恢复payload，真实事务restore逐次由原门槛验证两文件内容/模式。

## 最终源码身份（第二轮开始固定）

| 文件 | SHA256 |
| --- | --- |
| scripts/managed-tarball.mjs | `1d89f45c2008a5df5b1bc0a2e500d3709ef30809baa457027e4231ea305eddf1` |
| scripts/managed-tarball-archive.py | `f8170b3ffc2b5703da3a014e802e490562dff34c6f43668b81d8e591c9a3e316` |
| scripts/materialize-graph.mjs | `4c5aa3455658bda652701f61544cc707b7edbf5120d0a533d4b28834266ef7a7` |
| scripts/materialize-cache.mjs | `b8d84476a281b5802671a28bbe0bcfdeba7bac8445f508959cbfe0495331911d` |
| scripts/managed-tarball-preparation.test.mjs | `c2b88495381125c42109bd041aef6ce315953f5a0a455141538d731c8146e866` |

四个 Node syntax、Python AST、git diff --check 均 exit0；恢复点对照全局审查确认没有第二套解包/安装实现、无跨文件 import 环、公开请求与 journal schema 未改。新操作通过 graph 的薄 helper bridge 调既有 Python；cache 不反向导入协调器。

## 未触碰身份和外部缺项

- 独立 QA SHA256：`f2a3be3a05952957d9aa7e66a32c42ea859d9cb22fe4d2d373e268b47fc97364`。
- transaction：`2840f003e85c6512dd090b560cfa916d2552415f9a17bc175b8dee7b4fb2d524`；recovery：`596da224327ea4255dc8485b1669c34cd0b583d98a94497070effa749f7d804e`。
- shared backup.py：`e744e95c03e3b60471621341e9a9610c674944bc04c83a4b4a978274f25605d7`；retention test：`343d081792f653d735fe222ef91330f1b7acbd4be9f1d054717517d396d3ee6b`。
- CI shared 工具 availability 不在本次写集，依赖外部安装/供给；不复制工具、不造回执、不豁免缺失。
- 全 gates、普通 sync 回归、真实 synthetic Host、最终独立 QA、CI/MQ/Dev 未执行，由主理人/T01后续承担；本次局部合同闭合也不构成 #778 全 PASS。
