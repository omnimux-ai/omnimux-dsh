# Issue #3114: 对标账号监控作品卡操作区功能闭环验收报告

## 1. 概述与交付范围
- **Issue**: #3114
- **分支**: `feat/ai-3114-issue-3114`
- **工作树**: `.worktrees/ai-3114`
- **交付目标**:
  1. 「原帖直达」（Original）：外链安全校验，非合法 http(s) 链接置灰并提供 tooltip 与 aria 读屏支持；合法链接安全外跳。
  2. 「AI 拆解」（AI breakdown）：触发 `/video-deconstruct` 并唤起作品解析弹窗。
  3. 「立即复刻」（Replicate）：32px 满宽主操作按钮，直通会话挂载与提示词预填。
  4. 「标为已处理」（Mark done）：乐观测瞬时翻转为静态「已处理」文本标签，零高度跳动与零布局重排；异步调用本地后端端点 `POST /rival-accounts/:accountId/posts/:postId/done` 完成持久化。

## 2. 架构与改动清单
- **Store 层**: `plugins/omnimux-inspiration/src/rival/rival-accounts-store.js`
  - `buildPostRow` 持久化白名单字段扩充 `done_at` 与 `interacted_at`。
- **Feed 汇聚层**: `plugins/omnimux-inspiration/src/rival/rival-feed.js`
  - `toFeedRow` 补充透传 `done_at` 与 `interacted_at`。
- **后端 Service 层**: `plugins/omnimux-inspiration/src/rival/rival-accounts-service.js`
  - 实现 `markPostDone(accountId, postId, opts)`，支持幂等标记与当前时间戳持久化。
- **路由分发层**: `plugins/omnimux-inspiration/src/rival/rival-routes.js`
  - 注册 `POST /rival-accounts/:accountId/posts/:postId/done`，返回 `{ post_id, done_at }`。
- **客户端 API 层**: `plugins/omnimux-inspiration/src/client/rival-api.js`
  - 实现 `markRivalPostDone(accountId, postId)`。
- **面板容器层**: `plugins/omnimux-inspiration/src/client/RivalAccountsPanel.jsx`
  - `handleMarkDone` 接入 `markRivalPostDone` 异步持久化闭环。
- **卡片渲染层**: `plugins/omnimux-inspiration/src/client/RivalPostCard.jsx`
  - 严格状态机优先级映射：`done_at` (done) > `in_library` (replicated) > `interacted_at` (interacted) > `null` (unprocessed)。
  - `isDone` 状态下 Slot 3 静态渲染 `span.omnimux-rival-act-state`。

## 3. 测试与验证数据
- **网络隔离门禁**: 全部通过 `node --import ./plugins/omnimux-inspiration/scripts/deny-network.mjs --test` 运行。
- **单测结果**:
  - `rival-accounts-store.test.js`: 48/48 PASS
  - `rival-routes.test.js`: 41/41 PASS
  - `rival-feed-velocity.test.js`: 37/37 PASS
  - `api.test.js`: 33/33 PASS
  - `rival-post-card.test.js`: 19/19 PASS
  - `rival-accounts-panel.test.js`: 4/4 PASS
  - 全插件回归测试: 261/261 PASS (REAL_EXIT=0)

## 4. 产品与设计合规验收 (PM Sign-off)
- **PM_SIGN_OFF**: APPROVED
- **文案白名单**:
  - `rivalFeed.card.original`: 原帖直达 / Original
  - `rivalFeed.card.originalUnavailable`: 原帖链接不可用 / Original link unavailable
  - `rivalFeed.card.deconstruct`: AI 拆解 / AI breakdown
  - `rivalFeed.card.replicate`: 立即复刻 / Replicate
  - `rivalFeed.card.markDone`: 标为已处理 / Mark done
  - `rivalFeed.card.done`: 已处理 / Done
  - `rivalFeed.card.replicated`: 已复刻 / Replicated
- **反过度设计**: 零多余装饰图标，零冗余营销标签，按钮高度严格匹配 32px 规格。
