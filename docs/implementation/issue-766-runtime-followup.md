# #766/#768 Runtime 有界补齐报告

## 范围与初始结论

工程师寇豆码；唯一树 `.worktrees/assets-storage-766`，HEAD `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`，保留已有未提交工作，不 commit。仅 runtime/http/index/library/artifacts/mappings/protocol/ingest/scanner 与本组独立测试。本报告先于修复落盘；不写 migration/fs/plan、client、总报告。

初始 IS_PASS: NO。已核实：preview 在 Runtime read 结束后按 absolutePath 开流；Runtime 禁用 lazy 未接异步兼容队列；library 每叶子 spawnSync，artifact 同步 hash/copy；运行中不复核 Home 根配置；GET mapping cache-miss 被永久禁止缓存写。PRD 与架构保持 P0 不缩减。未访问真实素材、共享 Dev/Prod、官方 DSH 或外部 kit。

## 定向行为用例（待执行，不代表通过）

1. 已准入读流持有 lease，beginCommit 等待；新读明确 storage-busy；正常结束、abort、open 失败均准确释放。
2. 安全 helper 缺少流能力时 preview 返回明确不支持，绝不按绝对路径 fallback。
3. legacy 仅在写 gate 中串行异步物化；迁移冻结不写；解冻后重试可见且 fileId/cover/metadata 保持。
4. GET mapping cache-miss 正常模式写 gate 落缓存；冻结期间 live read 无写；rescan 拒绝。
5. 上传生成大文件，用真实 hash/copy/install 检验 Promise、event loop、内存有界、freeze 等待提交。
6. 配置损坏/根替换/必需账本缺失/锁占用/worker 退出 fail closed，不以缓存或默认根掩盖。
7. HTTP/project detail real_path 兼容，持久化为 relative_path；tools/HTTP await 一致。

## 已确认接口依赖（由主理人中转，未跨写）

`SafeStorageFS` 当前没有 FD 流 API。最小新增接口：`openReadStream(root, relativePath, { expectedRoot }) -> Promise<{ readable, size, identity, close() }>`。必须在 no-follow 根/父目录 FD 链内打开普通文件，核对 expectedRoot 后才 resolve；readable 来自同一已打开 FD，背压限制单流缓冲，不能 JS reopen absolutePath；close 幂等并完成 helper FD 释放，错误/worker EOF 必须终结流。Runtime 接入后持 read lease 到 readable close/error 或 HTTP abort，commit 等待 lease 归零。helper 缺失时只能明确 501，不能声称 preview P0 闭环完成。

## 实施结果

**本组完整 P0 IS_PASS: NO。已完成有界 runtime 接线与异步管线，定向行为通过，但安全流 helper 和完整兼容/大库契约仍有依赖。不可称整体工程通过。**

- `storage-runtime.js`：新增 `preview(fn)`，在准入点计 reader，安全打开后转交 lease；end/close/error/HTTP abort/打开失败幂等释放，并等待 helper close 完成再 drain。`beginCommit` 拒绝新读且等待已准入读/写；worker 错误优先于 busy，禁止假重启无锁 writer。
- 每 operation 安全重读 Home root、活动根 identity/marker/transaction、三账本；使用读回 ledger 构建本次 bundle，不重新按绝对路径读取账本，也不以旧 store 缓存掩盖损坏或合法外部元数据变更。保留每次三账本严格校验（大库性能仍待批量指纹接口，未以 TTL 缓存绕防护）。
- `ensureLegacy()` 共享单个异步作业 Promise，调用正式 write gate，冻结不执行，解冻后下次 GET/tools 重试；兼容 mapping→library 与 legacy file 物化，保留 fileId、cover、描述、标签，成功落盘仅 relative_path。迁移中旧 external 不作为可物化 files 输出，不跟随不安全路径；未成功源保留用于重试。
- `artifacts.report` 现在为 Promise：共享安全 worker 异步 hash/copy/install/atomicJson，媒体不进 Node 整文件 Buffer；单 store 并发 report 明确 busy。小文本隐私检查仍需安全 FD 流，缺失明确 unsupported，不使用 Node absolutePath fallback；metadata token 先行拒绝。`index.js` upload 原有 await 保留，list/get/search 跟随 runtime async view await。
- `library.js` runtime list/detail 使用同一常驻 worker 做 metadata stat/目录复核，不每叶子 spawnSync；搜索先过滤元数据再探测命中项。add/update/legacy 的入库复制、inventory hash/scan 和 ledger persist 接异步 worker。普通删除/兼容 standalone store 的小型同步持久化/GC 没有全量异步改造，归剩余性能工作。
- `http-routes.js` GET mapping files 正常模式整个请求用 write gate，冻结 live read 不写缓存；POST rescan 继续写 gate。比只对 cache-miss 分类更保守：cache hit 也短暂占 writer，可能返回 busy。epoch 在 bundle 内再验，防异步等待后的切根漂移。
- `mappings.js` cache ID 校验、缓存写改随机临时原子 helper JSON；`scanner.js` 增安全 async metadata-only 入口，runtime mapping 和 library 目录不再靠 Node stat 递归读树。helper 当前 scan 递归遍历后筛一层，未实现分页，不能称万文件优化完成。

