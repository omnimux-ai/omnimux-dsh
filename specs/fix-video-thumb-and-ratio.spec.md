---
issue: 1848
status: approved-for-implementation
date: 2026-09-15
---

# 助手回复多素材画廊 · 视频缩略图修复与竖屏自适应零黑边规格

## 1. 背景与缺陷分析

### 1.1 缺陷 1：视频缩略图裂开（展示破损图片图标）
- **根因**：在素材项为视频（`item.type === 'video'`）时，缩图列表依然创建了 `<img>` 标签并将视频 MP4 URL 直接赋给 `img.src`，浏览器无法将 MP4 作为图片解码，直接触发 `onerror` 导致破损图片展示。
- **目标**：在缩图创建时，区分素材类型。若是视频，则创建静音、预加载元数据的 `<video class="omx-chat-media-tail__thumb-video" playsinline muted preload="metadata">` 标签并附带 `#t=0.001` 取第一帧，在缩略图小方块中以 `object-fit: cover` 完整渲染。

### 1.2 缺陷 2：竖屏素材左右出现大块黑边
- **根因**：
  1. 视频素材在主舞台中硬编码指定了 `mainStage.style.aspectRatio = '16 / 9'`，当用户视频为 9:16（720×1280）竖屏视频时，强行塞入横屏 16:9 容器，导致左右两侧出现巨大的黑色留白空隙；
  2. 画廊容器使用了 `width: 100%; max-width: 580px;` 且主舞台使用了 `flex: 1 1 auto`，在竖屏时强行撑大宽度至 474px，导致窄比例素材左右大黑块。
- **目标**：
  1. 视频主舞台必须通过 `loadedmetadata` 事件动态读取 `vid.videoWidth` 与 `vid.videoHeight` 并设置真实长宽比；
  2. 画廊容器改为 `width: fit-content; max-width: 100%`，主舞台改为 `flex: 0 1 auto`，使画廊在展示竖屏素材时整体宽度自适应收拢，缩图栏紧贴在右侧，达到 100% 零黑边。

## 2. 验收标准
- **AC-1**：视频素材在缩略图导航栏中生成 `<video>` 标签，正常呈现第一帧封面且不静音发声、无播放控件。
- **AC-2**：竖屏视频（9:16 等）主舞台长宽比自适应等于 `videoWidth / videoHeight`，画廊容器按比例自适应收缩，左右无黑边。
- **AC-3**：单元测试与端到端测试均覆盖视频缩略图 `<video>` 标签及自适应比例断言。
- **AC-4**：静态 UI 门禁无违规。
