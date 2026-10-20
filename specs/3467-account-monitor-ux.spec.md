---
status: active
issue: 3467
base: c110886b94ba95ddcea89b9f0ab6b561f7af0198
---

# 3467 账号监控交互优化

## 用户旅程

1. 打开账号监控，左栏按平台分组；平台标题统一为 X / TikTok / YouTube / Instagram。
2. 点击账号切换右侧内容；再次点击同一账号不重复请求。
3. 悬停账号行（触屏设备常显）→「更多」：
   - 「刷新」：手动刷新该账号，复用既有刷新额度/提示。
   - 「删除」：打开确认弹窗，显示 @handle/昵称和「删除后其帖子不再监控」；取消保留账号；确认后删除，当前账号回到「全部」，失败弹窗内提示且账号保留。
4. 打开菜单后滚动 Stage 或缩放窗口，菜单关闭。
5. 键盘 Tab 到警告图标，聚焦/悬停显示健康原因 tooltip。

## 实现

- `RivalAccountColumn`：删除改为 `ConfirmModal`（显示昵称/@handle）；菜单新增「刷新」；菜单监听 scroll(capture)/resize 关闭；触屏 CSS 常显「更多」。
- `RivalAccountFilter`：警告图标 `tabIndex=0` + `aria-describedby` + tooltip（role=tooltip），保留 title。
- `use-rival-feed.selectAccount`：同一单选账号重复点击直接 return，不 load。
- `InspirationSection`：传入 `onRefresh` → `rivalFeed.retryAccount(id)`（手动刷新单账号）。
- `RivalAccountColumn` 分组标题对 x 显示 X（不动全局 `platform.x`）；`locales` 新增删除弹窗/刷新菜单文案。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | 删除单击 | 弹窗显示账号名/@handle 与删除后果 |
| A2 | 取消 | 账号保留，无 DELETE |
| A3 | 确认成功 | 行消失；删当前账号回「全部」 |
| A4 | 删除失败 | 弹窗内提示，账号保留 |
| A5 | 平台名 | X / TikTok / YouTube / Instagram |
| A6 | 触屏 | `hover:none/pointer:coarse` 下「更多」opacity 1、可点 |
| A7 | 滚动/缩放 | 打开菜单后菜单关闭 |
| A8 | 警告键盘 | 警告可 Tab 聚焦，tooltip 可见/可读 |
| A9 | 重复点当前账号 | 不发起 accounts/posts 请求 |
| A10 | 菜单刷新 | 调用单账号手动刷新，显示既有刷新提示 |

## 验证

插件核心套件、账号监控渲染/page e2e、真实浏览器组件页证据（分组/菜单/删除弹窗与失败/键盘 tooltip/滚动关闭/刷新回调）、verify-stage-contracts、anti-slop、scan-ui-gates；Dev 真机验收人工负责。
