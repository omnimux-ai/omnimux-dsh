# #3448 账号监控左栏吸附在 Tab 栏下方 · 交付证据

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3448
- 基线：`1c90dfe25dae5d99c37bfa26018dccf68cfed222`
- 工作树：`.worktrees/account-column-sticky-issue-3448`

## 改动

- `RivalAccountColumn` 用 `useLayoutEffect` + `ResizeObserver` 实测最近的 `.omx-stage-scroll` 高度与其中 `.omx-stage-sticky` 头部高度，写入 CSS 变量 `--omnimux-rival-scroll-h` / `--omnimux-rival-sticky-h`。
- `.omnimux-rival-accounts` 吸顶偏移改为 `calc(var(--omnimux-rival-sticky-h, var(--stage-sticky-offset, 44px)) + 12px)`；max-height 用实测 scrollport 高度扣掉头部与 24px。
- 不使用 100vh：workbench pane 有 tab strip/header，Stage 高度小于窗口；实测 scrollport 后，列底不会伸出可见区，账号列表自身滚动。
- ≤720px 堆叠 static 行为不变。
- 测试：styles 断言 sticky top/max-height 公式；polish 真实 Chrome 现在挂 `.omx-stage-scroll`（600px）+ `.omx-stage-sticky`（48px），断言 top=60、max-height=528，并模拟「隐藏 → 缩到 400px → 再显示」后 scrollVar=400、列底不超出 scrollport。

## 真实浏览器证据（隔离工作树）

- 真实 `RivalAccountColumn` + 真实两栏布局，放在 600px `.omx-stage-scroll` 内，顶部实测 48px `.omx-stage-sticky` 头部；窗口 1200×900（容器明显矮于视口）；ego-browser 真实 Chromium，localhost 动态端口 52166。
- 实测变量写入成功：sticky=48px、scroll=600px；滚动前列 top=64（在 Tab 栏下方），列表内部已可滚动（1111 > 472）。
- 滚动 300px 后：列 top=60（头部底部 48 + 12），bottom=588 ≤ scrollport 底部 600，列高 528=600-48-24；右侧内容 top 从 64 → -236（继续滚动）；无页面错误/横向溢出。
- 隐藏/缩放/再显示：`.omx-stage-scroll` 设为 `display:none` 并缩到 400px，再显示并置 active=true；实测 scrollVar 从 600→400，列 bottom=388 ≤ 400，列表可视高度 272，证明会重新测量而不是冻结旧值。
- 截图：`browser-sticky-scrolled-3448.png`；事实：`browser-facts.json`。

## 离线检查

| 检查 | 实际结果 |
| --- | --- |
| 插件核心套件 | 1638 项，1638 通过，0 失败，0 skip，0 外连 |
| `verify-stage-contracts` | PASS（14 Stage / 8 sidebar） |
| `verify-anti-slop` | 3/3 通过 |
| `scan-ui-gates` | 退出 1；与 main 同为 8 条既有违规（其它插件），inspiration 0 条 |
| `build-client` | 成功，`lib/client.js` 2,392,532 bytes（gitignored） |

## 边界

纯吸附偏移修复；不改账号行/时间线内容、选择/刷新逻辑与 Stage 合同。
