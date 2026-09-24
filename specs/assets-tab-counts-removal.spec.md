# 资产中心 Tab 分类数量移除规格说明书（Spec）

- 模块：`plugins/omnimux-assets`
- 负责人：前端开发工程师 裴像素（Pixel / 像素匠）
- 产品经理：许清楚
- 架构与设计标准：`design.md`（现代 SaaS 科技极简规范，Linear / Vercel 标杆，WCAG AA，零自由发挥）

---

## 1. 目标与背景（Objective & Background）

### 目标
根据产品经理许清楚签发的 PRD、原型、Spec 白名单与实施计划四件套要求：
- **彻底移除**资产中心所有分类 Tab 胶囊（Chips）上的统计数量数字（`.omnimux-assets-cloud-count`），仅保留纯净实体文案；
- **严格保留**八维下拉筛选菜单（`CloudDimensionBar` Popover 选项）内的选项数量，不做改动；
- **反过度设计红线**：严禁私自添加 Spec 白名单之外的任何元素（如胶囊徽章、副标题说明、装饰图标、Emoji 符号等）。

### 涉及组件与文件
1. `plugins/omnimux-assets/src/client/CloudAssetsView.jsx`：
   - `CloudCategoryNav` 一级 Tab 胶囊行 (`.omnimux-assets-cloud-nav-row`): 移除数量 `<span>`，仅保留 `{t('cloud.category.' + row.id)}`。
   - `CloudCategoryNav` 二级子 Tab 胶囊行 (`.omnimux-assets-cloud-subnav`): 移除数量 `<span>`，仅保留 `{row.id === '' ? t('cloud.subnav.all') : t('cloud.subcategory.' + row.id)}`。
   - 保护区：`CloudDimensionBar` / `CloudDimensionFilter`（八维下拉筛选 Popover 内）中的 `option.total` 保持原样。
2. `plugins/omnimux-assets/src/client/AssetsStage.jsx`：
   - `LocalCategoryNav` 胶囊行 (`.omnimux-assets-cloud-nav-row`): 移除数量 `<span>`，仅保留 `{row.label}`。
3. `plugins/omnimux-assets/src/client/GenerationsView.jsx`：
   - `GenerationsCategoryNav` 来源 Tab 和 类型 Tab 内部：移除 `{typeof count === 'number' ? <span className="omnimux-assets-cloud-count">{count}</span> : null}`。
4. `plugins/omnimux-assets/src/client/AssetsStage.test.js`：
   - 更新单元测试断言，匹配纯文本 Tab 胶囊规范，确保无残留数量 class。

---

## 2. 用户操作旅程与期望界面反馈（User Journey & UI Feedback）

1. **浏览云端公共资产**：
   - 用户点击资产中心「公共」分栏，一级分类 Tab 胶囊行展示纯文本（如“全部”、“角色”、“场景”、“道具”等），不再显示右侧气泡统计数字；
   - 切换到有二级分类的类目（如“声音”），二级分类胶囊行展示纯文本（如“全部”、“人声”、“音效”等），无统计数字；
   - 切换到“角色”分类，展示八维下拉筛选栏（性别、年龄、风格等）；点击打开下拉 Popover 菜单，菜单内各个选项右侧依然保留原有的数量数字（如“女性 128”），以便用户精准按量筛选。
2. **浏览本地媒体资产**：
   - 用户切换到资产中心「本地」分栏，分类 Tab 胶囊行（如“全部”、“图片”、“视频”、“音频”）纯文本渲染，无数量徽章。
3. **浏览 AI 生成资产**：
   - 用户切换到「生成」分栏，来源与类型 Tab 胶囊行纯文本渲染，无数量徽章。

---

## 3. 验收标准（Acceptance Criteria）

| 编号 | 检查项 | 期望结果 |
|---|---|---|
| AC-1 | 云端公共资产一级 Tab | 不渲染 `.omnimux-assets-cloud-count`，仅渲染多语言分类名称 |
| AC-2 | 云端公共资产二级 Tab | 不渲染 `.omnimux-assets-cloud-count`，仅渲染子分类名称 |
| AC-3 | 云端公共资产八维下拉选项 | 严格保留选项上的 `.omnimux-assets-cloud-count` 与数字 |
| AC-4 | 本地资产分类 Tab | 不渲染 `.omnimux-assets-cloud-count`，仅渲染 `row.label` |
| AC-5 | 生成资产分类 Tab | 来源与类型 Tab 均不渲染数量 `<span>`，仅渲染 label |
| AC-6 | 单元测试 | `AssetsStage.test.js` 断言更新并通过，全量测试 100% 绿灯 |
| AC-7 | 客户端构建 | `build-client.mjs` 构建顺利通过，无报错 |

---

## 4. 边界与红线（Boundaries & Hard Gates）

- **总是（Always）**：
  - 100% 复制并严格遵守产品经理许清楚锁定的 UI 元素与文案；
  - 严格保持已有点击流转事件（`onCategory`、`onSubCategory`、`onSelect` 等）不变；
  - 运行单元测试与客户端构建确保零回归。
- **先问（Ask First）**：
  - 若需更改 Tab 布局或新增样式类，必须经由产品经理确认。
- **绝不（Never）**：
  - 严禁擅自添加任何 Badge、Emoji、副标题、图标或括号注释；
  - 严禁篡改 `CloudDimensionBar` 八维下拉中的选项数量统计；
  - 严禁在主检出直接写代码，必须全程在独立 Worktree 下受控交付。
