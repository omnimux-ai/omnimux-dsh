# #766 / #769 客户端有界补齐报告

## 结论与边界

工程师：寇豆码。**本组可实现的客户端增量已落地，完整 P0 / L2 验收 IS_PASS: NO。不可凭客户端单测关闭 #766/#769。**
固定 base / HEAD `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`，共享工作树 `assets-storage-766`；不是远端分支审查。未 fetch/rebase/commit/push/部署。
已全文读取 PRD（332 行）、architecture（595 行）、原工程报告（70 行）、design.md、ui-design-guidelines.md 和相关客户端/HTTP/store 契约。本报告先于实现落盘，未修改原总报告。
仅写指定七个 client 文件、本功能 client 测试和本报告。未与其他成员通信、未改后端、package/依赖/外部 kit、官方源码、共享 profile 或真实 OPC 素材。L2 由 #778 独立任务修复，不重复启动。

## 本组已完成

| 分项 | 实际交付 | 限制 |
| --- | --- | --- |
| 逻辑目录 | 使用已提供的 `files[].logical_path` / `unavailable_files[]` 建单层导航索引，中文多层面包屑、返回；叶子保留 file ID，预览绝不拼 logical_path | 不是后端 logical route；缺失的空目录/排除 metadata 无法凭空重建 |
| 有界列表 | 逻辑/已返回实体目录每页 100 张卡片；实际 10000 refs SSR 测试只渲染 100 张，显示 100 页 | 网络仍为全量 metadata；实体 scanner 的 2000 截断未解决，已显式提示可能不全 |
| 空目录和不可用项 | 保留实际给出的 directory ref；未迁入/排除项按层级展示状态和实际 recovery metadata，不产生预览 URL 或交互假入口 | 全部不可用或仅一个普通 leaf 的资产可能在 AssetGrid 直接走媒体预览，见下方跨文件缺口 |
| 四动作和 keep-both | 单项覆盖/跳过、全计划普通文件全部覆盖/全部跳过、结构/硬链接改名保留两者；两种批量动作明确区分，结构禁止 overwrite | 服务端真正执行结构 keep-both 仍需后端负责，不能以按钮可点击代替业务成功 |
| 全计划确认 | 每次操作按现有 entries route 逐页核对全部清单，汇总普通/结构冲突、未决/跳过、旧版本字节；最后复核 seq/planHash；确认页捕获计划、动作、fingerprint、新落点及批量集合 hash，变化后禁提交 | 未提供峰值空间/受影响目标引用/完整部分切换集合 API，相关 P0 仍缺 |
| 设置/进度 | 全阶段中英文本、真实文件/字节/跳过/错误数；未知总量用不确定进度；copy 完成不等于 commit；源/目标/默认根/在线状态可见 | 未验证真实万文件/1GiB 吞吐与 <=1 秒 Host 更新 |
| 关闭/恢复/错误 | Host 为任务真源，重开重新发现 activeTask；关闭仅停止观察；去重 POST、陈旧 GET 丢弃、分页切换复取、15 秒读取超时；操作错误保留至明确刷新；未确认失败引导放弃后重新预检；等待冲突可续传 | POST 不超时取消，避免误导 Host 已停止；原生 picker 与持久恢复依赖 Host |
| 焦点与视觉 | 捕获开启时焦点，初始聚焦关闭按钮、卸载归还；复用 kit ModalDialog/DropdownSelect/Button，官方 tokens、路径换行、窄屏单列，不改整页视觉 | 焦点/Tab/Escape/暗浅主题/窄屏尚无真实 ego-browser 证据 |
| 删除提示 | 明确原位项只摘索引、共享引用不回收；无效标题 key 回退本地化名称提示 | 调用方只传 name/title，没有 ownership/共享计数，不能伪造数量 |

## 精确接口缺口，交主理人转后端工程

以下为需求，不是已经实现或客户端正在调用的 API。核查时 `http-routes.js` 只将 `/library/files` 的 id/file/path 传给 `library.listFileEntries`；scanner 默认最多 2000 条且异常可返回空数组。

