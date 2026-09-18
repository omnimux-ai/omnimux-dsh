# 规格：探索模板头部极简收敛与动作按钮单行对齐

## 1. 任务背景与目标
- **业务场景**: 首页「探索模板」专区头部视觉精简对齐
- **核心诉求**:
  1. 移除冗余的灰色副标题文本元素（`精选 7 大分类王牌爆款短视频应用 · 传图一键出片`）；
  2. 移除外层多余重复的「探索模板」大标题，避免上下重复；
  3. 将操作按钮文本从「查看全部」优化为「探索全部」（英文 `Explore all`）；
  4. 将「探索全部」按钮调整为与「探索模板」主标题在同一行水平对齐展示。

## 2. 详细改造点
- `ExploreTemplatesSection.jsx`:
  - 移除顶层 `<div className="omnimux-explore-header-row">`，直接由 `TemplatesShelfRow` 单行头部承载；
  - 传给 `onViewAll` 的点击动作绑定为打开首款官方应用或应用中心；
- `TemplatesShelfRow.jsx`:
  - 移除 `omnimux-shelf-subheading` 元素；
  - 将 `viewAllText` 中文改为 `探索全部`；
  - 调整标题与按钮在一行内垂直居中对齐；
- `templates-data.js`:
  - 清理货架数据中的 `subtitleZh` / `subtitleEn`，避免残留。

## 3. 验收标准
- 头部仅保留单行：左侧「探索模板」，右侧「探索全部 >」；
- 页面无副标题文字碎片，无重复标题；
- 单元测试与端到端测试 100% 绿灯。
