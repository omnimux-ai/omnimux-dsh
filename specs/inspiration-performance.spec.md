# 灵感社区加载性能全链路优化规格说明书（Issue #2199）

## 一、背景与问题陈述
在真实桌面端运行环境下，用户进入「灵感社区」切换至「本地」标签页时，卡片长时间处于深灰色占位骨架屏（shimmer）状态，加载速度缓慢，体验卡顿。

经过 CDP 实机抓包分析，定位到以下 4 个核心性能堵塞点：
1. **人为强制等待半秒多**：前端在列表数据请求完成后，强制执行 `await preloadBatchCovers(items, 600)`，在完成前阻断卡片列表挂载，导致至少 600ms 的纯骨架屏阻塞；
2. **本地静态媒体无 HTTP 缓存**：本地媒体路由 `/omnimux/inspiration/local/media/` 缺乏 `Cache-Control` 与 `ETag` 响应头，导致每次切换标签页或刷新均重新走本地网络读盘，单图排队耗时达 1.1s ~ 3.2s；
3. **列表数据包严重超重**：本地列表接口全量序列化输出万字 `deconstruction`（AI 深度拆解大文本、提示词脚本等），单条条目平均 10KB+，17 条数据体积膨胀到 165KB；
4. **卡片状态机双重遮罩与视频首帧阻塞**：卡片在图片 `onLoad` 前强制覆盖深灰色扫光层，且封面缺失时尝试通过 `<video preload="metadata">` 读取大视频首帧，进一步加剧卡顿。

## 二、优化目标与成功标准
1. **列表首帧呈现时间**：移除前端强制 600ms 阻塞，数据到达后首屏卡片秒级挂载；
2. **静态封面缓存命中率**：本地封面开启永久强缓存（`Cache-Control: public, max-age=31536000, immutable`），二次进入或 Tab 切换直接命中浏览器缓存（0ms 传输）；
3. **列表传输瘦身**：本地列表接口支持轻量投影，去除列表无用的长文本拆解字段，列表 payload 体积缩减 70% 以上；
4. **兼容性与功能完整**：点击卡片打开预览弹窗（`InspirationPreviewModal`）时仍然完整获取条目的深度拆解详情，复刻与一键复制功能完全不受影响；
5. **测试覆盖**：相关单元测试与端到端测试 100% 通过。

## 三、系统设计与技术方案

### 1. 本地媒体服务增加强缓存头
- 文件：`plugins/omnimux-inspiration/src/http-routes.js` 中的 `pipeMedia` 函数。
- 逻辑：对非 Range 请求及 200 响应，添加响应头：
  - `Cache-Control: public, max-age=31536000, immutable`
  - `ETag: W/"<size>-<mtime>"`
  - 若客户端请求携带 `If-None-Match` 且匹配，直接返回 `304 Not Modified`。

### 2. 移除列表预加载阻塞
- 文件：`plugins/omnimux-inspiration/src/client/feed-helpers.js` 中的 `fetchAndMergeInspirations`。
- 逻辑：将 `await preloadBatchCovers(result.items, 600)` 改为非阻塞异步预热或直接移除阻塞，确保 `mergeFetchResult` 立即执行，让骨架屏直接被卡片替换。

### 3. 优化卡片占位状态机
- 文件：`plugins/omnimux-inspiration/src/client/InspirationCoverCard.jsx`。
- 逻辑：
  - 避免无封面条目阻塞：当无封面时快速判定并降级到轻量图标 fallback，不进行过重视频首帧阻塞。
  - 提升图片展示平滑度：在 `img.complete` 为 true 时快速同步 `loaded` 状态。

### 4. 列表接口数据轻量投影
- 文件：`plugins/omnimux-inspiration/src/http-handlers.js` 或本地 store 读取处。
- 逻辑：列表查询时仅返回列表卡片所需字段（id, title, cover_url, media_urls, is_favorite, stats, author, source_platform, type, duration, country_code, category, traffic_type, posted_at, created_at, import_status, import_error 等），省略超大字段 `deconstruction`（详情接口已支持单独读取）。

## 四、验证与回归策略
- 单元测试：`pnpm --filter omnimux-inspiration test`；
- 浏览器实测：通过 CDP 抓包对比优化前后加载耗时、网络请求响应头、卡片渲染状态。
