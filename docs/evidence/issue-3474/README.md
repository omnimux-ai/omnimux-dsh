# Issue #3474 · 海报入口改为互动栏图标：浏览器验收证据

- 运行日期：2026-10-21 09:48（Asia/Taipei）
- 方式：Chromium 154（`ego lite` 二进制）`--load-extension` 加载本工作树 `dist`，CDP 驱动；HTTPS fixture 以 `--host-resolver-rules=MAP x.com 127.0.0.1:<port>` + `--no-proxy-server` 映射为 `https://x.com`。
- 源码：worktree `browser-x-poster-icon-issue-3474`，base `origin/main`；运行前重新构建。

## 验收项

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 入口在 X 原生互动栏内 | PASS（`entryInActionBar`） | `report.json` |
| 入口紧邻书签图标左侧 | PASS（`entryBeforeBookmark`） | `01-trigger.png` |
| 入口为纯图标、无可视文字 | PASS（`entryText === ''`） | `01-trigger.png` |
| 颜色为品牌标记色 | PASS（`rgb(184, 183, 255)` = `#b8b7ff`） | `01-trigger.png` |
| 点击仍打开主题模态 | PASS | `02-modal.png` |
| 跳转发帖页自动附图 | PASS | `04-compose.png` |
| seed 预填观点 | PASS | `05-prefill.png` |
| 完成后清理 | PASS | `report.json` |

## 边界

1. fixture 结构验证；真实 x.com DOM、上传与模型在线生成仍由 Dev 人工验收。
2. 颜色使用扩展已放行的品牌标记色 `#b8b7ff`（`content/surfaces/media-trigger.ts` 为唯一 owner）；`tests/no-purple-theme.spec.ts` 禁止引入 #7961f2 等紫色字面量，因此没有新增紫色源码。
3. 图标带 1px 暗色 drop-shadow 晕边，改善白底 X 主题下的可辨性。
