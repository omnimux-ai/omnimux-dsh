# 规格说明：技能市场 DSH 原生多语言适配（消除双语拼接，对齐原生 i18n 规范）

## 1. 业务背景与问题现象
- **缺陷**：技能市场（Workshop / Plaza）专区分区标题硬编码为中英双语斜杠拼接（`NEW ARRIVALS / 新品上市`、`EXPLORE MORE / 探索更多`）或单一英文（`HOT PICKS`），以及硬编码中文（`查看全部 >`）。
- **语言体验断层**：卡片上的分类胶囊标签（`categoryLabel`）写死了中文映射 `CATEGORY_NAMES`，导致英文环境下依然显示中文（如 `UGC 和用户评价`、`产品展示`）；卡片右上角收藏按钮 aria-label 硬编码为中文 `收藏`，新品角标硬编码为 `新`，使用量硬编码为英文 `uses`。
- **用户诉求**：用户明确要求“页面做 dsh 的原生多语言适配支持 而不是双语显示”。必须无缝接入 DSH 原生国际化（i18n）机制，语言切换到中文时呈现纯正中文，语言切换到英文时呈现规范英文，彻底消除生硬丑陋的斜杠双语拼接。

## 2. 解决方案设计
1. **完善国际化词典 (`plugins/omnimux-market/src/client/i18n.js`)**：
   - 在 `ZH` 与 `EN` 字典中补齐缺失的专区标题与卡片相关键位：
     - `workshop.hotPicks`: ZH 为 `热门精选`，EN 为 `HOT PICKS`；
     - `workshop.newArrivals`: ZH 为 `新品上市`，EN 为 `NEW ARRIVALS`；
     - `workshop.exploreMore`: ZH 为 `探索更多`，EN 为 `EXPLORE MORE`；
     - `workshop.viewAll`: ZH 为 `查看全部 >`，EN 为 `View All >`；
     - `workshop.badgeNew`: ZH 为 `新`，EN 为 `NEW`；
     - `workshop.bookmark`: ZH 为 `收藏`，EN 为 `Bookmark`；
     - `workshop.uses`: ZH 为 `{n} 次使用`，EN 为 `{n} uses`；
     - `workshop.usesDefault`: ZH 为 `100+ 次使用`，EN 为 `100+ uses`；
   - 统一补齐营销分类 `cat.*` 字典映射（`cat.ugc-testimonial`、`cat.storytelling-script`、`cat.image-static`、`cat.video-ads`、`cat.product-showcase`、`cat.meme-native`、`cat.other`）。
2. **重构专区分区渲染 (`plugins/omnimux-market/src/client/plaza/PlazaCardGrid.jsx`)**：
   - 热门精选专区：标题及 aria-label 统一使用 `tr('workshop.hotPicks')`（ZH: 热门精选 / EN: HOT PICKS）；
   - 新品上市专区：标题及 aria-label 统一使用 `tr('workshop.newArrivals')`（ZH: 新品上市 / EN: NEW ARRIVALS）；查看全部按钮使用 `tr('workshop.viewAll')`（ZH: 查看全部 > / EN: View All >）；
   - 探索更多专区：标题及 aria-label 统一使用 `tr('workshop.exploreMore')`（ZH: 探索更多 / EN: EXPLORE MORE）；
   - 单分类专区：分类标题优先调用 `tr('cat.' + category)` 获取本地化名称，杜绝简单粗暴的字符串转大写；
   - 彻底移除所有 ` / ` 双语拼接字面量。
3. **重构卡片多语言渲染 (`plugins/omnimux-market/src/client/plaza/FeaturedCard.jsx`)**：
   - 分类胶囊标签：优先通过 `tr('cat.' + item.category)` 获取本地化标签，未配置时安全回退；
   - 新品徽标：使用 `tr('workshop.badgeNew')`（ZH: 新 / EN: NEW）；
   - 收藏星标：使用 `tr('workshop.bookmark')` 作为 aria-label 与 title；
   - 使用量文案：使用 `tr('workshop.uses', { n: item.downloads })` 或 `tr('workshop.usesDefault')`。
4. **统一分类栏标签构建 (`plugins/omnimux-market/src/client/plaza/usePlazaFilter.js`)**：
   - `buildWorkshopCategories` 中的分类 label 统一通过 `tr('cat.' + c.id)` 动态解析，与全局词典保持完全一致。

## 3. 验收标准
1. **中文环境验证**：
   - 专区标题分别展示为“热门精选”、“新品上市”、“探索更多”，按钮展示为“查看全部 >”；
   - 分类胶囊展示为中文（如“UGC 和用户评价”、“产品展示”）；
   - 角标展示为“新”，使用量展示为“100+ 次使用”；
   - 界面中无任何 ` / ` 双语拼接。
2. **英文环境验证**：
   - 专区标题分别展示为“HOT PICKS”、“NEW ARRIVALS”、“EXPLORE MORE”，按钮展示为“View All >”；
   - 分类胶囊展示为英文（如“UGC & Testimonial”、“Product Showcase”）；
   - 角标展示为“NEW”，使用量展示为“100+ uses”；
   - 界面中无任何 ` / ` 双语拼接。
3. **工程合规与自动化验证**：
   - `market-creatify-cards.spec.js` 等测试用例 100% 绿灯通过；
   - `pnpm --filter omnimux-market build` 成功，打包出的 `lib/client.js` 无语法错误与断裂。
