# TikTok 快捷菜单「只保留下载中，完成即恢复默认」实测（Issue #3588）

- 时间：2026-10-21
- 环境：Chrome for Testing（chromium-1234，headless）+ 本工作树构建产物 `plugins/omnimux-browser/extension/dist`
- 页面：真实 `https://www.tiktok.com/` origin + 与该视频页实测几何一致的弹窗夹具（`[data-e2e=browse-video]`、评论面板、`#arrow-left`），被测对象是构建后的 content script。
- 运行器：`scripts/lib/extension-e2e.mjs`（一次运行一个浏览器进程、临时 profile、自动清理）。
- 说明：本轮 Dev 宿主可达，点击「下载视频」走了**真实成功路径**并真实写入了系统 Downloads（测试文件已清理）；因此能同时截到“进行中”和“成功后恢复默认”。

## 结果（`report.json`）

| 场景 | 观察 |
| --- | --- |
| `01-menu-default.png` | 三行均为默认文案：下载视频 / 保存原声 / 收藏到灵感库；detail 为空；无任何成功文案 |
| `02-menu-busy.png` | 点击后该行显示「下载视频 解析下载中」，仅此一行进入 busy |
| `03-menu-after.png` | 真实下载完成后该行**恢复默认**：无 ✓、无「已存到…」、detail 仍为空；`successReturnedToDefault=true`、`noSuccessCopy=[]` |
| 下载 | `downloadedFiles` 记录了真实落盘的 mp4（测试产物已从 ~/Downloads 清理） |

截图：`01-menu-default.png`、`02-menu-busy.png`、`03-menu-after.png`。
