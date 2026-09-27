# 技能/专家工坊新增「插件专栏」与分类栅格可开启/禁用布局实测验证证据

## 一、验证目标与规范闭环

对照用户需求与截图样式：
1. **导航栏与 Tab 契约**：在「专家市场」右侧成功加入「插件专栏」Tab，保持与「Skill」、「我的 Skill」、「专家市场」一致的 20px 基准线与下划线指示；
2. **分类与双列网格还原**：按「内容与创作」、「视频与媒体」、「社媒与运营」、「智能体与系统」四大分类组织，每类采用双列响应式网格；
3. **卡片视觉与元素规范**：
   - 左侧 36x36px 圆角矩形槽位展示专属纯矢量 SVG 图标（无任何 Unicode/Emoji，UI04 100% 合规）；
   - 中间展示插件名称（14px 粗体）与功能描述（12px 次级文字）；
   - 右侧展示 iOS 风格 WorkshopSwitch 开关，支持即时切换并持久化至 `localStorage`（键 `omnimux:plugins-enabled-state`）；
   - 核心受保护插件（`omnimux` 与 `omnimux-market`）保持开启并呈现锁定只读态，悬停带有专属安全提示；
4. **搜索与过滤联动**：顶部 SearchField 输入时，跨分类实时过滤插件名称、描述与 ID，匹配为空时自动收起分类，全量未匹配时优雅提示空状态。

---

## 二、实测数据与对比结论

1. **Tab 布局对比**：
   - 包含 `Skill`、`我的 Skill`、`专家市场`、`插件专栏` 4 个主要标签；
   - 切换到「插件专栏」时，二级 `category-bar` 胶囊栏自动隐藏，保持视图清爽；
2. **插件全量盘点（21 款内置插件）**：
   - **内容与创作 (4款)**：`omnimux-inspiration`、`omnimux-assets`、`omnimux-products`、`omnimux-forms`；
   - **视频与媒体 (5款)**：`omnimux-clip`、`omnimux-studio`、`omnimux-video`、`omnimux-video-preview`、`omnimux-viewer`；
   - **社媒与运营 (5款)**：`omnimux-publish`、`omnimux-social-harvest`、`omnimux-accounts`、`omnimux-analytics`、`omnimux-intercept`；
   - **智能体与系统 (7款)**：`omnimux-automation`、`omnimux-workflow`、`omnimux-browser`、`omnimux-device`、`omnimux-apps`、`omnimux`（受保护）、`omnimux-market`（受保护）；
3. **打包与构建指标**：
   - `plugins/omnimux-market/scripts/concat-client.mjs` 打包成功；
   - `lib/client.js` 体积 1,440,144 字节，包含 23 个 client fragments；
4. **审查与测试结论**：
   - `node tests/e2e/market-plugins-column.e2e.test.mjs`：3/3 pass；
   - `node tests/e2e/market-tabs-alignment.e2e.test.mjs`：3/3 pass；
   - `node tests/e2e/market-mine-category-bar.e2e.test.mjs`：2/2 pass；
   - `ocr review` 命令行复审：PASS-WITH-NITS（Hook隔离与Header无缝解耦已闭环）。
