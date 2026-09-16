# 浏览器扩展 X/Twitter 及单页应用图片异步检测与卡片封面修复规格 (Issue #2068)

## 1. 业务问题与背景
用户在访问 X（Twitter）推文详情页（如 `x.com/liam_fallen/status/2100173136415088858`）时，推文明明包含配图，但插件侧边栏或浮动工作台中“完全检测不到图片”：
1. **封面图被 Twitter 占位横幅污染**：顶部推文卡片错误显示为黑色的 "X X SEE WHAT'S HAPPENING X X" 广告图（来自 `og:image` 兜底）。
2. **底部素材嗅探栏为空**：页面媒体列表 `detectedMedia` 计数为 0，下方未展示待选图片。
3. **时序脱节**：单页应用在进入页面初期，推文与图片由 React 异步加载（约 1~2s）；插件在页面标题初次确定时过早执行了上下文提取并发送了空结果，随后因 URL 和 Title 未变，不再向工作台同步，导致工作台永久停留在无图初态。

## 2. 核心改动规范

### AC-1: Twitter 占位横幅图黑名单过滤与主推文图片高优提取
- 在 `page-sensor.ts` 的 `extractHeroImage` 中：
  - 严禁采用 Twitter 默认品牌兜底占位图（如包含 `abs.twimg.com/rweb/ssr/default`、`abs.twimg.com/.../icon-default`）。
  - 在 `twitter` 详情页，若主推文（`article[tabindex="-1"][data-testid="tweet"]` 或首个推文 `article`）包含推文图片（`[data-testid="tweetPhoto"] img`、`img[src*="pbs.twimg.com/media"]`、`video[poster]`），必须优先提取真实素材；绝不在主推文已渲染后回退到博主头像或通用占位图。

### AC-2: 页面内容变动防抖感知与异步媒体就绪自动广播
- 在 `fab-companion.ts` 中：
  - 扩展感知算法，不仅监听 URL 与 Title 变化，同时监听主内容区（`main`, `article`）的 DOM 变动。
  - 当检测到有新增的推文或媒体图片挂载，或先前为无图状态而新检测到图片时，防抖（400ms）触发 `broadcastContextUpdate()`，主动向浮动工作台及侧边栏广播最新的完整上下文与媒体列表。

### AC-3: 浮动工作台（`isFloatMode`）与侧边栏感知对齐与自动重试
- 在 `App.tsx` 中：
  - 为 `isFloatMode` 补齐初态重试与轻量轮询：当页面刚加载且媒体列表为空时，以合理间隔（1.5s）向父页面重试请求 `GET_PAGE_CONTEXT`，直至内容就绪或稳定，确保工作台不卡在空白初态。
  - 修复 `MediaSnifferBar` 的展示规则：确保在浮动工作台模式下，检测到图片时同样能通过胶囊条直观看到并一键选用。

### AC-4: 兼容性与边界保护
- 保持既有的 TikTok、Zhihu、WeChat 及常规网站感知逻辑 100% 兼容。
- 绝不重复触发无意义的广播（基于内容/媒体哈希做浅比对去重）。
