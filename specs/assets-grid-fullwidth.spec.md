# 资产中心卡片网格全宽自适应与留白消除规格 (Issue #2014)

## 1. 业务背景
在修复资产中心整页滚动后，卡片网格出现了严重的布局塌陷：
- 卡片网格横向仅渲染 3 列卡片，右侧出现大片（约 800px）的纯黑空白区域，未占满内容视口；
- 正常的宽屏显示应当自适应排满整行（6~7 列卡片），形成标准的自适应瀑布流网格布局。

## 2. 根因剖析（CDP 真机实测归因）
- 为了解除垂直方向的截断以恢复滚动，`.omnimux-assets-body` 与 `.omnimux-assets-main` 移除了垂直方向的 `flex: 1`。
- 但是，`.omnimux-assets-body` 是一个 `display: flex;`（默认水平行向 flex-direction: row）容器。其子元素 `.omnimux-assets-main` 失去了 `flex: 1` 之后变成了 `flex: 0 1 auto`，且未声明 `width: 100%`。
- 在水平 flex 容器中，未定宽的 flex item 会发生 shrink-to-fit（宽度被内部未撑开的内容收缩），被内部宽度仅 601px 的分类导航条收缩至 649px（父容器 body 实际有 1440px 宽）。
- 内部的 `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))` 根据只有 649px 的容器宽度计算，只能排下 3 列（3 * 192px = 576px），导致右侧出现近 800px 的严重留白。

## 3. 改造方案
1. **容器宽度强制占满**：
   - 为 `.omnimux-assets-body`、`.omnimux-assets-main`、`.omnimux-assets-cloud` 显式声明 `width: 100%; box-sizing: border-box;`。
   - 彻底解除 shrink-to-fit 导致的宽度塌陷，使卡片网格容器宽度与视口 100% 同步（1390px+）。
2. **网格列数自适应铺满**：
   - 宽屏（1440px+）视口下自动填充排满 7 列卡片，自适应断点顺畅延伸，消除任何右侧黑缝与异常留白。

## 4. 验收标准（AC）
- **AC-1（全宽网格）**：在宽屏（>1400px）下，`.omnimux-assets-cloud-grid` 容器宽度与父容器 100% 贴合（>1300px），卡片列数自适应铺满 6~7 列，右侧无异常空白。
- **AC-2（无多余留白）**：`.omnimux-assets-main` 的实际渲染宽度与父级 `.omnimux-assets-body` 宽度一致（差值仅为 padding 允许范围）。
- **AC-3（整页滚动不回退）**：垂直方向依然具备自然撑开高度能力，滚动条和整页滚动功能不受影响。
- **AC-4（质量门禁）**：端到端契约测试与全量单测 100% 通过。
