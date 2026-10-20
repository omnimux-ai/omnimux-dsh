# #3436 账号监控左栏信息收敛 · 交付证据

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3436
- 基线：`57a6a20b567ba0421f82afc260e4da98af89b60f`
- 工作树：`.worktrees/account-column-converge-issue-3436`

## 改动

- 列头收敛为单行「监控账号 + 反选/重置」；删除「选择要查看的账号」提示；仅子集筛选时显示「已选 k 个账号」，全选不再重复计数；标题/摘要按需换行，避免 200px/英文溢出与省略。
- 账号行删除健康状态文字（正常/冷却中/已停止/需要重新导入）与「N 个作品」。
- 异常状态改为可聚焦警告图标：`role="img"` + `aria-label` 为具体原因；悬停/聚焦用 `position: fixed` 浮层提示（220px，视口内 clamp），行 `aria-label` 同时带原因，不再依赖原生 title，不再铺内联红字；停止账号保留「重试」按钮（额度耗尽时禁用并带额度提示）。
- 平台图标移到昵称旁（18px 底 + 13px SVG），不再与 handle 挤在第二行。
- 删除退役样式/文案：健康文字、原因行、作品数、quota 气泡、`rivalAccounts.column.hint`。
- 测试：账号列渲染、D1 四态、D4 额度、选择/重置断言改为新契约，并新增「无状态文字/无作品数/警告图标 aria-label 含原因/平台图标存在/全选无计数/子集有计数」；新增 page e2e「compact account column」断言列头无计数/无 hint、每行有平台图标且无状态与作品数。

## 真实浏览器证据（隔离工作树）

- 真实 `RivalAccountColumn`，5 个账号覆盖正常 ×2、已停止、冷却中、需重新导入；localhost 动态端口 57589，ego-browser 真实 Chromium。
- 初始（真实两栏栅格，248px 列）：列头标题与反选/重置同一行、子集计数在标题下方（`scrollWidth=clientWidth`），无 hint、无全选计数；5 行均无「正常/已停止/冷却中/需要重新导入/个作品」；5 个平台图标（18px 底 + 13px SVG）；3 个警告图标（停止/冷却/重导入，颜色随状态）；仅停止行有重试。
- 悬停冷却警告：tooltip 内容「冷却中 · 7 分钟后恢复」；tooltip 为 `position: fixed; box-sizing: border-box` 浮层（border-box 220px），实测 248px/200px 下 rect 完整落在视口内、不受列表 overflow 裁切；200px 最后一行 reimport 长原因分两行完整可见。
- 取消勾选一个账号：列头变为「监控账号 已选 4 个账号 反选 重置」。
- 200px 列（760 视口）：标题/计数不截断、无横向溢出，最后一行 reimport 长原因 tooltip 完整；248px 英文：`Monitored accounts + Invert/Reset` 不截断、无横向溢出。
- 截图：`browser-account-column-3436.png`、`browser-account-column-tooltip-3436.png`、`browser-account-column-subset-3436.png`、`browser-account-column-narrow-3436.png`、`browser-account-column-en-3436.png`；事实：`browser-facts.json`。

## 离线检查（工作树直接 node 执行）

| 检查 | 实际结果 |
| --- | --- |
| 插件核心套件 | 1637 项，1637 通过，0 失败，0 skip，0 外连 |
| `verify-stage-contracts` | PASS（14 Stage / 8 sidebar） |
| `verify-anti-slop` | 3/3 通过 |
| `scan-ui-gates` | 退出 1；与 main 同为 8 条既有违规（其它插件），inspiration 0 条 |
| `build-client` | 成功，`lib/client.js` 2,389,355 bytes（gitignored） |
| `impact-matrix` | `isUiChange=true`、`browser.required=true` |

## 边界

纯左栏信息收敛；不改接口/数据/健康判据/选择语义；右侧时间线不变。#3432 的两栏结构保持不变。
