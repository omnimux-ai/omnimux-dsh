# #766 目录分页纵向交付

## 结论与范围

**本组 IS_PASS: YES（服务端真实分页、HTTP→client feed/JSX 绑定及本组元数据）；完整 #766 / L2 IS_PASS: NO。**

唯一源码树 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-storage-766`；固定 HEAD/base `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`，未提交。开工全文读取 directory-integration、client-followup、PRD 332 行、architecture 595 行；既有 available/异步/FD 安全修复保持，不作为待修任务重做。没有等待架构审计、另调成员、安装依赖、操作真实 OPC/共享 profile/官方 DSH/外部 kit、push 或部署。

写入仅 `plugins/omnimux-assets/**` 和本报告。其他规格/报告未改。

## 实际实现

- `GET /omnimux/assets/library/files?id=&file=&path=&cursor=&limit=` 与 `logical=1&path=` 均正式返回 `{entries,nextCursor,epoch,total,path}`。默认 100，合法整数 1–200；非法 limit/cursor 为 400，目录/账本/epoch 变化为 409，权限/IO 为明确错误响应，不假报空目录。
- 物理目录沿用 Python FD/no-follow `scan`，增加 `singleLevel` 模式；只枚举当前层，不递归扫描后过滤。稳定目录优先/名称排序；游标绑定根、epoch、账本 revision、资产/file/path、目录身份和所有本层项指纹。翻页重验，不使用会隐藏外部变化的长期缓存。安全排除项作为本页 `status:excluded` 行显示原因；控制目录和 `.DS_Store` 不显示。安全预览仍复用原 FD 流。
- 逻辑目录从既有 ledger refs 构建当前层，再服务端分页；每页只 probe 本页物理 refs。虚拟目录只带 logical path，叶子带真实 `fileId`，均不伪造 `real_path`，预览从 fileId 解析真实落点。游标绑定完整引用元数据，跳过状态变化会失效。
- `AssetBrowse` 删除全量 metadata 建树/客户端切片，物理、逻辑、混合顶层均使用同一 `createDirectoryFeed`；前进携带 nextCursor，后退重取已保存游标；失败可刷新重置第一页，导航/卸载后旧请求结果丢弃，切根事件重新取页。每个视图仅保留当前页，页码来自服务端 total。沿用 MediaCard、卡片/detail 的共享入口与普通单图行为，不改其他入口源码。
- 最小 planner metadata：展开目录时保留文件与空子目录 refs；每个排除项都有 logical_path/status/recovery taskId/entryId/reason；保留已有 unavailable metadata；目标原位登记同时保留含文件目录里的空子目录。不推断历史未记录的排除项。

### 成本与兼容边界

这是服务端分页，不是前端收到全量后的切片。为重验外部变化，物理每页重新扫描**单层** metadata；逻辑每页读取既有 ledger 并建立单层索引。没有新增数据库、持久化分页快照、运行时或缓存系统；HTTP/React 返回与渲染有界，Host 单层 metadata 内存仍为 O(N)，不声称 O(每页大小) 全链内存。原内部三参数 `library.listFileEntries` 兼容入口和旧 mapping scanner 没有全局改协议；HTTP 始终显式传分页选项，不经过其 2000 截断路径。

## 真实行为证据

1. 首个闭环：生成 2001 普通文件，实际注册 `registerAssetsRoutes` → 隔离 Node HTTP server → Runtime → Python helper → `listAssetFiles` → `createDirectoryFeed`，21 次网络请求/100 每页，全部 2001 唯一项，最后 `image-02000.png`，上一页返回第 20 页。初始三项 **3/3 exit0，797.321208ms**。
2. 扩展：10000 真实文件物理与逻辑各 50 页/200 每页，完整唯一集合、nextCursor 最终 null；中间实际耗时物理约 4.8s、逻辑约 5.0s（本机生成样本，非 SLA）。另验 2001 logical client feed 的 21 次请求，最后真实 fileId 通过 HTTP 预览获得 `fixture 2000`，logical path 与物理 folder 路径不同。
3. 真实文件增添后旧 cursor 返回409；client 翻页清空旧行并显示错误，refresh 获取总数202的第一页；错误 limit、坏 cursor、stale epoch 均明确拒绝。
4. 实际 chmod 不可读目录返回503；symlink作为不可预览 excluded 行；空目录返回空页。注入 EIO domain error 验证 HTTP 503/message、无伪 entries。逻辑 ledger revision/status 变化令 cursor 失效。
5. 生产 planner 对真实源/目标 scan 生成空子目录与逐排除 metadata，经 library/files logical 消费；已有 unavailable recovery 信息不覆盖。
6. JSX 受控 hooks 夹具实际执行 AssetBrowse 的 effects、请求和点击：detail/Stage 逻辑导航、不可用项禁点击、真实 leaf 预览、卡片与普通单图分流保持。该夹具不是浏览器/React DOM；SSR 测试只验证未加载时不渲染10000本地refs，**不以SSR卡片数代替分页证据**。

## 精确验证

assets cwd：`plugins/omnimux-assets`；root cwd：本工作树。

| 命令 | 结果 / exit |
| --- | --- |
| `node --test --test-timeout=20000 src/directory-pagination.test.js src/client/AssetBrowse.test.js src/client/client-entry-followup.test.js` | **29/29，1 suite，0 skip/cancel，exit0，11661.407ms**；之后仅增加既有 unavailable metadata 保留断言，最终全包覆盖 |
| 首轮 `node --test --test-timeout=20000 src/*.test.js src/client/*.test.js` | 293/294，exit1；唯一旧 runtime test 断言单次返回2005，实际100。按新HTTP协议改成逐页验证2005 available+1 excluded、无重复，原不安全目录不可物化断言保留 |
| 中间全包同命令 | 296/296，64 suites，exit0，11080.520167ms |
| **最终全包同命令** | **297/297，64 suites，0 skip/cancel，exit0，12632.531167ms** |
| `node scripts/build-client.mjs` | **exit0，lib/client.js 249655 bytes** |
| 本组12个JS `node --check` | **12/12，exit0**；JSX由build编译，Python由真实helper测试执行 |
| `git diff --check` | **exit0** |
| root `node scripts/verify-plugin-boundaries.mjs` | **2139 source files，exit0** |
| root `node scripts/verify-stage-contracts.mjs` | **exit1**，审计10 Stage 后 sidebar `Cannot find module 'jsdom'`；既有依赖问题，未改依赖/门禁 |
| L2/ego/原生picker/真实跨卷及1GiB迁移压力 | **未运行**；#778未交付且禁止重复start，不使用临时HTTP server冒充DSH/L2 |

最终全包计数291→297：替换原 AssetBrowse 8项为新协议6项（-2），新增真实分页8项（+8），其余旧测试不删。JSX入口夹具升级为异步正式分页响应，预览断言包含新获得的epoch=0。

日志：`plugins/omnimux-assets/.pagination-focused-output.txt`、`.pagination-test-output.txt`（最终全包）。隔离样本随测试清理，server关闭，所有本轮后台job均已收集。

## 文件清单与一致性结论

新增：`src/directory-page.js`、`src/directory-pagination.test.js`、`src/client/directory-feed.js`。
修改：`src/library.js`、`http-routes.js`、`scanner.js`、`storage-fs.py`、`storage-types.js`、`storage-plan.js`、`storage-runtime.test.js`、`client/api.js`、`client/AssetBrowse.jsx`、`client/AssetBrowse.test.js`、`client/client-entry-followup.test.js`。
生成：`lib/client.js`、两份本组测试输出。新增本报告；未改 package/manifest/其他规格。

全局交叉检查：route→分页options→安全scan→page→feed→共享AssetBrowse 接口一致；logical虚拟目录不返回物理可复制ref，真实叶子预览仍走原授权fileId；无循环导入或新包；全包297项通过。**本组 IS_PASS: YES。**

下一责任人：主理人接收分页代码与本报告，继续已明确分配的其他 #766 P0，并在 #778解除后安排独立QA/真实L2。分页本身不再交下一位工程重做；当前不具备整个Issue关闭、发布或运行验收完成条件。
