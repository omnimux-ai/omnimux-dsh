# 规格：探索模板 Tab 栏实心纯色背景与页面根底色无缝对齐（零透明、零色差）

## 1. 任务背景与核心诉求
- **现状缺陷**:
  上一轮修复中引入了 `color-mix(in srgb, var(--dsw-alias-bg-base, #111113) 90%, transparent)` 与毛玻璃效果，导致 Tab 栏具备 10% 的透明度。在卡片向上滚动时，卡片内容（人像图片、文字）直接穿透显示在 Tab 栏背后，产生严重的视觉重叠与污染（“要么是死黑背景 要么是透明的”）。
- **用户明确要求**:
  1. **首先不能透明**：必须 100% 实心遮挡（不允许任何透明通道或透光效果），卡片在下方穿行时绝对不能透出任何内容；
  2. **其次颜色必须和背景颜色一致**：不能是之前那种比背景更黑的死黑色块 `#0d0d0f`，必须与页面底色 100% 保持完全同色、无缝融入；
  3. **逻辑零破坏**：不得影响原有的固定栏（吸顶）、Tab 切换、指示横线、加号置顶联动与吸底状态机。

## 2. 解决方案与实现细节
- **背景属性定义**:
  ```css
  .omnimux-explore-filter-bar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
    position: sticky;
    top: 0;
    z-index: 80;
    /* 实心纯色背景：必须 100% 不透明，杜绝任何穿透；色值与页面底色严格一致，无任何死黑与色差 */
    background: var(--dsw-alias-bg-base, #111113);
    padding: 8px 0 4px;
  }
  ```
- **核心保证**:
  1. **零透明（100% 实心）**：移除任何 `transparent` 衰减、透明度与导致透光的毛玻璃，保证下方内容滑过时 100% 被遮蔽；
  2. **零色差（与背景完全一致）**：直接消费宿主页面背景 Token `--dsw-alias-bg-base`，无论在深色模式（#141416 / #111113）还是浅色模式（#ffffff），Tab 栏与页面背景都是同一个变量、同一种颜色，静止时没有任何接缝与色块边缘；
  3. **业务逻辑完整保留**：
     - `position: sticky; top: 0; z-index: 80` 吸顶几何与层级保持不变；
     - 一级 Tab（精选、资产库、灵感库、商品库、爆款趋势、Skills）切换不受影响；
     - 二级分类选项卡下划线指示动画与点击过滤不受影响；
     - 输入框加号菜单置顶滚动（`omnimux:explore:scroll-to-tab`）与吸底状态机（`omnimux:composer:dock-intent`）不受影响。

## 3. 验收标准
- [x] `.omnimux-explore-filter-bar` 背景为实心 `var(--dsw-alias-bg-base, #111113)`，无 `transparent` 与半透明混合；
- [x] 无 `#0d0d0f` 硬编码死黑色块；
- [x] 吸顶属性 `position: sticky; top: 0; z-index: 80` 严格保留；
- [x] 单元测试与 E2E 契约测试全部通过。
