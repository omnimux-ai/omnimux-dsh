# Issue #4001 · X Article 长文海报分页：浏览器验收证据

- 时间：2026-11-08 10:27–10:35（Asia/Taipei）
- 运行方式：`scripts/lib/extension-e2e.mjs` 启动 Chrome for Testing（一次进程、临时 profile、运行后清理），加载本工作树 `plugins/omnimux-browser/extension/dist`。
- 页面：本地 X 结构 fixture，`http://x.com:<port>` 通过 `--host-resolver-rules` 映射到本机；文章正文 95 段 / 正文 9,257 字（含标题与段间分隔共 9,469 字符），取自 2026-11-08 线上 `https://x.com/lifesinger/status/2118936739654046143`。
- 扩展构建：`node scripts/build.mjs`（工作树 `browser-x-poster-pagination`）。

## 结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 长文章生成分页 | PASS：4 页 | `report.json` |
| 每页尺寸 | PASS：1920×2560（3:4） | `poster-page-1.png` … `poster-page-4.png` |
| 全文完整 | PASS：第 4 页包含文章最后一句，无省略号截断；`twitter-poster.article-completeness.spec.ts` 对同一 fixture 断言 4 页所有绘制正文行拼接等于源文本 | `poster-page-4.png`、`report.json` |
| 发帖页附图 | PASS：file input 收到 4 个文件，名称 `omnimux-poster-1.png` … `-4.png` | `report.json` `compose` |
| 模态入口 | PASS：长文说明显示「长文会自动拆成多页」 | `modal.png` |
| 临时 profile 清理 | PASS：`profileRemoved` 未记录失败 | `report.json` |

## 边界

1. 使用本地 X 结构 fixture，不是登录态真实 x.com；真实 X DOM 改版与真实上传由 Dev 人工验收覆盖。
2. 本地模型不可用，观点生成为空，因此只验证海报分页与附图；观点链路沿用既有单测。
3. 未新增 manifest 主机权限，未自动发布。
