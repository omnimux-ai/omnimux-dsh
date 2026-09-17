# 规格：创作首页「探索模板 (Explore templates)」分类货架与秒级出片闭环

- **状态**：Draft -> In-Progress
- **关联 Issue**：#2200
- **工作树**：`omnimux-dsh-wt-explore-templates-dashboard-2200`
- **所有者**：软件交付团队 (主理人 齐活林)

---

## 1. 目标与价值 (Objective)

为解决原有首屏过多重型 Tab（“热门视频”、“Skill”等）导致页面过重、认知混乱，以及第三方模版零散未收敛的问题，本次将创作首页彻底轻量化收口为单一聚焦入口——**「探索模板 (Explore templates)」**。
依托整合了 Pippit、Creatify、Creatok、Higgsfield、Topview 的 395+ 套全带提示词的真模版库，构建：
1. **纯粹聚焦的极简首屏**：移除多余顶层 Tab，直接呈现即刻创作工作台与「探索模板」总览；
2. **7 大核心分类胶囊导航**：包含新增的 `💻 软件应用 (Apps & Software)` 以及黄金开场、真实种草、电影视效、模特试穿、行业精选、硬核评测；
3. **货架式横滑流与全量网格双模态**：默认在全部状态下呈现流媒体货架行（Section Shelf），点击任意行右上角「查看全部 (View all) →」无缝点亮对应分类胶囊并展开全量大网格；
4. **零跳出一键复刻装配出片**：点击任意模版上的「✨ 一键复刻」，平滑滚动回顶部工作台，自动填入分镜提示词，并根据模版类型（软件应用 vs 实物电商）自适应切换插槽引导。

---

## 2. 验收标准 (Acceptance Criteria)

- **AC-1 (极简顶层导航)**：首页彻底移除多余的重型 Tab，顶部直观展示「探索模板 (Explore templates)」主标题与 R2 资产就绪状态，无其他干扰入口。
- **AC-2 (即刻创作台就绪)**：页面顶部常驻提示词输入框、参考模版对标槽与商品/录屏可变插槽。
- **AC-3 (7 大分类胶囊覆盖)**：分类栏完整提供：全部货架 (All)、💻 软件应用 (Apps & Software)、🎯 黄金开场 (Hook & Intro)、🗣️ 真实种草 (UGC & Review)、💥 视效大片 (Cinematic VFX)、👗 模特试穿 (Fashion Try-On)、🏬 行业精选 (Industry Packs)、📦 硬核评测 (Durability Test)。
- **AC-4 (货架行横向滚动)**：在「全部货架」状态下，各主题以单行展示，支持原生平滑横向滚动，右侧常驻浮动圆形翻页箭头按钮 `›`，点击后向右滚动至少 280px。
- **AC-5 (查看全部无缝切分类)**：点击任意货架行右上角「查看全部 (View all) →」，上方分类胶囊自动切换为该分类的 active 状态，下方多行货架自动隐去，无缝展开为该分类下的全量多列自适应大网格。
- **AC-6 (一键退回全部分组)**：在全量大网格顶部展示「← 返回全部分组货架」按钮，点击后恢复为多主题货架行视图，上方胶囊同步切回「全部货架」。
- **AC-7 (模版卡片视觉与信息)**：每张卡片展示 9:16 视频或封面图片、左上角展示模型与规格角标（如 Seedance 2.5 / 15s 竖版）、右上角展示来源平台（Creatify/Creatok/Higgsfield/Pippit 等），悬停时底部浮起「✨ 一键复刻」按钮。
- **AC-8 (提示词与分镜秒级装配)**：点击卡片上的「✨ 一键复刻」，页面平滑回到顶部工作台，提示词输入框自动填入该模版的完整分镜结构与运镜节奏，上方出现「已装配模版」提示条。
- **AC-9 (插槽类型智能自适应)**：若选中的是「💻 软件应用」模版，卡槽标题变为「待放入：你的 SaaS 录屏 / 官网 / App截图」；若选中的是实物电商模版，卡槽标题变为「待放入：你的商品白底图 / 产品链接」。
- **AC-10 (模版拆解抽屉)**：点击卡片非按钮区域弹出详情抽屉，展示该模版的镜头分镜脚本、提示词原文与插槽指引，点击抽屉内「✨ 立即装配并复刻」同样完成装配并关闭抽屉。

---

## 3. 技术设计与关键文件 (Technical Design)

- **数据层**：
  - 数据源清洗输出：`plugins/omnimux/src/client/session-guide/templates/creative-templates.json`（395+ 纯真模版）；
  - 数据模型与常量定义：`plugins/omnimux/src/client/session-guide/templates/templates-data.js`；
  - 媒体寻址解析：使用 `media-resolver.js`，保证在缺少云端 CDN 配置时优雅降级，严禁硬编码开发机私有路径。
- **组件层**：
  - `ExploreTemplatesSection.jsx`：货架视图与分类网格总调度组件；
  - `TemplatesShelfRow.jsx`：货架横滑行组件；
  - `TemplatesGridView.jsx`：单一分类展开网格组件；
  - `TemplateCardItem.jsx`：统一卡片组件；
  - `TemplateDetailDrawer.jsx`：模版分镜与结构拆解抽屉；
  - `SessionGuide.jsx`：移除旧版单薄引导卡片，接入全新 `ExploreTemplatesSection`。
- **样式与规范**：
  - 在 `styles.js` 中扩充样式，严格复用已有 CSS 变量（`--bg-card`、`--border-subtle`、`--brand-primary` 等），严禁书写反引号破坏模板，严禁使用裸色。

---

## 4. 验证与测试策略 (Verification & QA)

1. **单元测试与数据校验**：
   - 编写 `templates-data.test.js`：断言总表模版数量 >= 390 套，断言 7 大分类枚举完整，断言每套模版 100% 具备非空 prompt。
2. **组件渲染与交互测试**：
   - 编写 `explore-templates.test.js`：测试默认渲染货架行、点击查看全部切 Tab、点击一键复刻触发联动。
3. **真实浏览器自动化实测 (Verify)**：
   - 使用 CDP / ego-browser 加载组件，实测横向滚动、模版装配、抽屉弹窗，并截屏保存至 `docs/evidence/explore-templates-*.png`。
