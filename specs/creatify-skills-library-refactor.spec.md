# Creatify 112套全新营销技能入库与 1:1 视觉复刻重构规范 (Spec)

## 一、背景与业务目标
1. **数据源**：将 `/Users/x/Desktop/Project/OPC/资产库/素材库/gxgen-data/inspiration-library/creatify/creative-agent-skills-20260918/` 下的 112 套专业营销技能完整入库到产品技能库。
2. **下架清理**：历史旧版技能全部下架，不在页面加载与展示，保证技能库 100% 纯净呈现最新标准 112 套技能。
3. **分类体系重构**：默认分类设为「全部」，引入全新官方分类体系：
   - 全部 (all)
   - 👤 UGC 和用户评价 (ugc-testimonial)
   - 📖 故事讲述和脚本 (storytelling-script)
   - 🖼️ 图片和静态广告 (image-static)
   - 🎬 视频广告 (video-ads)
   - 📦 产品展示 (product-showcase)
   - 😊 模因与原生 (meme-native)
   - 其它专业营销分类 (other)
4. **页面分区布局**：在「全部」分类下：
   - 顶部置顶一：「热门精选」—— 3 套核心爆款技能（UGC 告白、电影级、UGC展示）
   - 顶部置顶二：「新品上市」—— 6 套最新技能（电子商务、静态图片、轮播、课程转短视频、UGC穿搭检查、青少年体育宣传片），右侧配备「查看全部 >」
   - 底部区域：「探索更多」—— 容纳剩余 103 套专业技能
5. **卡片视觉 1:1 像素级复刻**：
   - 3:2 宽高比画幅，16px 圆角
   - 8 种高质感循环多色渐变封面图自然分配
   - 点阵半透明网格纹理覆盖
   - 居中白色加粗大标题与官方认证对勾徽章
   - 左上角热门火苗 🔥 / 新品微标「新」+ 分类胶囊
   - 右上角收藏星标
   - 悬停浮起动画与底部上滑描述与使用量面板

## 二、验收标准与核心用户旅程 (Critical User Journeys)
1. **CUJ-01 页面初始化与默认分类**：
   - 进入技能库面板，默认高亮「全部」分类胶囊；
   - 页面呈现「热门精选」、「新品上市」（带查看全部）与「探索更多」三大区块；
   - 旧版技能 100% 不加载，仅加载 112 套技能。
2. **CUJ-02 分类切换与筛选**：
   - 点击任一分类胶囊（如「视频广告」），页面平滑切换为该分类的全量卡片网格；
   - 点击「全部」胶囊或新品上市的「查看全部」，恢复三大专区分组视图。
3. **CUJ-03 卡片视觉呈现与动效**：
   - 每张卡片呈现 3:2 宽高比，封面图展示循环多色渐变与细腻点阵网格；
   - 居中呈现对应中文大标题与白色认证徽章；
   - 鼠标悬停卡片向上浮起，底部滑出半透明渐变黑底，显示两行描述与使用次数。
4. **CUJ-04 技能点选与交互联动**：
   - 点击卡片触发 `onSelectSkill` 回调，点亮技能槽位或将该技能提示词注入输入框。

## 三、涉及文件与架构
1. `plugins/omnimux/assets/skill-card-covers/`：存放 8 种渐变封面 WebP 图片
2. `plugins/omnimux-market/catalog/skills/`：入库 112 套技能文件夹 (含 SKILL.md / meta.yaml)
3. `plugins/omnimux-market/catalog/index.json`：更新为 112 套技能登记，下架原有技能
4. `plugins/omnimux/src/client/session-guide/skills/featured-skills.json`：更新为 112 套技能快照与新分类
5. `plugins/omnimux/src/client/session-guide/skills/SkillsPanel.jsx`：支持置顶热门、新品与探索更多三区分组
6. `plugins/omnimux/src/client/session-guide/skills/SkillCard.jsx`：1:1 复刻卡片视觉结构与动效
7. `plugins/omnimux/src/client/session-guide/styles.js`：更新与补齐 1:1 卡片样式类
