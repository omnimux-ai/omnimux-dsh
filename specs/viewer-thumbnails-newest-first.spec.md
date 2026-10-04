# 规格：左侧缩略图栏按时间倒序排列（最新项置顶显示）

## 1. 目标（Objective）
- 图像生成查看器（MediaViewerTab）左侧缩略图纵向切换栏（`.omx-mv-thumbnails-rail`）当前默认按历史顺序展示，导致新生成的任务与最新图片总是追加在最底部，用户每次需要滚动到底部查看。
- 本优化将左侧缩略图栏调整为**按时间最新倒序排列（最新项排在最上方第一位）**：
  1. 生成中的任务卡（`status === 'generating'`）以及最新生成的图片直接位于最顶部开头；
  2. 历史生成图片按时间依次向下顺延排列；
  3. 切换会话时，若无选中的素材，默认高亮选中最顶部的最新生成项。

## 2. 验收标准（Success Criteria）
- **缩略图顺序（Newest First）**：
  - 在缩略图栏（`.omx-mv-thumbnails-rail`）中，`timestamp` 最大（最新）的素材排在 DOM 树的第一个子节点（索引 0）；
  - 较早生成的素材依次向下排列；
  - 若正在生成新任务，该生成任务排在顶部开头；
- **默认选中行为**：
  - 在没有指定选中项时，默认激活最顶部的最新素材（`thumbnailsList[0]`）；
- **原有交互与样式保持**：
  - 缩略图点击切换主画布视图的功能与缩放保持不变；
  - 视频素材标识与失败任务标识展示正常；
  - 自动化测试与契约测试 100% 通过。

## 3. 测试策略（Testing Strategy）
- 单元测试：`plugins/omnimux-viewer/src/media-viewer/thumbnails-newest-first.test.js` 验证列表生成与排序逻辑；
- 端到端/DOM 验证：`plugins/omnimux-viewer/src/media-viewer/thumbnails-newest-first.e2e.test.js` 验证渲染出的缩略图列表首项为最新项。
