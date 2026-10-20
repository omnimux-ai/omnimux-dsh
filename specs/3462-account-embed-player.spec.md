---
status: active
issue: 3462
base: eba15edf98da095316d314f4e51ad01907ade030
---

# 3462 账号监控全平台嵌入式播放器

## 问题

TikTok 等平台的帖子在账号监控只显示封面，视频/图文不能播放；HEIC 封面在 Chromium 也无法显示。

## 方案

- `rival-embed.js`：`rivalEmbedUrl(card)` 从 `url`（回退 `id`）解析：
  - TikTok `/video/{id}`、`/photo/{id}`、`share_item_id` → `https://www.tiktok.com/player/v1/{id}`
  - X `/status/{id}` → `https://platform.twitter.com/embed/Tweet.html?id={id}`
  - YouTube `watch?v=`、`youtu.be/`、`/shorts/`、`/embed/` → `https://www.youtube.com/embed/{id}?rel=0`
  - Instagram `/p|reel|tv/{code}` → `https://www.instagram.com/{kind}/{code}/embed/`
  - 解析失败返回 `null`。
- `RivalPostPreviewModal`：embed 存在时渲染 iframe（懒加载、允许 encrypted-media/pip/fullscreen、不自动播放、allowFullScreen、referrerPolicy、title）；TikTok/YouTube 按帖子比例，X/Instagram 使用整卡高度；不存在则回退封面。
- 时间线媒体播放标记改为可点击按钮：点击打开详情（播放器），不内联加载 iframe。
- 原帖跳转/复刻/关闭保持不变。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | TikTok | 详情渲染 `tiktok.com/player/v1/{id}` 官方播放器，控制条可见 |
| A2 | X | `platform.twitter.com/embed/Tweet.html?id={id}` |
| A3 | YouTube/Instagram | 对应 embed URL；iframe 属性齐全；X/IG 整卡高度不被媒体 ratio 裁切 |
| A4 | 无 URL/未知平台 | 回退封面，无空 iframe |
| A5 | 时间线 | 播放按钮/行点击打开详情；无内联 iframe |
| A6 | 原帖/复刻/关闭 | 不变 |

## 验证

插件核心套件、embed 纯函数单测、详情渲染测试（iframe src/属性/回退）、真实 Dev 打开 TikTok + X 帖子验证播放器加载并截图、`verify-stage-contracts`、`verify-anti-slop`、`scan-ui-gates`、`impact-matrix`。

## 文档影响

详情弹窗由静态封面升级为官方嵌入播放器；Host 数据/接口不变。
