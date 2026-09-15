---
issue: 1852
status: approved-for-implementation
date: 2026-09-15
---

# 图像生成工作台 · 修复视频素材缩略图破损规格

## 1. 问题与目标
右侧大工作台（`MediaViewerTab.jsx`）内的缩略图浮动栏在渲染素材时，所有类型均无条件使用 `<img>` 标签。当素材为视频文件（`.mp4`）时，传入图片标签会导致图片解码失败，出现裂开破损图标与截断的文件名。
目标：改造为按素材类型区分，视频素材渲染 `<video playsInline muted preload="metadata" src="...#t=0.001">`，保证第一帧作为清晰封面正常展示。

## 2. 验收标准
- **AC-1**：`MediaViewerTab.jsx` 中当 `item.type === 'video'` 时，缩略图项内渲染 `<video>` 元素，不再渲染破损的 `<img>`。
- **AC-2**：视频缩略图包含 `muted`、`preload="metadata"`、`playsInline` 与 `#t=0.001` 时间片段，静默提取第 0 秒封面。
- **AC-3**：测试与静态 UI 门禁全绿通过。
