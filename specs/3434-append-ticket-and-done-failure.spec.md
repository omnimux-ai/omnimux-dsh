---
status: active
issue: 3434
base: 341ded0a34976a8dad2e1cf61992afbf7ee29e76
---

# 3434 分页 append 代际隔离与「标为已处理」失败文案

## 目标

修复 #3432 复审遗留的两个低风险 P3：

1. `use-rival-feed.js` 的 `loadMore.finally` 无条件 `setLoadingMore(false)`。场景：旧 selection 的 page2 在途 → page1 reload 完成 → 新 sentinel 触发新 page2 → 旧请求迟到 resolve 时清掉新请求的 flag，使 sentinel 可再次触发同页 append（瞬态重复请求，重载自愈）。
2. `RivalAccountsPanel.handleMarkDone` 失败回滚时复用 `rivalAccounts.post.attachFailed`（「添加到会话失败」），与「标为已处理」无关；注释与实现相反。

## 实现

- `use-rival-feed.js`：新增 append 代际 `appendTicket` ref。`load()` 开始时递增（作废旧 append）并清理 `loadingMore`；`loadMore()` 捕获自己的 ticket，`finally` 只在代际仍是自己时清 flag。
- `locales.js`：新增 `rivalFeed.toast.markDoneFailed`（中英）。
- `RivalAccountsPanel.jsx`：失败/异常分支改为专用文案，修正注释。
- `rival-cards.e2e.test.js`：page2 用按次 deferred 响应；在「旧 append 在途 + page1 reload + 新 append 在途」时先释放旧响应，断言新 append 的 3 个 skeleton 仍在、page2 总请求数保持 2，再释放新响应后正常落地。
- 真实浏览器 harness：stub 失败的 `/done` 请求，点击「标为已处理」后断言行回滚且出现专用失败文案。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | 旧 append 在途 + page1 reload + 新 append | 旧请求迟到后新 append 的 loadingMore 不被清除；同页不重复 append（page2 请求数 = 2） |
| A2 | 标为已处理 POST 失败 | 行回滚为未处理，提示「标记失败，请重试」 |
| A3 | 正常路径 | 分页、乐观翻转、成功提示不回退 |

## 验证

插件核心套件、受影响 page e2e、真实浏览器失败提示、`verify-stage-contracts`、`verify-anti-slop`、`scan-ui-gates` 与 main 对照、`impact-matrix`。

## 文档影响

内部竞态与文案修复；不改接口/合同/README。旧 spec #3432 仍是行为真源，本 spec 只补竞态与失败文案。
