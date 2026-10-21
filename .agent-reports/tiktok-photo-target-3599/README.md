# For You 图文作品取目标实测（Issue #3599）

- 时间：2026-10-21
- 环境：Chrome for Testing（chromium-1234，headless）+ 本工作树构建产物 `plugins/omnimux-browser/extension/dist`
- 页面：真实 `https://www.tiktok.com/` origin + 与实测一致的**图文卡**夹具（无 `<video>`、多张图片、带 `data-more-menu-item-id="7693330722479688973"`，即真实图文作品 id）
- 运行器：`scripts/lib/extension-e2e.mjs`（单浏览器、临时 profile、自动清理）

## 结果（`report.json`）

| 时刻 | 菜单状态 |
| --- | --- |
| 点击前 | 下载视频 / 下载音频 / 收藏到灵感库（默认态） |
| 点击「下载音频」后 | 该行 `下载音频 提取音轨中`（busy）——说明目标已解析并交给宿主 |
| 约 8 秒后 | 三行恢复默认（#3589 的静默完成）；detail 为空 |
| 下载 | `downloadedFiles` 记录真实落盘的 `.m4a`（来自该图文作品）；`resolutionProven=true`（下载或“已到宿主”二选一，noTarget 不算通过）；脚本在记录后自行删除该文件（`downloadsCleaned=true`） |
| 关键断言 | `noTargetStillShown=false`、`settledIsNotNoTarget=true`——不再出现「这一页没有可操作的作品」 |

截图：`01-photo-card-menu.png`、`02-photo-card-after-click.png`、`03-photo-card-settled.png`。
