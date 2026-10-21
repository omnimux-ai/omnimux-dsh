# #3542 账号监控时间线直接内嵌平台官方帖子 · 交付证据

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3542
- 基线：`f02a22135`
- 工作树：`.worktrees/inspiration-timeline-embed-issue-3542`
- 规格：`specs/3542-timeline-official-embeds.spec.md`

## 改动

- `rival-embed.js`：新增 `rivalEmbedTarget(card)`（`card` 整卡 / `player` 播放器 / `null` 回退），复用既有 URL 白名单与 id 解析。
- 新增 `rival-timeline-embed-loader.js`：X 官方 `widgets.js` 单例加载、`createTweet`（`theme=dark/light`、`dnt`、`lang`、`conversation:none`）、TikTok/YouTube/Instagram 官方 iframe、失败缓存、Instagram 高度估算。
- 新增 `rival-timeline-embed.jsx`：懒挂载状态机（`IntersectionObserver`，提前 600px）、10 秒超时回退、`data-embed-state`。
- `RivalTimelineRow.jsx`：X/Instagram 嵌入就绪后隐藏自绘头像/正文/媒体（`is-embed-card`），TikTok/YouTube 只替换媒体区（`is-embed-player`）；footer 指标与四个操作保留；点击落在嵌入区域时不再打开「作品详情」（`data-embed-mounted` 供 QA 观察）。
- `rival-styles.js`：嵌入容器/播放器比例/隐藏态样式。
- 无 Host 接口与数据结构变更；嵌入纯展示，不写回灵感库或分析结果。

## 真实浏览器证据（隔离工作树）

- 真实 `RivalTimeline` + 生产样式/主题 token + 真实平台嵌入地址；localhost 动态端口 `50386`；ego-browser 真实 Chromium `1440×1000`、`data-theme=dark`；TaskSpace 用完 `keep: []` 关闭。
- 懒加载：首屏 12 行中 11 行可嵌入，只有进入视口附近的 3 行（`x-1`/`tt-1`/`yt-1`）创建 iframe；下滚后才挂载其余行。嵌入就绪改为等待 iframe `load`（10 秒看门狗），被墙/离线时不会把自绘卡片藏掉。
- 独立评审修复（PR 复审）：主题/语言切换时 `host.replaceChildren()` 防止叠第二张官方卡、重建期回落自绘卡片；iframe 增加 `no-cors` HEAD 可达性探测（Chromium 对错误页也触发 `load`，仅靠 iframe 事件无法判定）+ `load`/`error` 兜底；播放器容器 `aspect-ratio:auto` 消除占位比例泄漏；新增对应单测/e2e。
- X：官方整卡 iframe `550×823`，URL 带 `dnt=true`、`lang=zh-cn`、`theme=dark`；点视频中央后画面变化（媒体区像素差均值 49.41/42.49/44.84），`window.__detailOpens` 保持 0——在行内直接播放，不弹「作品详情」。
- TikTok：官方播放器 `287×510`（9:16，受 510px 媒体上限约束），TikTok chrome 与播放控件可见。
- YouTube：官方播放器 `536×302`（16:9），Big Buck Bunny 真实可播。
- Instagram：官方 `/embed/` 卡片 iframe `550×740`（夹具 shortcode 非真实帖子，白色页为 Instagram 自己的渲染；只证明卡片与尺寸）。
- 抖音（无官方嵌入）：零 iframe，保留自绘卡片、媒体占位与四个操作。
- 离线回退：正常加载后用 CDP 断网，再滚到未挂载的 Instagram 行——`no-cors` HEAD 探测失败，行内零 iframe、保留作者/正文/指标与四个操作，不显示浏览器错误页（`timeline-offline-fallback.png`）。
- 四个操作（原帖直达 / 立即复刻 / AI 拆解 / 标为已处理）在所有行保留；点嵌入区不会打开详情弹窗（点击守卫）。
- 截图：`timeline-top.png`、`timeline-x-playing.png`、`timeline-tiktok-player.png`、`timeline-tiktok-playing.png`、`timeline-youtube-player.png`、`timeline-douyin-fallback.png`；事实：`browser-facts.json`。

## 离线检查

| 检查 | 实际结果 |
| --- | --- |
| 插件核心套件 | 1810 项通过、0 失败、0 skip、0 外连（`npm test`，exit 0；含本任务新增 e2e 4 项与单测 24 项） |
| 新增嵌入单测 | 13 项通过（loader/主题/语言/iframe/失败缓存/高度） |
| `build-client` | 成功，`lib/client.js` 2,453,757 bytes（gitignored） |
| `verify-stage-contracts` | PASS（14 Stage / 8 sidebar；补齐工作树依赖软链后与 main 一致） |
| `scan-ui-gates` | 退出 1；与 main 同为 7 条既有违规（其它插件），inspiration 0 条 |

## 边界与残留

- 嵌入依赖平台官方域网络（`platform.twitter.com`、`tiktok.com`、`youtube.com`、`instagram.com`）；脚本/嵌入失败、超时、无官方嵌入（抖音/小红书）时回退现有卡片，不阻塞其他行。
- X 官方整卡高度约 800px，时间线单屏可读帖子数会下降，这是「原帖整卡」的固有代价；如需更紧凑可改为仅播放器内嵌。
- Instagram 官方嵌入为白色卡片（平台自身主题），深色界面下与 X 的深色卡片观感不同。
- 详情弹窗的嵌入（#3462）本次未改造，仍保留给无嵌入平台与完整数据查看。
