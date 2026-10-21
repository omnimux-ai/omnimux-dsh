---
status: active
issue: 3469
base: 4d9c5a1323c6a1487486e5be10a0220de4893218
---

# 3469 账号监控 TikTok HEIC 封面只剩文本

## 问题

TikTok 封面 URL 为 HEIC（`...heic` 或 `~tplv-...heic`），Chromium `<img>` 无法解码；`onError` 后 `.omnimux-rival-timeline-media` 整块不渲染，时间线只剩文本。

## 方案

- Host `toFeedRow` 新增 `video_src`：来自既有 `post.video_url`，只透传 http(s) 安全 URL（`feedVideoSrc`），不新增采集/下载。
- `rival-filter.toRivalCardRow` 白名单带 `video_src`。
- `RivalTimelineRow`：
  - 判断封面为 HEIC（pathname 以 `.heic` 结尾）；
  - HEIC + video_src → `<video class="omnimux-rival-timeline-video" src={video_src + '#t=0.1'} muted playsInline preload="metadata">` 显示首帧，叠播放按钮，点击打开详情；
  - video 加载失败 → 显示平台占位卡（平台图标 + 视频标记 + 「视频」），不再空白；
  - 非 HEIC 封面 `<img>` 行为不变；
  - 时间线不内联自动播放，仍点击打开详情 embed。
- 无 video_src 的 HEIC 帖显示占位卡；图文帖同样占位，不显示空白。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | TikTok HEIC 视频 | 时间线显示视频首帧卡片 + 播放标记，不是纯文本 |
| A2 | 点击卡片 | 打开详情官方 embed 播放器 |
| A3 | X/JPG 封面 | 仍渲染 `<img>` |
| A4 | video 加载失败/无 video_src | 显示平台占位卡，不空白 |
| A5 | 图文/文本帖 | 不出现空媒体框；占位有平台标识 |

## 验证

插件核心套件、feed `video_src` 白名单单测、时间线 HEIC 渲染/占位单测、page e2e、真实浏览器 HEIC 视频时间线截图；verify-stage-contracts、anti-slop、scan-ui-gates。
