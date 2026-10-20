# #3451 账号监控左栏：单选分组导航 + 更多/删除 · 交付证据

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3451
- 基线：`c736cf922e3b13a244bd8faf8f237130fcd70f30`
- 工作树：`.worktrees/account-single-select-issue-3451`

## 改动

- 左栏去掉多选：删除复选框、反选/重置、已选摘要；行不再有 `aria-checked`。
- 顶部「全部」项（默认选中，带账号数）；按平台分组（X/TikTok/YouTube/Instagram）列出账号。
- 点击账号 = 单选该账号（`selection={mode:'subset',ids:[id]}`）；点击「全部」恢复全部账号；选中行高亮 + `aria-current`。
- 行结构为主选择区（role=button）+ 同级操作区，避免 button 内嵌 button；行悬停显示「更多」按钮（IconButton，不触发行选中）；菜单固定定位：
  - 首次「删除」，再点「确认删除」才调用 `removeRivalAccount(id)`（现有 DELETE 接口）；
  - 成功后行消失、内容刷新；删的是当前账号则回到「全部」；
  - 失败（HTTP 或网络异常）在菜单内显示「删除失败，请重试」，行保留；Escape 在聚焦的触发按钮上也能关闭菜单；主选择区单击只触发一次 select/load。
- `use-rival-feed` 新增 `selectAccount(id)`；`InspirationSection` 负责删除后 reload/reset。
- 健康警告/重试/主页跳转保留；右侧时间线不变。

## 真实浏览器证据（隔离工作树）

- 真实 `RivalAccountColumn` + `RivalAccountsPanel`，5 个账号覆盖 X/TikTok/YouTube/Instagram；localhost 动态端口 55470，ego-browser 真实 Chromium。
- 初始：「全部」高亮、文本「全部5」；5 行；分组标题 推特 (X)/TikTok/YouTube/Instagram；无 checkbox、无反选；右侧 5 条。
- 点击 Higgsfield AI：仅该行选中，「全部」取消高亮，右侧时间线只剩 1 条。
- 悬停该行：「更多」opacity=1；点击打开菜单「删除」；再点变「确认删除」；确认后行数 4、右侧 4 条、删除调用 1 次，且因删的是当前账号自动回到「全部」。
- 失败路径（Hullo）：菜单显示「删除失败，请重试」，行保留；累计删除调用 2 次。
- 截图：`browser-single-select-3451.png`、`browser-single-select-account-3451.png`、`browser-single-select-menu-3451.png`、`browser-single-select-confirm-3451.png`、`browser-single-select-removed-3451.png`；事实：`browser-facts.json`。

## 离线检查

| 检查 | 实际结果 |
| --- | --- |
| 插件核心套件 | 1647 项，1647 通过，0 失败，0 skip，0 外连 |
| `verify-stage-contracts` | PASS（14 Stage / 8 sidebar） |
| `verify-anti-slop` | 3/3 通过 |
| `scan-ui-gates` | 退出 1；与 main 同为 8 条既有违规（其它插件），inspiration 0 条 |
| `build-client` | 成功，`lib/client.js` 2,398,022 bytes（gitignored） |

## 边界

左栏交互模型变化；右侧时间线、Host 删除接口、刷新/健康判据不变。
