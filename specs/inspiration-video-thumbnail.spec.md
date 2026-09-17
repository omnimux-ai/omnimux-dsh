# 灵感库视频自动截取首帧生成封面缩略图规格说明 (Issue #2245)

## 1. 背景与问题
当视频素材被导入本地灵感库后（无论是第三方社媒视频还是本地素材）：
- 若上游未提供封面、封面下载失败或封面格式不被浏览器原生支持时，素材会缺失封面；
- 导致前端卡片仅呈现黑灰色底图与默认播放占位图标，无法直观浏览视频画面内容；
- 前端虽然有基于 `<video>` 标签提取首帧的备用机制，但容易受渲染延迟与 800ms 超时限制而过早回退到占位图，且多卡片同时挂载 `<video>` 性能损耗极大。

## 2. 核心目标与验收准则 (Acceptance Criteria)

| 编号 | 场景 | 输入/前置条件 | 预期行为与结果 |
| --- | --- | --- | --- |
| AC-1 | 导入视频缺失封面时自动截屏 | 视频导入落盘完成，且远端封面为空或下载失败 | 自动调用 ffmpeg 抽取视频首帧/第0.5秒画面生成高清 JPG 封面，落盘至 covers 目录并关联到 `cover_url` 与 `local_paths.cover` |
| AC-2 | 封面可正常渲染且不破坏既有封面 | 远端已提供合法可渲染的封面图 | 优先使用既有正常封面，不产生额外无谓截屏开销 |
| AC-3 | ffmpeg 缺失或异常时的弹性降级 | ffmpeg 不可用或视频流损坏 | 截屏失败静默降级，不中断视频本身入库与正常流转 |
| AC-4 | 存量无封面视频懒加载截屏补齐 | 本地库存在已有视频但 `cover_url` 为空的记录 | 在详情或库读取时支持按需自动补全生成本地缩略图封面 |
| AC-5 | 前端备用视频首帧探测超时优化 | 遇到无封面静态图的过渡阶段 | 前端备用帧探测超时放宽至 2500ms，避免过早闪烁回退到黑底占位图 |

## 3. 技术设计
- **截帧工具封装**：在 `plugins/omnimux-inspiration/src/media-export.js` 或专用工具中提供 `extractVideoPoster(videoPath, destDir, opts)`，调用系统 ffmpeg 执行：
  `ffmpeg -ss 00:00:00.500 -i <videoPath> -vframes 1 -q:v 2 <destPath> -y`
- **下载落盘接入**：在 `plugins/omnimux-inspiration/src/http-handlers.js` 的 `downloadImportMedia` 中，当 `cover.path` 为空时，调用 `extractVideoPosterBestEffort` 截取封面；
- **前端优化**：`plugins/omnimux-inspiration/src/client/InspirationCoverCard.jsx` 将 `800` ms 定时器调整为 `2500` ms。