1. **实体目录分页**：保留 `GET /omnimux/assets/library/files?id=<asset>&file=<fileId>&path=<relative>`，增加 `cursor`、`limit<=200`，响应 `{entries,nextCursor,epoch}`，稳定排序和快照游标；I/O 错误返回明确错误而非空目录，包含排除项/原因或独立分页入口。用例：2001/10000 文件目录第 21/100 页、翻页间树变化、权限错误不显示“空”。完成后客户端切换服务端分页，移除固定 2000 提示。
2. **逻辑目录 route**：按架构实现 `GET /library/files?id=<asset>&logical=1&path=<logical>&cursor=&limit=`，响应 `{entries,nextCursor,epoch}`；逻辑叶子给真实 `fileId`、安全 display path、kind/status/reason，虚拟目录不返回可物化假 real_path。用例：不同物理落点的同内容复用、同目录部分 skip、仅一个叶子、空目录。当前客户端只消费全量已给 refs，不调用此不存在 route。
3. **空子目录及排除元数据**：`library/detail` / state 的 refs 保留明确 `kind:'directory'`、`logical_path`；`unavailable_files` 精确到每个被排除/跳过叶子，带 `status`、`logical_path`、`recovery_ref` 的 taskId/entryId/reason；不能只返回无路径的汇总 excluded ref。用例：有普通文件同时含空子目录，源目录含特殊文件及跳过子项。
4. **计划摘要与部分切换清单**：现有 task.summary 只给 adopted/copyFiles/copyBytes/reused/conflicts/excluded；entries 只给 entries/nextCursor/blockers/planHash/conflictSetHash。需要 `requiredBytes`（各卷峰值/恢复版本单列）、普通冲突数量/未决数量、adopted 文件级/目录级预览、受影响目标引用数量与旧版本保留方案；需要可按 `unmigratedSetHash` 取得完整未迁入 record/ref 分页集合，包含没有 migration entry 的 legacy/excluded refs。用例：第 201 项才有冲突、覆盖影响多记录、空文件内容=0但非零账本/恢复成本、legacy ref 导致 partial。当前整计划扫描所得 skipped 数不等同 task.unmigratedCount，不能冒称完整部分切换明细。
5. **冲突可用预览与原因码**：计划冲突只有 sourceRel/targetRel/fingerprint/bytes，无受控预览标识；需要 task/entry-scoped 只读预览能力（分别 source/target，遵守 FD/containment，不让 UI 发任意路径）。reason 目前可能是英文自由字符串，需要稳定 reasonCode + details，才可完整本地化而不丢原始诊断。
6. **结构 keep-both 实际执行**：核查到原执行器对 `entry.kind !== 'file'` 抛 `directory structure conflict must be skipped`；UI 可合法提交 keep-both，但 directory-source 冲突不能据此认定成功。主理人应以恢复分项最新实现为准复核该缺口；本组未跨写。
7. **任务进度与集合版本**：目前 seq 同时用于 heartbeat 与 expectedSeq；大计划复核需独立稳定的 plan/decision revision 或明确冻结确认窗口，否则活动心跳会使确认失效。progress 需给可读当前路径/阶段计数、totalVerifyBytes 与真实累计；客户端只显示已提供 currentEntryId。500ms 客户端轮询不能证明后端更新 SLA。

## 限定写面之外的客户端缺口，交主理人协调

- `AssetGrid.jsx` 使用 `asset-routing.js:isFolderAsset`，只按 files.length>1 或单 directory 判目录：只有一个可用 leaf + unavailable refs、全部 unavailable refs 会直接进入媒体弹窗，而非 AssetBrowse。因此本组逻辑树组件可工作，不代表所有卡片入口可达。需获准在该路由条件考虑 logical_path / unavailable_files，再验真实入口。
- `AssetDetail.jsx` 的侧栏 TopFileList/FolderBrowse 仍旧全量物理列表，不展示逻辑树/不可用项。本轮明确禁止修改该文件。
- `AssetsStage.jsx` 批量删除读取 pendingRemove.isBatch，但 feed 未给该字段；并传未定义 `confirm.deleteTitle` key。本轮只在允许的 ConfirmRemoveDialog 做缺失 key 回退，批量目标数量和 ownership 细粒度提示需调用方传递，不能靠 name 猜。

## 验证记录

| 命令 | 实际结果 | exit / 限制 |
| --- | --- | --- |
| `node --test src/client/AssetBrowse.test.js src/client/StorageSettingsDialog.test.js`（assets cwd） | 19/19，2 suites，0 skip | 0；首次定向通过 |
| `node --test src/client/*.test.js`（assets cwd） | 70/70，18 suites，0 skip | 0；仅 client，不含并行修改的后端测试 |
| `node scripts/build-client.mjs`（assets cwd） | 最终 client bundle 258256 bytes | 0；生成 lib/client.js，不等于加载 App |
| `git diff --check`（worktree cwd） | 无 whitespace 错误 | 0 |
| `node scripts/verify-stage-contracts.mjs`（worktree cwd） | 审计 10 Stage 后失败，sidebar 不能解析 jsdom | 1；未改依赖/门禁，不伪称通过 |
| 全包测试 / gates | 未运行 | 按本轮边界，不复用原 200/200，不与并行后端争用不稳定全包证据 |
| L2 / ego-browser / 原生 picker / 真实大文件压力 | 未运行 | #778 环境依赖，用户禁止重复 start；单测与 SSR 不是 L2 |

测试包括实际纯函数/控制器请求交互与 SSR 有界输出；kit 在 SSR 夹具中仅 stub Button，部分 JSX 接线为静态契约检查。**没有 DOM 点击/焦点行为或真实 HTTP 服务集成证据，不把它们称作 L2 或完整交互验收。**

## 文件清单与下一步

修改：`plugins/omnimux-assets/src/client/{AssetBrowse.jsx,StorageSettingsDialog.jsx,use-storage-task.js,api.js,locales.js,styles.js,ConfirmRemoveDialog.jsx,AssetBrowse.test.js}`。
新增：`plugins/omnimux-assets/src/client/StorageSettingsDialog.test.js`、本报告。
允许生成：`plugins/omnimux-assets/lib/client.js`（忽略生成物）。未提交。

下一责任人：主理人中转以上 API/入口缺口给具备对应写面工程；后端稳定后由客户端补消费及入口集成，再独立 QA 在 #778 修复的真实 L2 验证。当前可以接收本组限定源码增量，不可关闭完整第 3 组 P0。
