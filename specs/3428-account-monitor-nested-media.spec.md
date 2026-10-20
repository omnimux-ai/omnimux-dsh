---
status: active
issue: 3428
base: 01647e1c5539d7e014e1260eadf6798da6c0b657
---

# 3428 账号监控：消费嵌套媒体/统计字段 + 无封面卡占位

## 目标与用户旅程

Issue #3428。用户在「灵感社区 → 账号监控」看到的作品卡，媒体与播放量都为空：TikTok 卡是 9:16 黑板、播放量显示 `-1`、描述为空的帖子标题退化成一个 tiktok.com 链接；X 账号的视频帖全部显示成纯文字卡。

旅程：

1. 用户打开账号监控，缓存里已有作品（或导入账号后首采完成）。
2. 卡片应按作品真实媒体渲染：`<img>` 使用云端封面地址；播放/点赞等显示云端统计；有增速信号时显示胶囊。
3. 没有封面的作品（例如云端未提供封面或媒体不可得）显示明确的占位（平台标记 + 「无封面」），而不是一块黑色空图；播放量未知时显示 `--`，不出现 `-1`。
4. 详情弹窗、加入会话、复刻仍从同一行取媒体地址，不新增第二套取值。

## 根因（已核实）

- 云端 `omnimux_social_data` 返回 TikHub 原始结构，作品行媒体嵌在 `video.cover.url_list`、`video.play_addr.url_list`、`video.duration`、`image_post_info.images[]`、`statistics.*`、X 的 `media`/`extended_entities.media` 中。
- `src/rival/rival-parsers.js` 只用 `POST_FIELD_CANDIDATES` 探顶层扁平键：`cover_url`、`video_url`、`duration`、`images` 与统计全部未命中，作品以空媒体入库（`field_probe` 可证）。
- 客户端 `rivalCardTypeOf` 对 TikTok 固定返回 `short-video`，`RivalPostCard` 不判断空封面，直接渲染无 `src` 的 `<img>`；`feedViews` 用 `-1` 表示未知，被格式化成「播放 -1」。

## 最小实现合同

- 解析器为作品行增加**单层嵌套白名单**取值，只在扁平候选为空时回填，命中来源写回 `field_probe`；不做递归搜索，不改变已命中扁平字段的优先级与其他平台行为：
  - 封面：`video.cover / origin_cover / dynamic_cover` 的 `url_list[0]`、`video.poster`；`image_post_info.images[].display_image.url_list[0]` / `thumbnail.url_list[0]`；X `media` / `extended_entities.media` / `entities.media` 的 `media_url_https` / `media_url` / `display_url` / `preview_image_url`；`media[].preview_image_url`。
  - 视频：`video.play_addr` / `playAddr` / `download_addr` 的 `url_list[0]`；X `media[].video_info.variants[]` 与 `media.video[].variants[]` 的最高 mp4。
  - 时长：`video.duration`（毫秒 → 秒）。
  - 比例：`video.width / video.height`；X `media[].original_info`。
  - 图片列表：`image_post_info.images[]`、X 图片 media。
  - 统计：`statistics.play_count / digg_count / comment_count / share_count / collect_count`。
  - 类型：仍由 `pickPostType` 依据媒体是否存在推导，不把 `aweme_type` 数字当类型。
- 客户端 `RivalPostCard`：媒体类卡片无封面时不渲染 `<img>`，渲染占位（复用 `noCover` 文案 + 平台标记，保留 `--rival-media-ratio` 占位高度与既有 `omnimux-rival-card-media` 类）；播放量未知显示 `--`。
- `src/rival/rival-feed.js` 的 `feedViews` 排序哨兵不变；只修展示层，不动排序/增速契约。
- 允许改动：`plugins/omnimux-inspiration/src/rival/{constants,rival-parsers}.js`、`plugins/omnimux-inspiration/src/client/{RivalPostCard.jsx,rival-styles.js}`、对应测试与本 spec。不改 Hub、云端模型/分组、预算、调度、凭据、账号身份、灵感库卡片与发布能力。

## 验收用例

| # | 用例 | 期望 |
|---|---|---|
| A1 | TikTok aweme 行含 `video.cover.url_list`、`video.play_addr.url_list`、`video.duration=15000`、`statistics.*` | `cover_url`/`video_url` 为对应 URL，`duration=15`，`stats.views/likes/comments/shares` 为统计值，`type='video'`；`field_probe` 记录嵌套来源 |
| A2 | TikTok 图集行含 `image_post_info.images[].display_image.url_list` | `images` 与 `cover_url` 取首图，`type='image'` |
| A3 | X 行含 `media[].media_url_https` 与 `video_info.variants[]` mp4 | 封面取图片、`video_url` 取 mp4，`type='video'`；只有图片时为 `image` |
| A4 | 扁平字段与嵌套字段并存 | 扁平字段优先（既有测试不回归） |
| A5 | 无 `video`/`media`/`statistics` 的行 | 行为与改动前完全一致（`cover_url=''`、`stats` 全 null） |
| B1 | 媒体卡无封面 | 渲染 `.omnimux-rival-card-media` 占位，含「无封面」与平台标记，不出现 `<img>` |
| B2 | 媒体卡有封面 | 渲染 `<img src=cover>` |
| B3 | `stats.views = -1`（未知） | 悬停层显示「播放 --」，不出现 `-1` |
| B4 | `text` 卡不受影响 | 无媒体区、无占位 |

## 验证

- 单测：`node --import plugins/omnimux-inspiration/scripts/deny-network.mjs --test plugins/omnimux-inspiration/src/rival/*.test.js plugins/omnimux-inspiration/src/client/*.test.js plugins/omnimux-inspiration/src/client/*.e2e.test.js`（先红后绿）。
- 静态：`pnpm verify:stages`；`node --test scripts/verify-anti-slop.test.mjs`；`node scripts/impact-matrix.mjs --git-diff --base origin/main`。
- 隔离工作树真实浏览器：`pnpm test:worktree-web` 或 ego-browser，在动态端口渲染账号监控作品流，断言（1）封面可见、（2）无封面卡占位、（3）播放量非 `-1`，保留截图/结构化报告。
- 真实采集：用户已授权重新采集 5 个账号验证封面与播放量；只使用既有云端社媒能力与用户凭据，不新增采集器。

## 新用户基线

新用户安装登录后，导入公开账号 → 首采两次调用 → 缓存作品按上述映射渲染；缺凭据/额度/渠道时保持现有明确错误（`needs-omnimux` / `quota-exceeded` / 人话失败文案），不引入开发机专用端口、代理或模型别名。没有封面数据时展示占位而不是黑块。

## 文档影响

内部数据映射与卡片兜底行为，不新增用户入口或宣传；只更新本 spec 与必要的既有注释，不改合同、README 或模型接口文档。
