# 统一各插件双层标签与分割线视觉规范规格

## 背景与问题陈述

在桌面端各工作台一级页面（产品库、资产库、技能市场、数据分析）的实际使用中，存在四处破坏统一极简视觉体验的微观样式瑕疵：

1. **产品库分割线直接穿透铺满整个视口**：
   - 预期表现：分割线应与资产库、发布中心、创作画布统一，两侧各留白 20px，严格与标题及搜索框同基线对齐；
   - 根因：公共规则 `:is(..., .omnimux-products-stage) > [role="separator"][aria-orientation="horizontal"]` 使用直接子代选择器，产品库因内部包含 `.omnimux-products-list-view` 容器导致该规则被阻断，回退为默认 100% 铺满。
2. **资产库双层标签栏垂直空隙过于拥挤**：
   - 预期表现：两层标签之间具有舒适透气的标准呼吸间距（约 14px）；
   - 根因：本地分类胶囊栏 `.omnimux-assets-local-nav` 的顶部留白为 0，导致上方下划线指示器距离下方白色胶囊仅 2px 缝隙，产生贴脸挤压感。
3. **技能市场未复用共享胶囊 Tab 样式且上下间距过大**：
   - 预期表现：完全复用资产库（图 2）的双层标签共享规范——全圆角（999px）胶囊形态、亮白底色反相黑字高亮、两层纵向间距严格收敛至 14px；
   - 根因：技能市场采用独立手写的 `.cat-btn` 样式（16px 方圆角、暗灰色半透明底色），且上层导航栏外边距达 18px，导致两层纵向距离达 20~28px。
4. **数据分析看板出现两条密集平行分割线**：
   - 预期表现：筛选栏与下方图表内容区自然衔接，仅保留上方一条公共分割线；
   - 根因：`.omnimux-analytics-stage-filter` 容器自带 `border-bottom`，与上方公共 `<Divider />` 叠加，在 44px 高度内产生两条重叠实线。

## 修复目标与规范定义

1. **产品库分割线对齐**：公共样式与产品库自身样式均支持 `.omnimux-products-list-view > [role="separator"]`，设置 `width: auto; margin-inline: 20px;`。
2. **资产库标签间距**：`.omnimux-assets-local-nav` 调整为 `padding: 12px 24px 10px;`，使两层标签净空由 2px 扩大为 14px。
3. **技能市场共享复用**：
   - 胶囊按钮 `.sh-mkt .cat-btn` 统一设为 `border-radius: 999px`，高度 28px，水平留白 14px；
   - 激活态 `.sh-mkt .cat-btn.active` 设为 `background: var(--dsw-alias-label-primary)`，文字反相 `color: var(--dsw-alias-label-primary-foreground)`；
   - 两层纵向空隙由 20~28px 收紧为 14px（`.sh-mkt .nav-bar { margin-bottom: 12px; }`）。
4. **数据分析移除下分割线**：`.omnimux-analytics-stage-filter { border-bottom: none; }`。

## 验收标准

- **AC-1**：产品库页面中的水平分割线左右两侧均有 20px 外边距，左端起点与标题「商品与产品库」严格对齐，右端与搜索框对齐。
- **AC-2**：资产库页面中，第一层下划线指示器底部与第二层「全部」胶囊按钮顶部之间的净垂直距离在 12px ~ 16px 之间（实测 14px）。
- **AC-3**：技能市场页面中，分类筛选按钮为 999px 全圆角胶囊形态，激活态呈现亮白底色与反相黑字；主导航与分类栏纵向净间距在 12px ~ 16px 之间（实测 14px）。
- **AC-4**：数据分析看板中，仅保留标签栏下方的一条分割线，筛选栏下方无任何底边框或分割线（`border-bottom` 为 0 或 none）。
- **AC-5**：全量静态门禁、自动化测试套件通过，无回退。
