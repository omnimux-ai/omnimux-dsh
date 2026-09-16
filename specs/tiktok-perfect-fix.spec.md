# TikTok 场景 CreatOK 复合避让与播放器真实作品 ID 抓取规格 (Issue #2035)

## 1. 业务目标与真实背景
通过实机逆向与真实 DOM 探测分析发现：
1. **CreatOK 避让不充分**：竞品插件 CreatOK 在页面挂载为 `<div id="creatok-video-trigger" ...>`，高 64px 且自带底部间距与文字标签。此前通用选择器未精确命中该特定 ID，且避让间距不足，导致视觉上与幽灵图标紧挨触碰。
2. **作品抓取报错根因**：TikTok 推荐流中视频卡片并不使用常规 `a[href*="/video/"]` 包裹，而是直接挂载西瓜播放器容器 `<div id="xgwrapper-{index}-{awemeId}">`。导致原解析函数找不到作品，抛出红字「这一页没有可操作的作品」。

## 2. 验收标准 (AC)
- **AC-1 (精确匹配 CreatOK 与大留白顶升)**：选择器显式覆盖 `[id*="creatok"]`, `[class*="creatok"]`, `[data-placement*="action-bar"]`，并将安全避让间距从 16px 扩充至 24px，确保对手图标与其底部文字标签完整平移，与幽灵图标保持清晰通透的留白。
- **AC-2 (播放器 ID 级联解析提取)**：支持从当前活跃卡片的 `[id*="xgwrapper-"]` 或 `[id*="xgmedia-"]` 容器中直接提取 19 位数字视频 ID，结合卡片内的作者 handle（或官方合法的 `@i`）自动合成标准作品链接 `https://www.tiktok.com/@{author}/video/{awemeId}`，彻底消除「这一页没有可操作的作品」报错。
