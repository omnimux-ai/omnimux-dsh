# TikTok 共存定位实测（Issue #3583）

- 时间：2026-10-21
- 环境：Chrome for Testing（`chromium-1234`，headless）+ 本工作树构建产物 `plugins/omnimux-browser/extension/dist`
- 页面：真实 `https://www.tiktok.com/` origin。未登录的 TikTok 不渲染主页视频弹窗，因此 DOM 用与 ego 实测一致的几何夹具（`#arrow-left` 40×40 @ (1150,400)、评论面板左缘 x=1200、全局 `#app-header` 工具条）；被测对象是构建后的 content script 本身。
- 运行器：`scripts/lib/extension-e2e.mjs`（一次运行一个浏览器进程、临时 profile、自动清理）。

## 结果（`report.json`）

| 场景 | 结果 |
| --- | --- |
| browse-modal-coexist | 触发器 (1146,292) 48×48；对手 (1148,348) 44×44；间距 8px、重叠面积 0；对手 inline style 原样未改 |
| feed-coexist | 触发器 (1108,544)；对手 (1100,600) 64×64；间距 8px、重叠 0；对手样式未改 |
| header-only-fallback | 只有右上角 `DivActionBarContainer` 时触发器落到左下角 (12,764)，不再跑到视口外 |
| 菜单 | 打开后命中测试命中的是 scene host 本身，host 位于 `documentElement` 最后一位、z-index 2147483647 |

截图：`01-browse-modal-coexist.png`、`02-feed-coexist.png`、`03-header-only-fallback.png`。
