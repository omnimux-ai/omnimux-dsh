# #766 / #768 恢复与清理有界续作

## 范围与基线

- 固定 HEAD `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`，仅 `.worktrees/assets-storage-766`，保留全部已有未提交实现。
- 已全文读取 PRD 332 行、架构 595 行、前工程报告 70 行。不重做架构、不降低 P0。
- 本轮只处理前报告第 4、5 组与必要 storage-fs 操作；不改 client/HTTP/runtime 或其他工作区，不启动 L2，不安装依赖，不委派，不 push/merge/部署。
- 初始状态：工程进行中，**整体 IS_PASS: NO**。最终结论以本文件证据更新为准。

## 首次重试恢复状态

- subagent-47 failed/error，未返回终态；上轮“已修”与 SIGKILL 声明仅为待复验记录，不作为本轮验证通过。
- 第一阶段已完成：复验恢复/清理定向测试、JS syntax/Python AST，实际 exit 与计数见下；保留未提交代码，未跑完整包。
- 第二阶段已完成：新增 `SafeStorageFS.openReadStream(root, relativePath, {expectedRoot})` 与真实 FD 测试；仅写本组 helper 与测试，无跨写/互相通信/L2/#778 门禁修改。
- **有界 helper 实现与恢复复验已交付；本组集成 IS_PASS: NO**：尚有两项跨组 library 契约失败，详见第一阶段与最终结果。不能称全部恢复安全/P0/QA通过。

## 分项待办

| 项 | 故障复现 / 验收目标 | 状态 |
| --- | --- | --- |
| R1 | staged 半文件中断后 O_EXCL 可重试；未知内容保留 | 已修；32MiB 生成样本真实 worker SIGKILL 后新实例恢复通过 |
| R2 | backup 已落盘、receipt 未落盘和 backup 半文件恢复 | 已修；红灯复现、响应丢失及真实 worker SIGKILL 通过 |
| R3 | abandon 安装后缺 afterIdentity、逐项补偿中断重试 | 已修；installing + stagedIdentity 识别安装，补偿写前/完成 receipt；未知 inode 保留 |
| R4 | 目标 pending/active marker、锁恢复与外部 writer 竞争 | 已修；先双锁后复验、恢复原 marker、锁 inode 替换检测、foreign writer 退出后续传通过 |
| R5 | commit.json 缺失/损坏、ready/已切根恢复，不空库、不回滚新增数据 | 已修；目标镜像绑定 Home commitHash；缺/坏单份可恢复，双份丢失保守拒绝；已 active 不重放账本 |
| C1 | 清理逐项 receipt，中断后同一确认令牌幂等重试 | 已修；确认清单持久化，deleting/done/retained 逐项凭据，删除响应丢失和重复确认通过 |
| C2 | 跨 library/artifact/mapping/版本/目录/skip 连通引用保留 | 已修核心图；新增版本边测试先失败后修复；独立成功分量可清理，未将整任务禁用 |
| C3 | 7 天检查至 delete 全程 task lease，锁内重新验证；未知外部变化保留 | 已修；freeze 在首个 hash 前，双锁、逐项重建图，helper 校验目标与账本 guard 后删源 |

## 命令与证据

### 第一阶段首次重试（2026-09-08）

- `node --test src/storage-recovery.test.js src/storage-migration.test.js src/storage-fs.test.js`（assets cwd）：**38 tests，36 pass，2 fail，0 skipped/cancelled，exit 1，4517.881792ms**。
- recovery **21/21**（含两项真实 32MiB 生成样本 payload/versions SIGKILL）、fs **4/4** 通过；migration **11/13**。
- 两项失败均在迁移已 `completed` 后查询 `getView(...).files[0]`：migration.test.js:60 `relative_path`、:179 `real_path` 为 undefined。已定位并行 `library.js:348` 的 `if (!file.relative_path || file.status) continue` 将迁移正常的 `status:'available'` 一并排除，随后 viewOf 缺 probe 隐藏文件。`storage-migration.js:334` 正常输出 available，符合架构 FileRef 契约。**由主理人中转 runtime owner 修复；本组不跨写 library、不放宽断言**。
- 六个 JS 文件 `node --check`（storage-fs/migration/plan 及 fs/migration/recovery tests）、`python3 -c "import ast,pathlib; ast.parse(pathlib.Path('src/storage-fs.py').read_text())"`、本组 scoped `git diff --check`：均 **exit 0**，JS **6/6**、Python AST **1/1**。
- 第一阶段已完成核验与归因，不声称整组全绿。上轮红灯与全包运行无可恢复计数，不补造；本轮不跑完整包、不安装 pnpm 依赖。

### 第二阶段

#### 实现及中转接口

