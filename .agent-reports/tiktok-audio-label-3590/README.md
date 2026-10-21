# TikTok 菜单第二项改名实测（Issue #3590）

- 时间：2026-10-21
- 环境：Chrome for Testing（chromium-1234，headless）+ 本工作树构建产物
- 页面：真实 `https://www.tiktok.com/` origin + 弹窗夹具；通过 `omnimux_manual_locale` 分别验证 zh / en 两套文案。
- 运行器：`scripts/lib/extension-e2e.mjs`（单浏览器、临时 profile、自动清理）。

## 结果（`report.json`）

| locale | 三项文案 | 截图 |
| --- | --- | --- |
| zh | 下载视频 / **下载音频** / 收藏到灵感库 | `menu-zh.png` |
| en | Download video / **Download audio** / Save to library | `menu-en.png` |

`zhOk=true`、`enOk=true`、`audioActionKept=true`（第二项仍是 `data-action="audio"`）。
