# #3486 账号监控时间线 X 式布局 · 交付证据

- Issue：#3486；基线 `7fa369822d068b028fad621af8fe5773f111194f`
- 工作树：`.worktrees/rival-x-layout-issue-3486`

## 改动

- 时间线 `width: min(100%, 620px); margin: 0 auto`，宽屏居中，X 式单列阅读宽度。
- 帖子去掉整块圆角卡片/外框，改为 padding + 底部分隔线；hover/focus 轻底色。
- 媒体容器 `max-height:510px`、`display:flex; justify-content:center`；图片/视频 `width:auto; max-width:100%; max-height:510px; object-fit:contain`，竖屏不再被拉宽或裁切，横屏保持 16:9。
- 占位卡宽度上限 320、居中；窄屏媒体自适应。
- 账号左栏、详情弹窗、数据/请求不变。

## 真实浏览器证据

- 真实 `RivalTimeline` + 注入样式，ego-browser 1728×883，localhost 端口 59130。
- 组件页：时间线 620 居中；竖屏视频元素 287×508（原始 360×640，比例 0.565≈9:16），媒体框 289×510 紧贴视频；横屏图片 534×300（1.778≈16:9），媒体框 536×302。
- **真实两栏 Dev 页面**（1728/1440/390，注入最终 CSS 做合并前预演）：
  - 1728：内容区 565..1701，时间线 left=822、width=620，严格在内容区居中；媒体框 289×510；scrollWidth=1728 无横向溢出。
  - 1440：时间线 width=620，内容区 565..1413 居中；媒体框 289×510；scrollWidth=1440。
  - 390：时间线 left=20、width=342（占满可用宽度），视频 256×455（0.563），媒体框 258×457；scrollWidth=390 无横向溢出。
- 截图：`browser-x-layout-1728-3486.png`、`dev-real-1728-3486.png`、`dev-real-1440-3486.png`、`dev-real-390-3486.png`；事实：`browser-facts.json`。

## 离线检查

| 检查 | 结果 |
| --- | --- |
| 插件核心套件 | 1719 / 1719 通过，0 fail，0 skip，0 外连 |
| `verify-stage-contracts` | PASS（14 Stage / 8 sidebar） |
| `verify-anti-slop` | 3/3 |
| `scan-ui-gates` | 与 main 同为 7 条既有违规（其它插件），inspiration 0 |
| `build-client` | 成功，2,425,148 bytes |

## 边界

本次只改时间线列宽/帖子分隔/媒体比例；账号左栏、详情弹窗、请求与数据不变。窄屏由 width:min(100%,620px) 自适应，媒体 max-width:100% 不溢出。