- 本轮仅修改 `plugins/omnimux-assets/src/storage-fs.js`、`storage-fs.py`，新增 `storage-stream.test.js`，更新本报告。storage-migration/plan 与既有本组测试保留原样；未改 runtime/http/library/client、总报告或 storage-runtime.test.js。
- `openReadStream(root, relativePath, {expectedRoot})` 返回 Promise，结果为 `{readable, size, identity, close()}`。`size` 为打开时普通文件 size（number）；**identity 是文件 fingerprint**，`dev/ino/size/mtimeNs/ctimeNs/mode/nlink` 均 string，与 helper hash/stat 现有字段一致，不含 SHA256、rootId、nonce 或根身份。
- `expectedRoot` 可省略（外部小文本 privacy scan 现有调用 `{}`）；提供时必须包含 `path/dev/ino/fsid`，四项逐一核对，忽略易变 `freeBytes`；不完整或不匹配返回 `root-identity-changed`。runtime 传入的 active.identity 已具有这四字段；marker/nonce 校验仍由 runtime 持 lease 负责，本 helper 不凭空解析 marker。
- 流专用打开要求 **canonical absolute root**，不 canonicalize 跟随任何父链接；从 `/` 开始 O_DIRECTORY|O_NOFOLLOW 目录链，再相对父 FD 以 O_RDONLY|O_NOFOLLOW|O_NONBLOCK 打开，fstat 拒绝非普通文件/嵌套卷。旧 scan/copy 根解析行为未扩改。调用方若传 `/var` 等父级别名，应先在授权路径解析阶段采用已核对 canonical path，不能退回 JS absolutePath open。
- Python 持有单个已打开 FD；后续 `stream_read` 仅接不可猜测 key、每次最多 64KiB，base64 经现有 NDJSON IPC 返回，不重开路径。Node Readable highWaterMark=64KiB，单流最多一个未完成 pull；不消费就不继续读，不整文件收集。base64 有固定编码开销，但缓冲不随媒体大小增长。
- `close()` 返回 Promise；可重复/并发调用，等 helper close receipt 或该 worker exit 后才完成。EOF/读取错误自动关 FD，worker stdin EOF 释放剩余读 FD；worker error/exit/stdout EOF 终结暂停中的流。dispose 禁止重新启动。stream 始终绑定原 worker，不把旧 key 发送到重启 worker。
- 每块前后 fstat 比较文件 fingerprint；外部内容变更以 plan-stale 终结，已打开后根路径替换仍只读原 FD，不读取替换树。恶意同用户持续修改/硬件故障仍非绝对无损保证。

#### 实际验证

| 命令（assets cwd） | 实际结果 |
| --- | --- |
| `node --test --test-timeout=20000 src/storage-stream.test.js src/storage-fs.test.js` 首轮 | **17/17，0 fail/skip/cancel，exit 0，458.243584ms**（stream 13项 + fs 4项） |
| 最终 `node --test --test-timeout=20000 src/storage-stream.test.js src/storage-fs.test.js src/storage-recovery.test.js src/storage-migration.test.js` | **52 tests，50 pass，2 fail，0 skip/cancel，exit 1，3565.066875ms**；stream **14/14**（新增真实 runtime lease）、fs **4/4**、recovery **21/21**、migration **11/13** |
| 最终七个 JS `node --check`（原6个 + storage-stream.test.js）与 Python AST | **JS 7/7、AST 1/1，exit 0** |
| 本组 scoped `git diff --check` | **exit 0**；未跟踪新增文件另做内容尾空白/冲突标记检查 |

stream 样本仅生成 0B、257B、2MiB+17B、4MiB 文件；验证精确字节/hash、文件 identity、EOF/早取消/待处理pull关闭后 key 已失效、单块背压、root及parent替换不reopen、根/父/叶链接与 traversal 拒绝、四种根身份不匹配、目录/缺文件、外部修改、SIGKILL/stdin EOF/dispose、缺 Python、真实 runtime beginCommit 等待读 lease 到 helper FD 释放。没有用 lease 替身代替真实 helper。

最终两失败与第一阶段相同，均由 `library.js` 的 available 状态过滤导致；未放宽断言。**IS_PASS: NO（有界整组集成）；helper 流14项与恢复21项通过不代表其他P0关闭。**

#### 下一责任人

主理人中转集成工程：先将 `library.js:makeView` 的排除规则与 FileRef 的 `available/unmigrated/excluded` 契约对齐，保持两项 migration 断言；再用上述四文件命令复验。按 runtime 报告继续真实 HTTP abort/完整包异步兼容集成，不把本组14项当HTTP/UI全验收。其余P0及#778边界如下。

## 保留的其他 P0

前报告第 1（全入口 FD/lease）、2（legacy/上传异步）、3（目录/UI）、6（元数据/兼容）、7（进度/空间压力）、8（集成验收）仍未关闭。Stage/gates 缺依赖与 L2 seed 阻塞沿用前报告，环境由 #778 处理。本轮的测试不能替代真实可移除卷、所有 fsync 边界 SIGKILL、UI、独立 QA。
