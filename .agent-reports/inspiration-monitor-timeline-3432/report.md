# #3432 账号监控两栏布局 · 交付证据

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3432
- 基线：`87e7c83bb76cb6feef642b453b95045f8d30b575`
- 任务工作树：`.worktrees/inspiration-monitor-timeline-issue-3432`

## 改动

- 新增 `RivalAccountColumn`（左侧常驻账号多选列）与 `RivalTimeline` / `RivalTimelineRow`（右侧原生风格时间线）。
- `InspirationSection`：账号监控 Tab 改为 `.omnimux-rival-layout` 两栏；工具栏删除账号下拉与排序下拉，保留搜索/刷新/平台；排序固定最新发布。
- `RivalAccountsPanel`：有帖子渲染时间线（支持追加），无帖子沿用现有空态/骨架/首采进度。
- `toRivalCardRow` 增补 `text` / `avatar_url` 字段；账号行复用既有筛选行（状态、重试、主页跳转、反选/重置）。
- 新增 `rival-timeline.js` 纯函数（时间倒序、正文/首字母）。

## 真实浏览器证据（隔离工作树）

- 真实 `RivalAccountColumn` + `RivalAccountsPanel` 放在 `.omnimux-rival-layout` 两栏中，使用真实 `toggleAccountSelection`；localhost 动态端口 64253，ego-browser 真实 Chromium。
- 初始（响应式宿主，1280 视口）：布局 `248px 968px`；账号 2 行且默认全勾选；时间线 3 条且按发布时间倒序（`riv_higgs:2 → riv_judy:3 → riv_judy:1`）；首行头像/媒体自然宽 > 0、播放标记、正文、相对时间、播放/点赞/评论/分享与 4 个操作按钮（原帖/立即复刻/AI 解构/标为已处理；默认 hover/focus 显示，触屏媒体查询常显）。
- 取消勾选 X 账号：账号行 1 行勾选，右栏只剩 2 条 TikTok 帖；点重置：恢复 2 行勾选与 3 条帖。
- 窄视口：760px 时两栏（`200px 500px`，左栏 200px），375px 时堆叠单列（`327px`）且 `scrollOverflow=0`、操作行最后一个按钮在行内（`actionsOverflow` 分别为 -16 / -183px）；截图 `browser-timeline-narrow-760-3432.png`、`browser-timeline-narrow-375-3432.png`。
- 截图：`browser-timeline-initial-3432.png`、`browser-timeline-filtered-3432.png`；结构化事实：`browser-facts.json`。
- 限制：组件级真实浏览器证据，不证明完整 Stage 外壳；外壳装配由隔离 worktree 的 jsdom page 门禁与后续 Dev 页面覆盖。

## 离线检查（工作树直接 node 执行）

| 检查 | 实际结果 |
| --- | --- |
| 插件核心套件（含新增时间线纯函数/渲染/page e2e） | 1634 项，1634 通过，0 失败，0 skip，0 外连 |
| `src/explore` 套件 | 261 项全部通过 |
| `node scripts/verify-stage-contracts.mjs` | PASS（14 Stage / 8 sidebar） |
| `node --test scripts/verify-anti-slop.test.mjs` | 3/3 通过 |
| `node scripts/scan-ui-gates.mjs` | 退出 1；与 main 同为 8 条既有违规（均在其它插件），inspiration 0 条；新时间线媒体遮罩已改用 media token |
| `node scripts/build-client.mjs` | 成功，`lib/client.js` 2,387,528 bytes（gitignored） |
| `node scripts/impact-matrix.mjs --git-diff --base origin/main` | `isUiChange=true`、`browser.required=true` |

## 边界

不改 Host 数据/接口/额度/刷新；不改灵感库与爆款趋势。`RivalMasonry` / `RivalPostCard` 仍被灵感库消费，保留；账号监控只停止渲染它们，并删除退役弹层 UI 与相关文案/样式。
