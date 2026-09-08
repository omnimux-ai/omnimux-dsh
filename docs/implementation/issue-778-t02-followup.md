# Issue #778 — T02 安全归档、图与私有依赖获取

## 当前状态

**T02 工程 IS_PASS: YES（仅本包已实现接缝与下述44项验证范围）；#778 整体 IS_PASS: NO，尚待T03/T01集成与独立QA。** base/HEAD `580234923268673562cacb5cd01aebdb780339e1`；本包只操作当前任务工作树未提交文件，不代表事务整体、A01–A12 或 Dev 验收通过。

已完整分页读取 PRD 83 行、architecture 329 行、followup 243 行、T01 交接92行、总工程报告100行。冻结接口以 followup §91–99 为准。

## 写入边界

仅 scripts/managed-tarball-archive.py、scripts/materialize-graph.mjs、scripts/managed-tarball.test.mjs、新 scripts/materialize-cache.mjs、新 scripts/materialize-cache.test.mjs 与本报告。已有其他未提交修改保留。禁止修改协调器/事务测试/sync/package/CI/合同；不派代理、不 commit/push/PR、不启动真实 Dev/L2、不读秘密。

## 实现与证据

最终同状态测试（2026-09-08 17:23）：`source .workbuddy/managed-778-t01/env.sh; node --test scripts/managed-tarball.test.mjs scripts/materialize-cache.test.mjs` **44/44，0fail/0skip，24.47s，exit0**。`node --check scripts/materialize-graph.mjs`、`node --check scripts/materialize-cache.mjs`、Python `ast.parse`、`git diff --check` 均exit0。T01 的31/31、28/28和gates127/128属于其独立证据，不计入本包。

第一阶段归档已改冻结临时文件＋有界gzip/tar读取，成员逐块hash/写、只保留package JSON有界bytes；PAX/GNU扩展解析前限额。DirectoryAnchor持有全部祖先，safeMove白名单/intent/两端身份校验，probe同FS正反rename/fsync，pending缺失/坏/未知schema/非法move均拒绝。原32项＋新增freeze/pending/safeMove竞态共35/35 exit0（2026-09-08 16:40，后续仍须最终重跑）。

图模块已开始强制注入listJson并以locator+occurrence标识；私有cache模块已实现注入runner的锁先比对和公共registry获取流程。真实registry测试第一轮0/3暴露pnpm把绝对tgz规范化为相对`file:../viewer.tgz`，校验已改相对于request.profile确认同一授权路径；第二轮进行中，不报通过。所有真实测试仅任务TMP合成样本。

## T03 接缝与剩余项

### Python（JSON stdin，stdout JSON）

- `inspect`、`extract` 原参数兼容；`freeze` 参数 `{tarball,name,version,sha256,destination}`，destination必须不存在，其父已存在。返回 `{entries,digest,identity}`，identity为`[dev,ino,size,mtime_ns,ctime_ns]`五个十进制字符串，冻结文件0400。归档错误exit3。
- `safeMove` 参数 `{profile,txnId,from,to,expected:{from:identity,to:null}}`；from/to为profile相对路径，必须在journal精确四项白名单中且已有durable move intent。journal phase COMMITTING或RECOVERING；反向恢复可交换from/to。返回 `{before:{from,to},after:{from:null,to:identity}}`。rename可能改变ctime，调用端保存返回值；错误exit7，不能当作未移动证明。
- `probeRecovery` 参数 `{paths:[绝对现存目录...]}`；覆盖profile/live四项父目录/candidate/old-generation，至少两个目录必须处于同事务的candidate/old-generation私有区域。返回 `{verified:true,device,availableBytes,identities}`（数值均字符串）；错误exit5。本原语提供同FS/正反rename/fsync/可用空间事实，完整空间估算与PREPARED责任在T03。
- `pending <profiles...>` 缺失journal、损坏JSON、未知schema/phase、非法moves、非终态均exit7；合法终态exit0。`check-locks`无继承FD仍exit10，非法锁描述仍exit3，lock转发子命令码。

### Node

- `new GraphInspector(profile).capture({listJson, approvedPayloads={}})`同步；listJson为T03先await runner `['list','--json','--depth','Infinity']`得到的解析数组。无listJson拒绝，不自行起pnpm。旧tgz目标必须传`approvedPayloads[name]=已验证archive manifest`；受管根依赖自动读取source清单；可按精确locator提供其他批准清单。返回节点键`locator#occurrenceOrdinal`，不按name/version折叠；未知布局/缺失三方映射拒绝。
- `prepareCandidateDependencies({candidate,privateRoot,beforeLock,request,config,runPnpm})`异步。request必须含原`profile`以解析pnpm规范化的相对旧tgz locator；config是candidateConfig返回的`{workspace,config}`，可加`offlineOnly:true`和`signal`。runPnpm参数argv从pnpm子命令开始（不含corepack/pnpm可执行名），options `{cwd,env,signal}`；必须返回Promise `{code,signal,stdout}`并由T03负责有界输出/超时/回收。
- 返回 `{lockDigest,storeRef,acquisition:{mode,packages,registry,frozenOffline:true}}`；storeRef必须保留，搬迁重建显式传`--store-dir=storeRef`。候选获取失败映射Node5；live零写。T03仍须对完整candidate graph compare并在实际live复核。
- 已确认旧协调器不兼容点：调用capture无listJson；identity仍map(Number)；Node仍readFileSync自行冻结；调用链同步。这些必须由T03改接，本包不横写。

