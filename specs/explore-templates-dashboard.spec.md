# 规格说明书：创作首页「探索模板」融合分类与三大复刻模式全链路联动

- **状态**：In-Progress
- **关联 Issue**：#2240
- **工作树**：`omnimux-dsh-wt-explore-templates-refactor-2240`
- **所有者**：软件交付团队 (主理人 齐活林)

---

## 1. 目标与价值 (Objective)
在 OmniMux 会话启动首页（SessionGuide），打通来自 Pippit、Creatify、Creatok、Higgsfield、Topview 等第三方 395 套专业视频模板；同时将 TikTok 热门爆款与 Skills 提示词专业技能作为非模板化内容，无缝融入主分类胶囊与单行货架流，提供极致清爽的大片视觉与直达输入框的快捷复刻联动。

---

## 2. 交互与布局规范 (Layout & Interaction Specifications)

### 2.1 首页四层纵向排布体系
1. **输入框 Composer**：支持挂载灵感文件附件卡片、富文本快捷指令插槽替换 `[@选择产品/SaaS界面]`、底部左侧技能槽激活；
2. **快捷输入 Top 10**：品类机会、热门产品、竞争对手扫描等 10 项小按钮；
3. **热门入门方式 4 大卡片**：营销洞察、视频网址、复刻爆款视频、批量创建广告；
4. **探索模板核心大专区**：
   - 扁平单行分类胶囊栏（10大分类，严格按用户指定顺序排布，纯中英文适配）；
   - 单行分组横滑货架流（标题、副标题、查看全部、悬浮翻页按钮）。

### 2.2 分类胶囊排列顺序与定义
严格按照用户指定的顺序排布（采用原生多语言字典，杜绝括号双语拼接）：
1. `all`: 全部 / All
2. `tiktok`: TikTok热门 / TikTok Trending
3. `skills`: Skills / Skills
4. `apps-software`: 软件应用 / Apps & Software (保持纯净文本胶囊，无任何多余图标或徽标)
5. `hook-intro`: 黄金开场 / Hook & Intro
6. `ugc-review`: 真实种草 / UGC & Review
7. `cinematic-vfx`: 视效大片 / Cinematic VFX
8. `fashion-try-on`: 模特试穿 / Fashion Try-On
9. `industry-packs`: 行业精选 / Industry Packs
10. `durability-test`: 硬核评测 / Durability Test

### 2.3 卡片视觉纯净化与悬停复刻动效
- **彻底去除**：模型名称（如 Seedance 2.5）、渠道平台名（如 Topview）、右上角声音动画图标；
- **Skills 卡片**：彻底移除虚假互动率与播放量数据，保持极简大片感；
- **TikTok 热门卡片**：保留真实的互动率与播放量指标；
- **默认状态**：9:16 竖屏大图，底部渐变遮罩，底端仅显示白色两行标题文本；默认绝对隐藏复刻按钮；
- **悬停状态 (Hover)**：
  - 标题向上平滑位移 50px；
  - 底部升起深灰半透明毛玻璃胶囊按键「↺ 复刻」（直接复用 `.omnimux-trending-recreate-btn` 样式，绝无蓝色）。

### 2.4 三大复刻模式联动契约
1. **模板复刻**：
   - 将完整 Prompt 预填至输入框；
   - 提示词中 `{slot_product}` / `{slot_media}` 等变量转为快捷指令插槽；
   - 用户点击插槽即可在输入框内唤出资产库选择并替换。
2. **TikTok 热门复刻**：
   - 在输入框顶部挂载带「灵感 ID」的文件卡片（含分镜脚本与拆解元数据）；
   - 预填对标脚本提示词；
   - 提交时作为结构化上下文注入当前会话。
3. **Skill 复刻**：
   - 直接装载激活输入框底部的技能槽；
   - 输入框预填固定话术：`为我解释下这个技能的最佳使用方式。`；
   - 自动聚焦输入框。

---

## 3. 质量门禁要求 (Hard Quality Gates)
- [UI01] 所有 `<button>` 必须附带 `/* exempt-ui01: ... */`；
- [UI03] 禁止 CSS 裸色，必须使用 CSS 变量（`--dsw-alias-*`）；
- [UI04] 禁止在中文标题或文本中滥用 Emoji；
- [UI10] 字号必须在白名单内；
- [R6] 随包分发的 JSON 文件严禁包含开发机绝对路径；
- 全套单元测试与 E2E 测试 100% 绿灯。
