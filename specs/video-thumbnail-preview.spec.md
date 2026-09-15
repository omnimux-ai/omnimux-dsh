---
issue: 1857
status: approved-for-implementation
date: 2026-09-15
---

# 图像生成工作台视频素材缩略图与时间线预览支持规格

## 1. 缺陷根因与目标

### 1.1 根因分析
在右侧【图像生成】看板中，当用户生成视频素材（`item.type === 'video'`）时，缩略图浮动栏以及四宫格/时间线列表曾无条件使用 `<img>` 标签加载视频的 `.mp4` 文件 URL。浏览器无法使用 `<img>` 解码视频流，直接触发图片加载失败，呈现破损图片图标与 alt 文本溢出。

### 1.2 修复目标
1. **缩略图栏支持视频标签与播放标识**：
   - 当 `item.type === 'video'` 时，渲染 `<video>` 标签并附带 `#t=0.001`、`muted`、`preload="metadata"`、`playsInline`；
   - 增加悬浮居中极简播放标识微图标（Play Icon），即便视频第一帧偏暗或加载中，用户也能直观识别视频类型；
   - 样式设置 `pointer-events: none`，确保点击缩略图顺畅触发切换，不被原生视频控件拦截。
2. **时间线瀑布流支持视频渲染**：
   - 时间线模式下的单图卡片（`.omx-mv-timeline__card-single`）与多图卡片（`.omx-mv-timeline__card-multi`）同样增加 `item.type === 'video'` 判断，渲染 `<video>` 而非 `<img>`。

---

## 2. 验收标准（AC）

- **AC-1**：缩略图浮动栏在 `item.type === 'video'` 时渲染 `<video className="omx-mv-thumbnails-rail__img">`，并包含播放指示图标 `.omx-mv-thumbnails-rail__play-icon`。
- **AC-2**：时间线瀑布流单图与多图卡片在素材为视频时渲染 `<video>` 标签，绝不向视频 URL 应用 `<img>` 标签。
- **AC-3**：单测与端到端测试覆盖上述两条视频渲染链路，静态 UI03 门禁全部通过。
