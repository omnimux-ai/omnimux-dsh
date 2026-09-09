# #766 / #769 客户端入口补齐报告

## 结论与范围

工程师：寇豆码。**本组源码一致性与客户端测试 IS_PASS: YES；完整功能 / Stage 门禁 / L2 验收 IS_PASS: NO。不能据此关闭 #766/#769。**
报告先于源码修改落盘。承接 [前轮客户端报告](issue-766-client-followup.md) 第 36–40 行入口遗漏，不新做设计；该报告 62 行、PRD 332 行、architecture 595 行已全文读取，design.md/UI guidelines 已核对。
固定 base = HEAD `5485c25875cb9f71d7cb78a6aa69d07e07fffbab`；唯一树 `.worktrees/assets-storage-766`。这是本地未提交增量，不是远端最新分支审查；未 fetch/rebase/commit/push/部署。
仅写本报告、指定五个源文件及对应两个 client 测试文件。AssetBrowse 及原报告未改；后端 migration/fs/plan/runtime/HTTP/store、其他 7 组 API 欠项不在写面。
未操作真实 OPC、共享 profile、外部 kit 或官方源码，未调度其他成员；L2 依赖 #778，不重复 start。

## 实际交付

| 入口 | 实现与边界 |
| --- | --- |
| 网格 / 列表卡片 | `isFolderAsset` 纳入非空 logical_path 和 unavailable_files；单个逻辑叶子、单可用叶子加不可用 refs、全部不可用资产走 onOpen → Stage AssetBrowse，不再误走媒体弹窗。全不可用项显示现有 missing 提示。 |
| 普通单图 | 仅有 physical relative_path、adopted ownership 或空逻辑 metadata 不改变浏览方式；仍直接预览。无 refs 的旧行为不扩大。 |
| 详情侧栏 | 目录/逻辑资产复用已有 AssetBrowse API；删除 TopFileList/FolderBrowse 的独立物理导航及请求实现。Stage 传入同一 onPreview；逻辑树下钻/返回、不可用状态均复用。普通单图保留原禁用文件行，空资产保留空态。表单、工具栏、整页布局及样式文件未改。 |
| 删除确认 | createRemovalRequest 捕获去重的实际 assets、ids、names 与 isBatch。批量基于完整 assets 与 selectedIds 的交集，含筛选隐藏的已选记录、不含残留无对象 ID；空集合不弹框。标题用已存在的双语 select.removeTitle / mapping.removeTitle，批量展示真实数量和记录名称。执行使用同一捕获 ids，不随随后选择变化扩大集合。 |
| 切根 | 清空 pendingRemove，避免旧根确认在新根沿用。 |
| ownership | 保留真实对象及 refs 原字段，不按路径、名称或根位置推断所有权；复用现有通用删除说明（adopted 仅摘索引、未被引用 managed 可回收）。未提供共享引用/可回收精确数量，不显示猜测数，也不宣称目标全部属于 managed/adopted。 |

没有新增或假装调用 logical route。逻辑树仍消费已给 metadata；缺失空目录、排除信息、服务端逻辑/实体目录分页、FD 流继续由主理人集成。

## 实际用例

本轮新增 17 个 client 用例（前轮 70 → 最终 87）：

1. 纯函数：单逻辑叶子、部分/全不可用 refs 路由；普通单图不因物理路径、ownership、空 metadata 扩大浏览方式；预览保持真实叶子 ID。
2. 网格和列表各 4 例：partial、all-unavailable、single-logical 的卡片及 View 回调走 browse；普通单图直接预览，选择动作不打开内容。网格另核 Enter 激活。
3. 侧栏各 1 例：partial、all-unavailable 按“素材/人物”下钻/返回，不可用叶子没有可点击/媒体 src；可用叶子生成 `id=partial&file=leaf`，不拼 logical_path。
4. Stage 端到端回调：卡片设置 detail 后，主区域确实出现逻辑树；独立断言主区与侧栏共享 onPreview。
5. 普通单图侧栏仍为禁用文件行，不增加 AssetBrowse。
6. 删除：真实选择对象捕获、stale ID 排除、隐藏选择保留、双语数量及名称、按捕获集合发真实 API helper 的 delete 请求（fetch 为本地夹具）、完成后只移除对应选择；空/无效/重复/单个对象及 unknown ownership 不虚构 metadata。

`client-entry-followup.test.js` 用 esbuild 在内存编译实际 JSX，受控 hook 状态执行真实组件及回调，kit 组件以元素标识替身承接 props。**不是 DOM 点击、React effect/lifecycle、焦点或主题验证，不称 React renderer / L2。**本机 package resolution 明确缺少 react-test-renderer/jsdom，未安装替代依赖。

## 命令及 exit

| 命令 / cwd | 实际结果 | exit |
| --- | --- | --- |
| `node --test src/client/asset-routing.test.js src/client/client-entry-followup.test.js` / assets 包 | 首次定向 29/29，随后新增 1 个 Stage 主入口用例纳入全量验证 | 0 |
| `node --test src/client/*.test.js` / assets 包 | 最终 87/87，18 suites，0 fail / skip / cancel | 0 |
| `git diff --check` / 工作树 | 通过 | 0 |
| `pnpm verify:stages` / 工作树 | 包装入口隐式触发 install，因 `product/omnimux-dsh/personal/dsh-ui-kit` ENOENT 失败；未到 Stage 验证，不手改路径或依赖 | 1（内部 install 254） |
| `node scripts/verify-stage-contracts.mjs` / 工作树 | Auditing 10 Stage 后失败：Sidebar Contract Error，Cannot find module 'jsdom'，require stack 为 hub package | 1 |
| 全包后端测试 / 构建落盘 / L2 / verify:live / 原生 picker | 未运行：本轮只验证 client，不将并行后端证据混入；内存 JSX 编译已覆盖导入接线，不生成额外文件；L2 依赖 #778 | 未运行 |

全局复核：指定五个源码文件的 imports/callbacks、路由与统一浏览接口、确认字段与删除执行字段一致；删除了重复物理浏览实现，没有新增后端 API 或修改 AssetBrowse API。Git diff 包含前轮与并行成员的既有修改，不能把整个工作树 diff 计为本轮成果。pnpm 包装入口失败后检查 git status，未发现新增 tracked lockfile/package 修改；已有 package.json 脏项为启动时已存在。

## 本轮文件清单

修改：
- `plugins/omnimux-assets/src/client/asset-routing.js`
- `plugins/omnimux-assets/src/client/AssetGrid.jsx`
- `plugins/omnimux-assets/src/client/AssetDetail.jsx`
- `plugins/omnimux-assets/src/client/AssetsStage.jsx`（只新增侧栏 onPreview、修删除标题）
- `plugins/omnimux-assets/src/client/use-assets-feed.js`（真实删除集合及切根清空确认）
- `plugins/omnimux-assets/src/client/asset-routing.test.js`

新增：
- `plugins/omnimux-assets/src/client/client-entry-followup.test.js`
- `docs/implementation/issue-766-client-entry-followup.md`

下一责任人：主理人接收限定增量，集成后端目录分页与 FD 流、处理其余接口欠项；#778 解阻后由独立 QA 完成真实 L2 与 UI 验证。当前本组可交 QA，不具备完整功能关闭或发布条件。
