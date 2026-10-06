# 垂直任务工单（Tickets · Issue #3114）

## 依赖关系与拓扑
- Ticket 1 (T1 数据存储) -> 无阻塞
- Ticket 2 (T2 路由与服务) -> 阻塞于 T1
- Ticket 3 (T3 客户端 API 与状态流转) -> 阻塞于 T2
- Ticket 4 (T4 卡片组件与 PM 终验) -> 阻塞于 T3

---

### [Ticket 1] 数据存储字段白名单与回读测试
- **写域**:
  - `plugins/omnimux-inspiration/src/rival/rival-accounts-store.js`
  - `plugins/omnimux-inspiration/src/rival/rival-feed.js`
  - `plugins/omnimux-inspiration/src/rival/rival-accounts-store.test.js`
- **验收项**:
  - `buildPostRow` 纳入 `done_at` 和 `interacted_at`
  - `updatePost` 更新 `done_at` 后断言持久化文件能正确读回
  - `toFeedRow` 透传 `done_at` 和 `interacted_at`

---

### [Ticket 2] 服务端接口实现与路由契约测试
- **写域**:
  - `plugins/omnimux-inspiration/src/rival/rival-accounts-service.js`
  - `plugins/omnimux-inspiration/src/rival/rival-routes.js`
  - `plugins/omnimux-inspiration/src/rival/rival-routes.test.js`
- **验收项**:
  - 端点 `POST /rival-accounts/:accountId/posts/:postId/done` 支持就地标记
  - 回包 `{ post_id, done_at }`，测试验证状态 200，不存在时 404
  - 零云调用，预算未被扣减

---

### [Ticket 3] 客户端 API 接入与面板动作连通
- **写域**:
  - `plugins/omnimux-inspiration/src/client/rival-api.js`
  - `plugins/omnimux-inspiration/src/client/rival-api.test.js`
  - `plugins/omnimux-inspiration/src/client/RivalAccountsPanel.jsx`
- **验收项**:
  - 封装 `markRivalPostDone(accountId, postId)`
  - 单测验证请求与响应结构
  - `RivalAccountsPanel` 在 `handleMarkDone` 中调用接口并提示 Toast

---

### [Ticket 4] 卡片操作栏行为、无障碍与 PM 视觉终验
- **写域**:
  - `plugins/omnimux-inspiration/src/client/RivalPostCard.jsx`
  - `plugins/omnimux-inspiration/src/client/rival-post-card.test.js`
  - `plugins/omnimux-inspiration/src/client/rival-styles.js`
- **验收项**:
  - 原帖直达根据 URL 有效性显示/禁用，禁用态挂 `disabled={true}`、提示文案并阻止冒泡
  - 槽位 3 在无状态时为 Secondary 按钮 `标为已处理`，在有状态时渲染纯文本 `<span class="omnimux-rival-act-state">`
  - 零过度设计：无多余 Emoji、图标、副标题或括号废话
  - PM 逐字文案与 UI 元素终验通过
