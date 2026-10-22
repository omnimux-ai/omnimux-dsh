# TikTok 菜单进行中只保留 spinner 实测（Issue #3606）

- 时间：2026-10-22
- 环境：Chrome for Testing（chromium-1234，headless）+ 本工作树构建产物
- 页面：真实 `https://www.tiktok.com/` origin + 视频卡夹具（`data-more-menu-item-id` 指向真实作品）
- 运行器：`scripts/lib/extension-e2e.mjs`（单浏览器、临时 profile、自动清理）

## 结果（`report.json`）

| 时刻 | 观察 |
| --- | --- |
| 点击前 | 三行：下载视频 / 下载音频 / 收藏到灵感库 |
| 点击「下载音频」后 | 该行 `busy=true`、图标位是 `.omx-spinner`、文本仍只有「下载音频」、`aria-busy="true"`；三行都不存在 `.omx-item-state` 节点（`runningHasSpinnerOnly=true`、`noStateNodeAnywhere=true`） |
| 约 9 秒后 | 回到默认（进行中无任何状态文案） |
| 下载 | 真实落盘一个 `.m4a`，脚本记录文件名后自行删除（`downloadsCleaned=true`） |

截图：`01-menu-default.png`、`02-menu-running-spinner.png`、`03-menu-settled.png`。
