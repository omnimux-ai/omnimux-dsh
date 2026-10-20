# #3462 账号监控全平台嵌入式播放器 · 交付证据

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3462
- 基线：`eba15edf98da095316d314f4e51ad01907ade030`
- 工作树：`.worktrees/account-embed-player-issue-3462`

## 改动

- 新增 `rival-embed.js` 纯函数：从帖子 `url`（回退 `id`）生成官方 embed：
  - TikTok `/video|photo|v/{id}`、`share_item_id`、`/player/v1/{id}` → `https://www.tiktok.com/player/v1/{id}`（避开 /embed/v2 在应用 referer 下的 429）
  - X `/status/{id}` → `https://platform.twitter.com/embed/Tweet.html?id={id}`
  - YouTube `watch?v`、`youtu.be`、`shorts`、`embed` → `https://www.youtube.com/embed/{id}?rel=0`
  - Instagram `/p|reel|tv/{code}` → `https://www.instagram.com/{kind}/{code}/embed/`
  - 未知平台/无法解析 → `null`（回退封面）
- `RivalPostPreviewModal`：有 embed 时以 iframe 播放器替换封面，按帖子比例设置宽高比，`allow="encrypted-media; picture-in-picture; fullscreen"`（不自动播放）、`allowFullScreen`、`referrerPolicy`、懒加载；无 embed 时保留封面 + 时长，封面也受同一高度上限约束。
- 原帖跳转、复刻、关闭不变；iframe 仅在详情弹窗打开时加载，时间线不内联多个播放器。

## 真实浏览器证据（隔离工作树）

- 真实 `RivalPostPreviewModal` + 注入样式/主题 token，使用真实 TikTok 帖子 `7698442056158465294`；localhost 动态端口 56406，ego-browser 真实 Chromium 1728×883。
- 弹窗渲染 TikTok 官方播放器（iframe 300×534；content 高度按生产 dialog 的 62px header + 20px 间距扣 82px，并受 80vh dialog 上限约束；9:16 比例生效，TikTok 官方播放器控制条在首屏可见，真实 player/v1 非 ratelimit），播放器画面可见；静态封面 img 不再渲染；无控制台错误。
- X 帖子同一弹窗使用整卡模式（`.is-card`，558×534，geometry 由共享 CSS 变量统一；下部操作可在 iframe 内滚动）；标题本地化为「Higgsfield AI · 推特 (X)」。
- 截图：`browser-tiktok-embed-3462.png`、`browser-x-embed-3462.png`；事实：`browser-facts.json`。
- URL 解析已加 http(s) + 平台 host allowlist；错误 host / `javascript:` 返回 null 回退封面；id 经 encodeURIComponent。

## 离线检查

| 检查 | 实际结果 |
| --- | --- |
| 插件核心套件 | 1674 项，1674 通过，0 失败，0 skip，0 外连 |
| `verify-stage-contracts` | PASS（14 Stage / 8 sidebar） |
| `verify-anti-slop` | 3/3 通过 |
| `scan-ui-gates` | 退出 1；与 main 同为 8 条既有违规（其它插件），inspiration 0 条 |
| `build-client` | 成功，`lib/client.js` 2,405,882 bytes（gitignored） |

## 边界

详情弹窗由静态封面升级为平台官方嵌入播放器；Host 数据/接口、时间线与其它 tab 不变。嵌入内容来自各平台官方域，需网络；无 embed 时回退封面。
