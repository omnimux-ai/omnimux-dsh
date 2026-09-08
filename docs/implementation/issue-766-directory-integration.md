# #766 目录纵向整合报告

## 初始状态与边界

工程师寇豆码；本报告先于实现落盘。唯一工作树 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-storage-766`，固定 base = HEAD `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`（SHA 不是路径）。保留全部未提交源码，不切分支、不重建树。已读取完整 PRD 332 行、架构 595 行及五份工程交接。

本轮仅写 `plugins/omnimux-assets/**` 与本报告；其他规格/报告、官方、外部 kit、共享 profile、其他工作树不修改。不委派、不安装依赖、不操作真实 OPC、不 push/部署；#778 未解除前不重复 L2 start。

初始 **IS_PASS: NO**。前组报告给出 migration 11/13，library.makeView 错误排除 status available；本轮首先保留原断言复现并修复。随后按 Promise 契约修旧 artifact report 测试，贯通物理/逻辑目录 cursor+epoch、每页最多 200、错误可见、真实 fileId 与客户端统一入口，以及真实 helper HTTP 预览 lease。

## 实施与验证计划

1. 原 migration 两失败红灯复现 → 最小业务修复 → 原断言转绿。
2. HTTP/artifact 旧测试 await/assert.rejects 修正，保持原业务断言。
3. library/scanner/HTTP 服务端目录稳定分页、2001/10000 不截断、过期与权限/IO 明确错误；逻辑叶子不生成虚假 real_path。
4. 客户端消费正式接口、上下页及过期刷新，保留卡片与详情同一 AssetBrowse。仅对实际已知的空目录与 unavailable 元数据补生产，不推断历史遗漏项。
5. 真实 FD helper 预览、定向测试及完整包、构建/相关边界检查，记录计数与 exit。

## 第二次重试：第一阶段已保存（2026-09-08）

- 本轮已全文读取上述指定报告、PRD 332 行及架构 595 行。75 仅留下初始计划，无实施结果；没有将其计划当作完成证据。
- `library.js:makeView` 只排除 `unmigrated/excluded`，不再排除正常 `available`。原 migration 两项断言未改。
- `artifacts.test.js`、`http-routes.test.js`、`qa-edge.test.js` 的 report 调用改为 await/assert.rejects；fixture 在异步完成后清理，原业务断言保持。
- 扩大测试发现小文本上传把 macOS `/var` 父路径别名直接交给严格 FD 流而失败。`artifacts.js` 经 helper identity 解析已授权来源父根，再以 canonical path 和 expectedRoot 打开同一安全流；不通过 Node 按绝对路径重开。来源不存在/目录保留旧 path-not-found 契约，不安全叶子仍 path-denied。
- standalone HTTP 保留已有 path-denied=400；Runtime storage 模式仍使用规格的422。两项旧缺能力测试显式注入 `openReadStream=undefined`，保留501与无泄漏断言，不再错误假设新增方法不存在。

| 命令（assets cwd） | 实际结果 |
| --- | --- |
| 修复前 `node --test --test-timeout=20000 src/storage-migration.test.js` | 13 tests，11 pass，2 fail，exit1，948.930708ms；相同 relative_path/real_path undefined |
| 首次8文件定向（下行相同命令） | 107 tests，98 pass，9 fail，exit1，2952.373042ms；migration13/13，新增集成失败原因已如上修复 |
| `node --test --test-timeout=20000 src/storage-migration.test.js src/storage-recovery.test.js src/storage-fs.test.js src/storage-stream.test.js src/storage-runtime.test.js src/artifacts.test.js src/http-routes.test.js src/qa-edge.test.js` | **107/107，12 suites，0 skip/cancel，exit0，2884.452416ms** |

本阶段 **IS_PASS: YES（仅上述修复与107项定向范围）**；目录纵向分页和完整P0仍 **IS_PASS: NO**。测试只用隔离生成样本，无真实素材/共享profile写入。

## 第二阶段：真实 helper HTTP 集成及全局核验

- 核查同类过滤时发现 `library.js:listSafeFileEntries/previewRef` 也误排 available，原有全包287项没有覆盖这一组合。新增 `src/storage-http.test.js` 经实际 `registerAssetsRoutes`、本地隔离 Node HTTP server、Runtime 和生产 Python helper 复现4/4红灯，再修业务过滤，保留所有新增断言后4/4绿。
- 四项分别覆盖：available普通文件列表及2MiB+17B精确字节/Content-Length；available目录与嵌套文件；HTTP客户端取消后真实FD关闭及commit lease等待（仅延迟close确认，不替换安全open/read）；stale epoch、unmigrated/excluded和symlink明确拒绝、无reader/stream残留。
- 预览沿用已完成的 `Runtime.preview → SafeStorageFS.openReadStream(expectedRoot) → sendPreview`，没有新增绝对路径reopen或不安全fallback。测试所用临时HTTP server不是DSH/L2，结束时关闭全部连接。
- 全局一致性核验：三个available准入判断与viewOf/迁移FileRef一致；全部旧report调用按Promise处理；standalone与Runtime的HTTP错误语义分开；未改migration原断言、未改client入口。

| 命令（除注明均为assets cwd） | 实际结果 |
| --- | --- |
| 新HTTP测试修复前 `node --test --test-timeout=5000 src/storage-http.test.js` | 0/4，4 fail，exit1，228.531542ms；available入口被400拒绝 |
| 同命令修复后 | **4/4，0 skip/cancel，exit0，237.049875ms** |
| 第一阶段全包 `node --test --test-timeout=20000 src/*.test.js src/client/*.test.js` | **287/287，65 suites，0 skip/cancel，exit0，3287.7185ms** |
| 最终相同全包命令（新增HTTP4项及业务修复后） | **291/291，65 suites，0 skip/cancel，exit0，3514.848ms** |
| 本轮8个JS `node --check` | **8/8，exit0** |
| `git diff --check`（worktree cwd） | **exit0** |
| `node scripts/verify-plugin-boundaries.mjs`（worktree cwd） | **2136 source files，exit0** |
| build / Stage / gates | 本轮没有改client/package/manifest，未重复；既有Stage/gates依赖失败不据此解除 |
| L2 / ego / 原生picker / 真实跨卷与≥1GiB压力 / 独立QA | **未执行**；#778依赖仍待主理人处理，不重启、不降门禁 |

## 本轮实际文件与最终结论

修改 `plugins/omnimux-assets/src/{library.js,artifacts.js,http-routes.js,artifacts.test.js,http-routes.test.js,qa-edge.test.js,storage-runtime.test.js}`；新增 `plugins/omnimux-assets/src/storage-http.test.js`；更新本报告。本轮未改任何client、scanner、plan、migration、helper或规格，全部既有未提交成果保留。HEAD/base仍5485c25875cb9f71d7cb78a6aa69d07e07fffbab，未commit/push/部署/安装依赖/委派，两个全包后台job均已收集退出0，无本轮后台任务残留。

**IS_PASS: YES仅适用于本轮available/异步兼容/真实HTTP预览修复及上述已验范围；目录纵向分页与完整#766需求 IS_PASS: NO。不具备关闭/发布条件。**

## 尚未完成与下一可执行步骤

本轮按明确允许的有界退路交付第一阶段及HTTP增量，没有开始半成品分页协议。以下是必须继续的工程，不是可选优化：

1. `storage-fs.py`/`scanner.js`/`library.js`：真实单层物理目录快照与稳定游标、limit<=200，绑定epoch/目录身份与内容变更；2001/10000全页无重复遗漏，权限与IO错误不可返回空目录。当前Runtime仍递归scan后过滤一层返回全量；standalone scanner仍有2000截断及吞异常。
2. `http-routes.js`当前files route只传id/file/path；须加入logical=1、cursor、limit和正式`{entries,nextCursor,epoch}`。逻辑索引由账本安全logical_path生成、叶子真实fileId，虚拟目录不得输出可物化real_path。
3. `storage-plan.js:107–116`既有目录展开仅取file叶子，并将某些源排除项汇总为无logical_path的`<fileId>_excluded`；:147–153目标纳管也可能遗漏含普通文件的空子目录。最小修复须保留空directory refs，逐排除项logical_path/status/recovery_ref及稳定entryId，不推断历史未知项。
4. `client/AssetBrowse.jsx`仍客户端全量metadata树+本地100分页，PhysicalBrowse仍取全量并显示2000提示；正式route可用后改消费游标、上一页栈、过期刷新和陈旧响应丢弃，同时保留现有AssetGrid/AssetDetail统一入口及普通单图预览。当前全包涵盖这些既有入口回归，但不是正式分页证据。
5. 迁移摘要/revision、结构keep-both、完整元数据、空间/压力及既有报告其余P0仍由主理人继续安排；#778解除后独立QA与真实L2，不用本轮HTTP测试替代。

下一责任人：主理人接收本报告后恢复目录纵向分项。**首步是在 `plugins/omnimux-assets/src/storage-http.test.js` 旁新增真实物理分页的2001/10000与变更/权限失败用例，再实现helper单层快照接口，之后贯通logical route与client；不要把现有2005全量返回测试当分页已经完成。**
