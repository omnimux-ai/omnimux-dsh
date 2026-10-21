---
status: active
issue: 3542
base: f02a22135
---

# 3542 账号监控时间线直接内嵌平台官方帖子

## 用户操作旅程

1. 打开「灵感社区 → 账号监控」，选中一个或多个账号，右栏显示帖子时间线。
2. 滚动时间线：帖子行不再停在我们自绘的近似卡片上，而是直接显示该帖的官方内容——X/Instagram 是平台自己的帖子卡片（作者、正文、图片/视频、引用帖、互动数），TikTok/YouTube 是平台自己的播放器。
3. 点击卡片里的视频：在行内直接播放，不再打开「作品详情」弹窗。
4. 继续滚动：还没接近视口的行不发起第三方嵌入请求；滚动到附近才挂载，行的高度与内容随官方卡片自适应。
5. 网络不可用、脚本被拦截、帖子已删除，或平台没有官方嵌入（抖音/小红书）：该行自动回退成现有卡片，内容与操作仍完整，不出现空白。
6. 每行底部仍是我们自己的指标与操作：原帖直达 / 立即复刻 / AI 拆解 / 标为已处理；「已处理」状态、行点击打开详情、键盘可达性不回归。

## 期望界面反馈

- X：深色主题的官方卡片（与 App 暗色一致），宽度不超过时间线单列（≤550px，居中），高度随正文/媒体/引用帖增长；媒体点击在卡片内播放。
- Instagram：官方 `/embed/` 卡片，宽度同上；视频点击在卡片内播放。
- TikTok：官方播放器按帖子原始比例（竖屏 9:16），高度不超过现有媒体上限 510px，可播放。
- YouTube：官方播放器 16:9，宽度铺满内容列，可播放。
- 加载中：仍显示现有卡片，不插入空白占位，不阻塞滚动。
- 失败/无嵌入：现有卡片与操作栏原样保留；不出现半截 iframe、不出现重复内容。
- 嵌入就绪后，X/Instagram 行隐藏自绘的头像、正文与媒体（官方卡片已包含），只保留底部指标与操作；TikTok/YouTube 行保留我们的作者/正文，仅把媒体换成官方播放器。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | X 帖子行滚入视口附近 | 出现 `platform.twitter.com` 官方卡片 iframe；`data-theme=dark` 时卡片为深色；自绘正文/媒体隐藏 |
| A2 | 点击 X 卡片内的视频 | 在卡片 iframe 内播放，不打开「作品详情」弹窗 |
| A3 | TikTok/YouTube 行 | 出现对应官方播放器 iframe，尺寸符合 ratio/16:9，可播放 |
| A4 | Instagram 行 | 出现 `instagram.com/.../embed/` 官方卡片 iframe |
| A5 | 脚本失败/超时/帖不可用/抖音/小红书 | 行内保留现有卡片与四个操作，无空白 iframe |
| A6 | 懒加载 | 视口外 600px 以上的行不创建 iframe、不注入第三方脚本 |
| A7 | 操作栏 | 原帖直达/立即复刻/AI 拆解/标为已处理均可用；已处理行仍变暗 |
| A8 | 行点击/键盘 | 未嵌入成功的行仍可点击/回车打开作品详情；已嵌入行点击平台播放器不打开详情 |
| A9 | 深色/浅色主题 | 深色为默认；`data-theme=light` 时 X 卡片传 light |
| A10 | 窄屏 | 嵌入宽度不溢出，播放器不撑破时间线 |

## 实现

- `rival-embed.js` 增加 `rivalEmbedTarget(card)`：返回 `{ platform, kind: 'card' | 'player', id, url }`，复用现有 URL 白名单与 id 解析；`rivalEmbedUrl/rivalEmbedIsCard/rivalEmbedAspectRatio` 行为不变。
- 新增 `rival-timeline-embed.jsx`：
  - `loadTwitterWidgets()` 单例注入 `https://platform.twitter.com/widgets.js`；`twttr.ready` 后 `createTweet(id, host, { theme, dnt: true, lang, conversation: 'none', align: 'center' })`。
  - Instagram/TikTok/YouTube 用官方 iframe（`instagram.com/.../embed/`、`tiktok.com/player/v1/<id>`、`youtube.com/embed/<id>`），`loading="lazy"`、`allow="encrypted-media; picture-in-picture; fullscreen"`。
  - 10 秒超时、脚本 error、`createTweet` 空结果 → `failed`，行回退现有卡片。
  - 主题取 `documentElement[data-theme]`；语言取 `rivalLocaleOf(t)` 映射 X 的 `lang`。
  - Instagram 卡片高度按宿主宽度与帖子 `ratio` 估算，随 `ResizeObserver` 重算，避免内部滚动。
- `RivalTimelineRow.jsx`：
  - 用 `IntersectionObserver`（`rootMargin: '600px 0px'`）懒挂载；无 `IntersectionObserver` 的环境（jsdom/旧内核）保持现有卡片、不加载任何第三方脚本。
  - `card` 平台在嵌入就绪后隐藏自绘头像/正文/媒体；`player` 平台只替换媒体区；两者都保留 footer。
  - 失败保持现状；未就绪不遮挡现有内容。
  - 点击落在嵌入区域（含 iframe 元素本身）不打开「作品详情」，避免平台播放器点击被行级点击劫持；点击作者区/空白区仍打开详情。
  - `data-embed-kind` / `data-embed-mounted` 暴露只读状态，供 e2e 断言懒挂载。
- `rival-styles.js`：嵌入容器、卡片/播放器尺寸、隐藏态样式；不引入新的裸色值。
- 不新增 Host 接口、不改抓取与数据结构；嵌入纯展示，不写回灵感库或分析结果。

## 假设

平台官方嵌入在渲染进程内可直连（`platform.twitter.com` / `instagram.com` / `www.tiktok.com` / `www.youtube.com`），且这些域名不需要用户登录即可渲染公开帖子；X `createTweet` 能自适应容器高度并支持 `theme: dark`；账号监控行的 `source_url` 或 `post_id` 足以解析出官方嵌入 id；懒挂载与失败回退不会改变现有排序、分页与操作语义。

## 证伪方式

若隔离 worktree 的真实浏览器中官方嵌入连续空白、被 CSP/网络拦截，或 X `createTweet` 10 秒内无法产出可见元素，则记录截图、控制台与网络错误，并把该平台退回现有卡片（播放器内嵌仍可保留）；若官方卡片高度不可控导致时间线塌陷或重复内容，则改为「仅替换媒体区」的局部内嵌并重新截图确认。

## 验证

- 单测：`rival-embed-target.test.js`（目标解析/回退）、`rival-timeline-embed-loader.test.js`（X 单例加载/缓存失败、主题/语言、各平台 iframe、iframe load/error 回退、Instagram 高度）。
- 真实浏览器：隔离 worktree 内以真实网络加载一条 X 帖与一条 TikTok 帖，断言 iframe 存在、X 卡片高度 > 0、视口外行无 iframe；保留 PNG 与结构化报告到 `docs/evidence/3542/`。
- e2e：`rival-cards.e2e.test.js` 增加懒挂载、X 失败回退、主题/语言切换不叠卡、嵌入区点击守卫 4 项。
- 仓库检查：`pnpm --filter omnimux-inspiration test`、`node scripts/scan-ui-gates.mjs`、`node scripts/verify-stage-contracts.mjs`（如触及 stage）。