### 阶段实证与剩余

2026-09-08 16:56本包一次41/41 exit0，含真实`is-number@7.0.0`新私有store获取、目标本地tgz、完整图比较、删除原输入/profile/node_modules后搬迁offline成功；lockDigest `057467618547e5a6af38ef21c8caf8eab8cb8d41ed361d580472867d8350949d`。embedded、native、两个同内容不同peer实例均正负验证。新增完整格式坏SHA512被pnpm锁生成纠正后，非目标锁比较拒绝，不进入获取；网络失败及共享store哨兵/原profile摘要不变，定向1/1 exit0。

pnpm11.7在`--config.fetch-retries=0`参数组合下锁策略校验无socket并挂起，测试runner60秒kill并wait；改用受支持显式`--fetch-retries=1 --fetch-retry-mintimeout=100 --fetch-retry-maxtimeout=100 --fetch-timeout=10000`后实际连接白名单gate并成功。未关闭supply-chain policy。冻结offline阶段增加拒绝全部网络的gate，43/43最终阶段重验通过（17:19，0skip，16.69s）；不是仅凭`--offline`字面断言。之后扩展真实hoisted回归，首次发现pnpm11.7 list仍返回不存在的virtual路径；采用`.modules.yaml.hoistedLocations[精确locator]`与consumer实际resolve交叉，而非猜路径修正，最终44/44 exit0已确认，包含真实hoisted完整图/ghost依赖保持。

全局一致性复核补齐`.bin`内容/模式和所有现有包名的consumer可见（ghost/hoist）边；增强初始候选锁/非目标spec/source依赖检查，阻止另版viewer作为传递依赖下载。库错误统一候选exit5，Python阶段错误按上文保留。未新增npm/pip依赖。生产无pnpm spawn，临时registry gate有finally关闭所有socket，生命周期runner由T03统一接管。

## 最终源文件摘要

| 文件（scripts/） | SHA256 |
| --- | --- |
| managed-tarball-archive.py | 0f211c1c878fe90bf7bf4a5f51d418b5004e56a52b8a3e8fe7eb0aa7d52d34d0 |
| materialize-graph.mjs | 0d888a6bf5f1932ad07151992073be1fcc02123248401d0e2f4b92ed57fd5935 |
| managed-tarball.test.mjs | 46da028b83eeb3d279bcfb9477182633015197cefecf8ea3a4cb4d0ce2dcb291 |
| materialize-cache.mjs | 30937a076306c7d050c7d442f4fb2315d059519b32113e05c5fcd319e741a985 |
| materialize-cache.test.mjs | 06075d9a76ff06f349d0f5f8431806d8c0dbe51fbc8d088bec9dd9ae17990c20 |

所有本包后台测试均已收集并结束；没有遗留测试pnpm进程或服务。报告更新后diff空白检查exit0。本包写权交回主理人，下一owner为T03。

## 集成前提与明确限制

- T03必须使用这里的新接口完成同步→await与safe FS替换，仍负责全空间估算、journal durability、全部rename/恢复中断、worker回收、两文件RecoveryInput；T01负责backup演练、新增测试注册、正式合成Host业务、全gates与整体集成。**本包不宣布事务/A08/A09通过。**
- 本包未运行现有transaction测试，因为旧协调器尚未适配强制listJson/字符串identity；禁止把旧32/55项事务结果拼到本报告。未运行全gates、L2、Dev，符合当前任务范围。
- registry允许集合固定`https://registry.npmjs.org`，不取认证配置，其他来源保守拒绝。共享cache不复用；privateRoot必须由T03建立在事务私有边界且无不合作写者。本机只实测macOS arm64/Node25.8/Python3.14/pnpm11.7；Linux机制使用标准dir_fd接口但本轮没有Linux运行事实。
- FD原语保护路径替换不跟随链接；同用户完全恶意写者/介质永久故障不承诺成功，safeMove报7须保留现场。probe不是通用备份，不替代T03恢复责任。
- Graph发生实例ordinal在同locator下按磁盘根排序；不同peer保持独立。未知或不等价pnpm布局拒绝。native证据是合成预编译字节而非执行原生代码；不执行lifecycle。
- 当前git-wt.test.mjs/docs/qa增量由主理人另派owner产生，不属于本包修改；其余原dirty保留。无commit/stash/push/PR、无其他workspace源码写入、未派代理或成员直连。
