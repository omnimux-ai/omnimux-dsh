# 技术架构与垂直任务分解（Architecture & Tickets · Issue #3114）

## 1. 系统边界与数据流拓扑

```
[前端组件层]
  RivalPostCard.jsx (展示 4 操作位: 槽位 1 原帖直达, 槽位 2 AI 拆解, 槽位 3 标为已处理/状态文字, 主操作 立即复刻)
       │
       ▼ (点击「标为已处理」)
  RivalFeedGrid.jsx (乐观测: setDoneIds 立即就地更新为 is-done + stateText='已处理', 不变高度零重排)
       │
       ▼ (onMarkDone 回调)
  RivalAccountsPanel.jsx (调用 markRivalPostDone, 弹出全局 Toast)
       │
       ▼ (HTTP POST /rival-accounts/:accountId/posts/:postId/done)
[插件服务端层]
  rival-routes.js (matchRivalRoute 匹配 'post-done' -> postDoneHandler)
       │
       ▼
  rival-accounts-service.js (markPostDone(accountId, postId) -> 校验并调用 store)
       │
       ▼
  rival-accounts-store.js (updatePost(accountId, postId, { done_at: nowIso }))
       │
       ▼ (落盘)
  posts/{accountId}.json (持久化存储, done_at / interacted_at 保留白名单)
```

## 2. 垂直任务分解（Vertical Slices）

- **T1: 数据存储与白名单加固**
  - 在 `rival-accounts-store.js` 的 `buildPostRow` 中明确纳入 `done_at` 与 `interacted_at` 字段白名单，避免落盘后读出丢失。
  - 在 `rival-feed.js` 的 `toFeedRow` 中透传 `done_at` 与 `interacted_at`。
  - 在 `rival-accounts-store.test.js` 中新增测试用例，断言 `updatePost` 写入 `done_at` 后可被正确读回。

- **T2: 服务层与路由端点实现**
  - 在 `rival-accounts-service.js` 中新增 `markPostDone(accountId, postId)` 方法。
  - 在 `rival-routes.js` 中新增路由匹配 `{ kind: 'post-done', id, postId }`，处理 `POST /rival-accounts/:accountId/posts/:postId/done`。
  - 路由测试 `rival-routes.test.js`：验证端点返回 200，回包携带 `{ post_id, done_at }`，重复调用幂等，无效 account/post 返回 404，不消耗 cloud calls。

- **T3: 客户端 API 封装与状态映射连通**
  - 在 `rival-api.js` 中增加 `markRivalPostDone(accountId, postId)`。
  - 在 `rival-api.test.js` 中新增单测。
  - 在 `RivalAccountsPanel.jsx` 中将 `handleMarkDone` 接入 `markRivalPostDone`，实现持久化与 Toast 提示。

- **T4: 组件层与样式精细化对齐（PM 文案与设计门禁）**
  - 在 `RivalPostCard.jsx` 中严密贯彻 PM 字典：原帖直达根据 URL 有效性显示/禁用，槽位 3 在无状态时为 Secondary 按钮 `标为已处理`，在有状态时渲染纯文本 `<span class="omnimux-rival-act-state">`。
  - 在 `rival-post-card.test.js` 补充断言：槽位 3 绝非带 disabled 的 button，而是纯文本 span；禁用态原帖直达阻断冒泡；点击标为已处理触发回调。
  - 跑通真实浏览器 / CDP 验收验证视觉与交互。