## 本次实际验证

所有样本由测试生成于系统临时目录，清理由对应 fixture 负责；无真实 OPC、共享 profile 或外部 kit 内容访问。

| 命令/证据 | 结果 |
| --- | --- |
| 首轮 `node --test plugins/omnimux-assets/src/storage-runtime.test.js` | 11/11，exit 0，0 skip |
| 本组+既有 tools/http/library/mappings/protocol 定向 | 56/57，exit 1。旧 `http-routes.test.js:361` 同步使用 `artifacts.report`，Promise 未 await 导致 list 为 0、after-test rejection；未修改越权旧测试，也未掩盖失败 |
| 新增 worker-death 回归首轮 | 43/44，exit 1：worker recovery-required 被 gate storage-busy 覆盖；已改 runtime 错误优先级，未放宽测试 |
| 最终 `node --test plugins/omnimux-assets/src/storage-runtime.test.js plugins/omnimux-assets/src/tools.test.js plugins/omnimux-assets/src/library.test.js plugins/omnimux-assets/src/mappings.test.js plugins/omnimux-assets/src/protocol.test.js` | **44/44，exit 0，10 suites，0 skip**；本组独立 runtime 15 项，约2.27秒 |
| 本组9个 JS `node --check`（含未改 protocol）与 `git diff --check` | exit 0 |

15个本组用例覆盖：真实 FD 测试替身的读流/commit等待、新读拒绝、HTTP abort释放、缺流能力501、open失败释放、legacy冻住不写/解冻可见与ID/metadata、mapping cache/rescan gate、64MiB生成媒体上传/完整SHA256/异步timer/RSS增长<48MiB/freeze等账本、运行配置损坏/缺账本、根替换、双实例锁、2005个文件+symlink安全目录输出/不截断、HTTP artifact列表详情、小文本无安全reader失败关闭、worker退出不重启、Python缺失明确501。

流测试的 `installFixtureStream` 是**仅针对生成样本的 lease 替身**，不是生产 no-follow helper。不能以该用例声称真实 FD 链安全已完成。64MiB/RSS证据不是≥1GiB或跨盘/掉盘压力验收。未运行全包最终测试、L2、浏览器或独立 QA。

## 尚缺依赖与集成动作（主理人负责转交）

1. helper owner 实现上节 `openReadStream` 后，用真实 helper 替换测试替身增加父目录替换/符号链接/stream关闭/worker终止的并发测试。接口也用于小文本 privacy scan（<=2MiB，读取后与 safe.hash 结果核对），因此 text/json/doc artifact 在接口缺失时暂返回501。不要保持501并称交付。
2. 原 `artifacts.test.js`、`http-routes.test.js`、`qa-edge.test.js`、可能 `qa-drill.test.js` 中同步 report 使用，须由集成 owner 全改 await/assert.rejects，测试夹具保留到 Promise settle；本轮不在授权测试面，已准确报告已知失败。本组新测试使用 Promise API。
3. Python 缺失：架构§1.2/§7.3明确无不安全 fallback，缺助手属于平台阻断；当前 runtime 全库不可用，**不能称旧功能完整兼容**。需主理人确认发布能力/打包 helper；本轮不改 manifest 或外部运行环境。
4. 新增浏览响应仅为实体目录 `{file,path,entries,excluded}`，`excluded`为helper原相对路径/原因；未实现架构 logical=1/cursor/limit/nextCursor 虚拟目录契约。runtime目录不再静默截2000，但仍递归scan后返回当前层全量。将该事实与client报告中分页/API需求统一后另行补齐；不让client把现有全量当分页。
5. 仍需 batch stat/scan-page/snapshot 验证能力减少每read三账本与每ref IPC；当前不spawn每叶子、但无万文件/≥1GiB性能结论。mapping view/cache读取仍有旧同步实现，不能宣称全入口FD化已完全覆盖；同步 standalone lazy为旧测试/非Runtime接口保留，生产Runtime明确disableLazy+显式队列。
6. legacy失败仍保留原ref并在后续正常GET重试；缺源/权限错误未实现持久化可观测队列状态，需整合 `unavailable_files` 及完整迁移异常报告，不能称全部旧数据已可用。
7. 原总报告第6组structured input_refs/完整ID映射和xattr未动；其他恢复/清理/空间/客户端工作未吞并。整体仍须主理人工程一致性、独立QA及#778解除后的L2。

## 文件归属与收尾

本轮修改 `plugins/omnimux-assets/src/{storage-runtime,http-routes,index,library,artifacts,mappings,ingest,scanner}.js`，新增 `plugins/omnimux-assets/src/storage-runtime.test.js`，本独立报告。`protocol.js`仅只读及syntax；未改storage-fs/migration/plan、client、总报告或旧测试。无commit/push/部署，HEAD保持5485c258。本组已结束，不存在后台测试或子代理。
