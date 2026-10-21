# #3469 TikTok HEIC 封面视频预览 · 交付证据

- Issue：#3469；基线 `4d9c5a1323c6a1487486e5be10a0220de4893218`
- 工作树：`.worktrees/tiktok-heic-preview-issue-3469`

## 根因

TikTok 封面 URL 为 HEIC（`...~tplv-...heic`），Chromium `<img>` 无法解码；`onError` 后媒体区被隐藏，时间线只剩文本。X 的 JPG 封面不受影响。

## 改动

- Host feed 行新增 `video_src`：来自既有 `post.video_url`，只透传 http(s)，不新增采集/下载。
- 客户端卡片白名单带 `video_src`。
- `RivalTimelineRow`：HEIC 封面且有 `video_src` 的视频帖，用静音 `<video muted playsInline preload="metadata" src="...#t=0.1">` 显示首帧 + 播放按钮；点击仍打开详情 embed。
- 无 `video_src`/video 加载失败：显示平台图标 + 「视频」占位卡，不再空白；非 HEIC 封面 `<img>` 行为不变。
- 文本/图文帖不会出现空媒体框。

## 真实浏览器证据

- 真实 `RivalTimelineRow` + 注入样式，HEIC 封面 URL + 本地 360×640 视频，ego-browser 1728×883，localhost 端口 62060。
- video readyState=4、videoWidth=360、videoHeight=640；src 带 `#t=0.1`；muted、preload=metadata；HEIC `<img>` 未渲染；无 video_src 的第二行显示占位卡。
- 截图：`browser-heic-video-preview-3469.png`；事实：`browser-facts.json`。

## 离线检查

| 检查 | 结果 |
| --- | --- |
| 插件核心套件 | 1700 / 1700 通过，0 fail，0 skip，0 外连 |
| `verify-stage-contracts` | PASS（14 Stage / 8 sidebar） |
| `verify-anti-slop` | 3/3 |
| `scan-ui-gates` | 与 main 同为 7 条既有违规（其它插件），inspiration 0 |
| `build-client` | 成功，2,427,799 bytes |

## 边界

- 时间线用静音首帧预览，不内联自动播放；点击仍打开官方 embed。
- 现有 HEIC 数据无需重新采集，`video_src` 来自已存 `video_url`；若某条旧记录没有 `video_url`，显示占位卡。
- 图文 HEIC 帖无视频时显示「图文」占位。
