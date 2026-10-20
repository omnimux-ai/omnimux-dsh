# #3467 账号监控交互优化 · 交付证据

- Issue：#3467；基线 `c110886b94ba95ddcea89b9f0ab6b561f7af0198`
- 工作树：`.worktrees/account-monitor-ux-issue-3467`

## 改动

- **删除确认弹窗**：菜单「删除」改开 `ConfirmModal`，显示「删除账号」+ 账号昵称（@handle）+「确认删除 X？删除后其帖子不再监控。」+ 取消/删除；失败在弹窗内提示且账号保留；成功后当前账号回「全部」。
- **平台分组名**：分组标题统一为 X / TikTok / YouTube / Instagram（X 不再显示「推特 (X)」）；全局平台标签不变。
- **触屏常显「更多」**：`@media (hover: none), (pointer: coarse)` 下 `.omnimux-rival-filter-more` opacity 1、可点击。
- **菜单跟随**：打开菜单后监听 window scroll(capture) / resize，立即关闭，避免锚点漂移。
- **警告键盘可达**：警告图标 `tabIndex=0`、`aria-describedby` 指向 `role=tooltip` 原因文本；聚焦/悬停显示 tooltip（聚焦状态 portal 到 body 的 fixed tooltip）。
- **重复点击当前账号不重拉**：`selectAccount` 对同一单选账号直接 return。
- **手动刷新**：账号「更多」菜单新增「刷新」，调用 `refreshRivalAccount(id, { manual: true })` 的既有 `retryAccount` 路径，沿用额度/冷却提示。

## 真实浏览器证据

- 真实组件 + 注入样式，ego-browser 1728×883，localhost 端口 62929。
- 分组：X / TikTok；菜单：刷新 / 删除；删除弹窗文案含昵称与 @handle；取消/删除按钮齐全。
- 警告图标可 Tab 聚焦，`aria-describedby` + `role=tooltip`；聚焦时 portal 到 body 的 tooltip 可见「冷却中 · 10 分钟后恢复」，不被账号列表裁切。
- 打开菜单后滚动立即关闭；「刷新」回调命中单账号。
- 删除失败：弹窗保留、`role=alert` 显示「删除失败，请重试」，3 个账号全部保留。
- 截图：`browser-groups-3467.png`、`browser-warning-focus-3467.png`、`browser-menu-3467.png`、`browser-delete-confirm-3467.png`、`browser-delete-failure-3467.png`；事实：`browser-facts.json`。

## 离线检查

| 检查 | 结果 |
| --- | --- |
| 插件核心套件 | 1696 / 1696 通过，0 fail，0 skip，0 外连 |
| `verify-stage-contracts` | PASS（14 Stage / 8 sidebar） |
| `verify-anti-slop` | 3/3 |
| `scan-ui-gates` | 与 main 同为 8 条既有违规（其它插件），inspiration 0 |
| `build-client` | 成功，2,424,843 bytes |

## 边界

本次只改账号监控左栏/菜单/删除/警告/刷新与选择加载；Host 接口、时间线与其它 tab 不变。手动刷新沿用既有单账号刷新预算与冷却；触屏「更多」依赖 CSS 指针媒体查询。
