# Publish 状态与服务端类型边界（Issue #544）

## 共享状态导出

`src/shared/record-status.js` 为浏览器安全的纯模块，仅依赖同目录的 `values.js`，不依赖 Node、Host、DOM 或 UI 文案。

| 导出 | 输入 | 输出 |
|---|---|---|
| `aggregateStatus(record)` | `unknown`，可防御磁盘/HTTP 的部分输入 | `AggregateStatus`：`draft / publishing / partial_failed / failed / published` |
| `displayStatus(record)` | 同上 | `DisplayStatus = AggregateStatus \| reviewing` |
| `calculateSubtaskSummary(subtasks)` | 数组、字典、空值 | `{ total, published, failed, inFlight, reviewing, submitted }` |

- 子任务优先读取字符串 `status`，没有该字段时读取字符串 `state`。非对象条目忽略；对象上的未知状态计入 `total`，但不能凭空算作发布中或已成功。
- 没有有效子任务返回 `draft`。in-flight 优先于失败；存在失败且存在成功返回 `partial_failed`，否则返回 `failed`；全部成功返回 `published`；其他情况返回 `draft`。
- `submitting / uploading / processing` 为 in-flight。Host 真实持久化的 `submitted / reviewing` 同样为未终态：正常提交后不应回落成草稿，审核中也不成为第六个聚合态。
- `displayStatus` 只在聚合为 `publishing` 且存在 `status` 或 `state` 等于 `reviewing` 的子任务时投影成 `reviewing`。
- 不信任输入里的缓存 `aggregate` / `subtask_summary`；展示投影重新消费子任务真源。
- 所有函数不修改输入。`store.js` 直接 re-export 同一个 `aggregateStatus` 函数。

## Wire 与存储

HTTP 和工具视图仍包含 `aggregate` 与原有五个计数字段：`subtask_summary = { total, submitted, reviewing, published, failed }`。`inFlight` 仅作为内部共享计数，不增加 wire 字段。

`record-types.js` 定义 `PublishRecord`、`PublishTask`、`RecordView`、`DraftInput`、`TaskPatch`。磁盘入口先将 JSON 视为 `unknown`，由 `record-schema.js` 逐字段验证消费者需要的字段；未知任务状态字符串保留并防御性展示。完整记录与 `get/getView` 的 `null` 结果有明确区分。

已解析但字段不完整的记录/媒体索引分别抛出 `invalid-record` / `invalid-media`，不修改原始文件、不进行迁移或丢弃后重写；缺失或无法解析的文件维持原有空文档回退。本项是数据边界的显式失败行为，需要在集成审阅时留意旧文件完整性。

存储 API 方法、数据路径、0600/0700 权限、tmp+rename 写入、提交/重试/恢复语义不变。超长文件按职责拆分：`record-persistence.js` 负责 I/O，`record-tasks.js` 负责账本任务操作，`publish-dispatcher.js` 负责领域入口，`http-helpers.js` 负责 HTTP 基础操作，`submit-media.js` 负责提交媒体准备。

## 类型门禁

- `PublishConfig` 在 `config.js` 显式定义，不自引用推导。
- Service/dispatcher 依赖为实际工厂 `ReturnType<typeof import(...).create...>`；Hub seam 接收具体调用参数，返回 `unknown` 后在边界收窄。
- `pnpm run typecheck:contracts` 运行 TypeScript 5.9.3，启用 `allowJs/checkJs/strict/noEmit`；八个服务端入口及所有真实导入依赖纳入检查，不使用 `noResolve`、排除依赖、假 `.d.ts` 或忽略诊断。
- `contracts.type-test.ts` 验证类型等价；`contracts.test.js` 使用同一 tsconfig 编译真实依赖并验证五条非法边界产生诊断。
- `pnpm test` 包含 `src/shared/*.test.js`，全部提交测试走 mock，不授权或发布真实账号。
- 共享依赖的隔离 worktree 使用 `pnpm_config_verify_deps_before_run=false pnpm test` 和 `pnpm_config_verify_deps_before_run=false pnpm run typecheck:contracts`。该变量只关闭 pnpm 11 的执行前自动重装，不跳过测试或编译；裸命令在当前未完整安装的 worktree 会尝试安装全仓，因其他插件的相对 `file:dsh-ui-kit` 路径不存在而失败。正式依赖已在本包 devDependencies 声明。

## 前端交接范围

前端将 `client/status-display.js` 的状态算法替换为共享导入/re-export，中文标签与 `statusText` 留在客户端；删除其 `aggregate === 'reviewing'` 分支。旧 `RecordsList.jsx` 与 capabilities 中仅为它服务的算法由前端任务清理。本服务端任务未编辑这些页面。集成后将 `src/client/status-display.js` 加入 tsconfig 的 include，并验证三种记录视图。
