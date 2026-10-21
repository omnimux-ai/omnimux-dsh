---
status: active
issue: 3486
base: 7fa369822d068b028fad621af8fe5773f111194f
---

# 3486 账号监控时间线参考 X 官方布局

## 用户旅程

打开账号监控，右侧帖子流应像 X 官方：内容列居中、单列阅读宽度、帖子之间用分隔线；图片/视频保持原始比例，不在宽屏里被拉成宽幅或裁切。滚动、点击打开详情、加载更多不变。

## 实现

- `.omnimux-rival-timeline`：`width: min(100%, 620px); margin: 0 auto;`，X 式单列。
- `.omnimux-rival-timeline-item`：去掉整块圆角卡片/底色，改为上下 padding + 底部 1px 分隔线；hover/focus 仅轻微底色；保留头像+正文 flex。
- 媒体：
  - 容器 `display:flex; justify-content:center; background:#000; overflow:hidden; max-height:510px;`
  - `img, video`：`width:auto; max-width:100%; height:auto; max-height:510px; object-fit:contain;`，竖屏不再被拉宽/裁切，横屏按比例。
  - 占位卡 `max-width: 320px; margin:0 auto; aspect-ratio:9/16`，不撑满。
- `<720px`：时间线占满可用宽度，媒体 `max-width:100%`，操作栏换行。
- 账号左栏、详情弹窗、数据/请求不变。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | 1728 宽屏 | 时间线约 620px 居中，两侧留白，不是整屏宽卡片 |
| A2 | TikTok 竖屏视频 | 按 9:16 原始比例显示，不拉宽/不裁切 |
| A3 | X 横屏图片/视频 | 按横屏比例显示，不变形 |
| A4 | 帖子结构 | 分隔线式单列，头像/作者/正文/媒体/指标/操作顺序不变 |
| A5 | 点击/滚动/加载更多 | 行为不变 |
| A6 | 窄屏 | 内容占满可用宽度，媒体不溢出 |

## 验证

真实浏览器 1728×883 与 390×844 截图、媒体几何断言（宽高比、居中、不溢出）；插件核心套件；stage contracts、anti-slop、scan-ui-gates。
