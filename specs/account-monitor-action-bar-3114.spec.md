# 规格 · 账号监控卡片操作栏动作闭环与标记处理持久化（Issue #3114）

## 目标（Objective）

为账号监控卡片悬停层（Hover Overlay）四项操作位提供完整闭环：
1. **原帖直达 (`act.original`)**：
   - 合法 `http(s)://` URL：点击以安全方式通过外链打开，调用 `stop(e)` 阻止打开卡片详情。
   - 非法或空 URL：按钮置灰禁用 (`disabled={true}`)，鼠标呈现 `not-allowed`，悬停显示 `t('rivalFeed.card.originalUnavailable')` 提示，阻断点击并阻止事件冒泡。
2. **AI 拆解 (`act.deconstruct`)**：
   - 保持既有 `handleDeconstruct` 链路，入库后就地打开解构预览弹窗。
3. **标为已处理 (`act.markDone`) 与状态位 (`stateText`)**：
   - 待处理卡片（`done_at == null && !in_library && interacted_at == null`）：槽位 3 渲染次级描边按钮 `标为已处理`。
   - 点击时**乐观测原地流转**为纯文本 `<span class="omnimux-rival-act-state">已处理</span>`，卡片根容器挂上 `is-done`。
   - 触发后端持久化端点 `POST /rival-accounts/:accountId/posts/:postId/done`（写入 `done_at` ISO 时间戳，零云调用，不消耗全局配额）。
   - 弹出规范 Toast `t('rivalFeed.toast.markDone')`。
   - 状态派生遵循优先级：`done_at`（已处理）> `in_library`（已复刻）> `interacted_at`（已互动）。
   - 无论状态如何变更，**严格保持卡片尺寸与瀑布流布局零重排**。
4. **立即复刻 (`act.replicate`)**：
   - 满宽 32px 主按钮常驻悬停层底部，执行会话挂载与提示词预填。

## 命令（Commands）

- 单测：`cd plugins/omnimux-inspiration && node --import ./scripts/deny-network.mjs --test src/rival/rival-accounts-store.test.js src/rival/rival-routes.test.js src/client/rival-post-card.test.js src/client/rival-api.test.js`
- 全量单元测试：`cd plugins/omnimux-inspiration && pnpm test`
- 客户端构建：`cd plugins/omnimux-inspiration && node scripts/build-client.mjs`

## 结构（Project Structure）

- **数据层**：
  - `plugins/omnimux-inspiration/src/rival/rival-accounts-store.js`：
    - `buildPostRow`：扩充持久化白名单，纳入 `done_at` 与 `interacted_at`。
    - `markPostDone(accountId, postId, nowIso)`：更新对应 post 的 `done_at`。
- **服务与路由**：
  - `plugins/omnimux-inspiration/src/rival/rival-accounts-service.js`：
    - 新增 `markPostDone(accountId, postId, opts)`。
  - `plugins/omnimux-inspiration/src/rival/rival-routes.js`：
    - 新增路由匹配与处理器：`POST /rival-accounts/:id/posts/:postId/done`。
  - `plugins/omnimux-inspiration/src/rival/rival-feed.js`：
    - `toFeedRow`：透传 `done_at` 与 `interacted_at`。
- **客户端与组件**：
  - `plugins/omnimux-inspiration/src/client/rival-api.js`：
    - 新增 `markRivalPostDone(accountId, postId)`。
  - `plugins/omnimux-inspiration/src/client/rival-filter.js`：
    - 确保 `toRivalCardRow` 正确映射 `done_at` / `interacted_at`。
  - `plugins/omnimux-inspiration/src/client/RivalAccountsPanel.jsx`：
    - `handleMarkDone` 异步调用 `markRivalPostDone`，并妥善处理失败回滚/轻量通知。
  - `plugins/omnimux-inspiration/src/client/RivalFeedGrid.jsx`：
    - 保持本地乐观测并向父级冒泡。
  - `plugins/omnimux-inspiration/src/client/RivalPostCard.jsx`：
    - 严格遵循产品经理文案与 UI 元素白名单（无任何多余图标、副标题、括号废话）。

## 成功标准（Success Criteria）

- [ ] 1. `POST /rival-accounts/:id/posts/:postId/done` 单元测试与路由测试通过，断言 `done_at` 落盘且 `budget` 零消耗。
- [ ] 2. `buildPostRow` 持久化回读测试验证 `done_at` 与 `interacted_at` 能够无损存取。
- [ ] 3. `RivalPostCard` 单元测试全绿：验证四项操作位排布、禁用态、就地状态切换为静态文本（非 button）。
- [ ] 4. 客户端全量单元测试与端到端测试全绿。
- [ ] 5. PM 界面元素与文案终验：`PM_SIGN_OFF: PASS`。
