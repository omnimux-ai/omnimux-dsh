# 浏览器媒体胶囊「复制」改造为「下载」：X 视频真实直链 + 图片/视频下载（Issue #3581）

## 用户旅程与目标

用户在 X（Twitter）帖子页悬停一条视频，胶囊上原来的「复制 / 复制素材链接」动作变成「下载 / 下载素材」。点一次，浏览器直接把这个视频的真实 mp4 文件下载到默认下载目录（最高可用画质），而不是把封面图 `pbs.twimg.com/amplify_video_thumb/...jpg` 复制或下载下来。悬停图片时同一个动作下载原图。视频没有可用直链时，胶囊明确说「该视频仅在页面内可播」并停手，不拿封面图冒充视频。

目标：把「复制素材链接」这一个动作整体改造为「下载」，并让「嗅探到的素材地址」对图片和视频都成立——视频地址来自页面的真实播放源，而不是 poster。

## 范围

### 改造（替换）
- 胶囊第二动作 `copy` → `download`：`MediaActionKind`、`RUNTIME_MESSAGE`、`HoverCopy`（hint/done/failed/unusable）、tooltip、图标、无障碍名称全部按「下载」重写；成功文案「已开始下载 / Download started」，失败保持单一失败文案。
- 图片下载走原地址（`pbs.twimg.com/media/...` 等直链）；视频下载走真实视频源。

### 新增
- 视频真实源解析（内容脚本，纯函数 + 可注入数据）：
  - X：`<video>.poster` 的 `amplify_video_thumb/<mediaId>` / `ext_tw_video_thumb/<mediaId>` 提取媒体 id；从所在 `article` 的 `/status/<tweetId>` 链接提取推文 id；后台调用 `cdn.syndication.twimg.com/tweet-result` 拿 `mediaDetails[].video_info.variants`，用 `media_url_https === poster` 精确匹配悬停的那条，选最高码率 `video/mp4`，没有 mp4 时回退 `application/x-mpegURL`。
  - 通用站点：`<video>` 自身 http(s) `src`/`<source>`、`meta[property="og:video:secure_url"|"og:video:url"|"og:video"]`、`twitter:player:stream`，再回退 `performance` 资源里同源的 `.mp4` / `.m3u8`。
  - 纯 HLS（只有 m3u8、没有 mp4）判为「不可直接下载」，回退到页面引用提示，不下载播放列表文本。
- 扩展后台下载通道：`mediaDownload` 消息 → `chrome.downloads.download`；`manifest.json` / `manifest.firefox.json` 增加 `downloads` 权限；文件名可测地生成（X 用 `x-<tweetId>-<WxH>.mp4`，图片用原文件名，通用视频用 URL 基名），非法字符清洗、重名 uniquify。
- 后台 X 变体查询通道：`xVideoVariants` 消息（含 60s 内存缓存），CORS 只放行 `platform.twitter.com` 的端点因此只能由后台发起。

### 保留
- 悬停高亮、胶囊定位、图片第一动作「加入资产库」、视频第一动作「加入灵感库」、「加入对话」、素材嗅探栏、工作台/侧边栏投递全部不改语义。
- `HoveredMedia.src` 仍保留 poster（预览、缩略图、灵感库封面语义不变），下载只额外解析真实源；不改变既有 payload 契约的字段含义。

## 验收用例

| ID | 场景 | 期望 |
| --- | --- | --- |
| S1 | X 视频（`x.com/UnitreeRobotics/status/2112819774573179175`）悬停胶囊 | 第二动作显示「下载素材」；点击后 `chrome.downloads` 收到 `video.twimg.com/.../vid/avc1/1920x1080/*.mp4`，落盘文件是 mp4 且可解码，不是 jpg |
| S2 | X 多视频帖 | 用悬停那条的 poster 精确匹配 `mediaDetails`，下载对应视频 |
| S3 | 普通网页图片 | 下载得到原图文件（扩展名/类型来自 URL 或 content-type） |
| S4 | 通用页面 `og:video` / `<video src=mp4>` | 下载真实 mp4；没有可用直链时提示「该视频仅在页面内可播」，不产生文件 |
| S5 | 后台失败（host 拒绝、URL 非法、download 报错） | 胶囊显示统一失败文案，不亮 done 标记 |
| S6 | 回归 | 图片「加入资产库」、视频「加入灵感库」、复制动作移除后无引用残留；单测、typecheck、build 通过 |
| S7 | 真实浏览器 | 未打包扩展在 Chrome for Testing 中加载真实 `dist`，点击下载动作后下载目录出现真实 mp4/png 文件（证据留存） |

## 假设

- X 的 `cdn.syndication.twimg.com/tweet-result` 在无 cookie 的后台请求下仍返回 `mediaDetails[].video_info.variants`，且 `media_url_https` 与 `<video>.poster` 一致；该端点只服务公开帖子，失败时解析器回退到页面资源嗅探并给出明确失败，不会下载封面图。
- `chrome.downloads.download` 在 MV3 后台以 `host_permissions: <all_urls>` 下发的直链会走浏览器自身网络栈，`video.twimg.com` 返回 `access-control-allow-origin: *`，因此不依赖页面 cookie 也能落盘。
- 用户接受「下载」替换「复制」：不再提供复制链接入口（产品决策已在 Issue #3581 确认）。

## 证伪方式

- 若真实 X 页面上解析不到 mp4 变体（syndication 返回空/结构变化），或落盘文件实际是 poster jpg、大小与封面图一致，则 S1/S2 证伪：用 ego 真机抓到的 `tweet-result.json` 与 mp4 `Range` 响应作为对照重跑解析器。
- 若 `chrome.downloads` 在未打包扩展中因权限/URL 失败，S7 证伪：查看下载目录与扩展后台报错，退回失败提示而不是假报成功。
- 若改造后任一原有胶囊动作（资产库/灵感库/加入对话）回归，S6 证伪：跑 `pnpm test`、`pnpm typecheck` 并用真实浏览器点一遍。

## 新用户基线

不依赖开发机状态：新装扩展默认带 `downloads` 权限，首次在公开 X 帖子页悬停即可下载，无需登录宿主、无需打开侧边栏；宿主未连接不影响下载。syndication 端点不可达时降级为通用嗅探并明确失败。

## 非目标

- 不下载 HLS 播放列表为伪视频、不在扩展内做 ffmpeg/muxing。
- 不改变图片「加入资产库」、视频「加入灵感库」的 host 链路与资产库契约。
- 不改素材嗅探栏的投递/附件类型（不把视频塞进对话附件）。
- 不新增下载设置面板、画质选择器、下载历史页。
- 不改宿主 `plugins/omnimux/` 与官方 DSH 源码。

## 回滚

单 PR：revert 即恢复「复制素材链接」动作、移除 `downloads` 权限与后台下载/变体通道；payload 契约未变，不需要数据迁移。

## 文档影响

- 更新 `docs/product/browser-image-assets/UI-Spec.md` 中复制动作的 action/hint/done 文案行，标注本任务把「复制」替换为「下载」。
- PRD/Prototype 中关于复制文案的基线描述补一句历史说明；不改其验收结论。
- 不新增契约文件；`plugins/omnimux-browser/AGENTS.md` 无需改（权限与下载通道属于实现细节，验证命令表不变）。
