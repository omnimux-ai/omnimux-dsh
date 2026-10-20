# #3434 分页 append 代际隔离与标为已处理失败文案 · 交付证据

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3434
- 基线：`341ded0a34976a8dad2e1cf61992afbf7ee29e76`
- 工作树：`.worktrees/inspiration-append-ticket-issue-3434`

## 改动

- `use-rival-feed.js`：新增 `appendTicket` 代际。`load()` 开始时递增并清理 `loadingMore`（作废旧 append）；`loadMore()` 捕获本代 ticket，`finally` 仅在本代仍当前时清 flag。旧 append 迟到不再清掉新 append 的 loadingMore，避免同页重复 append。
- `locales.js`：新增 `rivalFeed.toast.markDoneFailed`（中英）。
- `RivalAccountsPanel.jsx`：标为已处理 POST 失败/异常时回滚并显示专用失败文案，不再复用「添加到会话失败」；注释同步。
- `rival-cards.e2e.test.js`：page2 使用按次 deferred 响应；旧 append 在途 → 切账号 → 重置 → 新 append 在途时，先释放旧响应，断言新 append 的 skeleton 仍在且 page2 请求数保持 2，再释放新响应落地。该用例在旧实现（无条件 finally）下会失败。

## 真实浏览器证据（隔离工作树）

- 真实 `RivalAccountsPanel`（单条时间线行），页面在模块加载前把 `fetch('/done')` stub 为 500；localhost 动态端口 51125，ego-browser 真实 Chromium。
- 点击「标为已处理」后：行回滚 `is-done=false`、`markDone` 按钮恢复、提示「标记失败，请重试」、无「添加到会话」文案、无页面错误。
- 截图：`browser-done-failure-3434.png`；事实：`browser-facts.json`；ego 任务空间 126 已 finish。

## 离线检查（工作树直接 node 执行）

| 检查 | 实际结果 |
| --- | --- |
| 插件核心套件（含新增 page2 请求数断言） | 1634 项，1634 通过，0 失败，0 skip，0 外连 |
| `verify-stage-contracts` | PASS（14 Stage / 8 sidebar） |
| `verify-anti-slop` | 3/3 通过 |
| `scan-ui-gates` | 退出 1；与 main 同为 8 条既有违规（其它插件），inspiration 0 条 |
| `impact-matrix` | `isUiChange=true`、`browser.required=true` |

## 边界

仅修内部竞态与失败文案；不改账号监控布局、分页产品行为、接口或数据。
