# #3446 账号行不换行 + 警告图标固定在昵称右侧 · 交付证据

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3446
- 基线：`cb1a5c148acdef6f3cfb397e5d964d6cdaed2da6`
- 工作树：`.worktrees/account-row-nowrap-issue-3446`

## 改动

- 账号行昵称行 `flex-wrap: nowrap`；昵称 `flex: 0 1 auto; min-width:0` + 单行省略号，超长不再换行。
- 平台图标紧随昵称、警告/重试状态组 `margin-left:auto`，固定在昵称同一行最右侧（图 2 红圈位置）。
- handle 单行省略；列头单行 `nowrap`，标题自带省略号，操作按钮不换行。
- ≤960px 窄列：昵称保留 36px 最小宽度；隐藏 hover 主页跳转；重试收成图标（aria-label/title 保持「重试」）；子集计数隐藏；标题用省略号而不是硬裁。
- 删除上一版为换行准备的 `overflow-wrap:anywhere` 与纵向标题布局。
- 测试：D1 新增「警告/状态组/平台图标都在昵称行内、平台紧随昵称」DOM 契约；polish 真实 Chrome 改为断言昵称行 `nowrap`、单行高度、长昵称省略。

## 真实浏览器证据（隔离工作树）

- 真实 `RivalAccountColumn` + 真实两栏布局；5 个账号使用故意加长的昵称/handle，覆盖正常 ×2、已停止、冷却中、需重新导入；localhost 动态端口 60374，ego-browser 真实 Chromium。
- 初始（248px 列）：列头单行 `nowrap`；5 行昵称行均 `nowrap`、昵称行高 20/22px（仅重试按钮使行高多 2px，无第二行）；长昵称全部省略；平台图标与昵称间距 6px 且同一水平线；冷却/重导入警告图标距行右缘 8px，停止行警告+重试居右（警告距右缘 58px，重试在其右）。
- 200px 列与英文 200/248px：同样不换行、无横向溢出；停止行昵称仍可见（≥36px）、重试为图标；英文 200px 标题省略号而非硬裁。
- 截图：`browser-row-nowrap-3436.png`、`browser-row-nowrap-subset-3436.png`、`browser-row-nowrap-narrow-3436.png`、`browser-row-nowrap-narrow-en-3436.png`、`browser-row-nowrap-en-3436.png`；事实：`browser-facts.json`。

## 离线检查

| 检查 | 实际结果 |
| --- | --- |
| 插件核心套件 | 1637 项，1637 通过，0 失败，0 skip，0 外连 |
| `verify-stage-contracts` | PASS（14 Stage / 8 sidebar） |
| `verify-anti-slop` | 3/3 通过 |
| `scan-ui-gates` | 退出 1；与 main 同为 8 条既有违规（其它插件），inspiration 0 条 |
| `build-client` | 成功，`lib/client.js` 2,390,762 bytes（gitignored） |

## 边界

纯布局收敛；不改选择/刷新/重试/健康判据与右侧时间线。
