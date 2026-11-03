# 规格：素材工作台 Skills 页卡片复用技能页渐变样式 (Issue #3918)

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3918
- 状态：已确认
- 工作树：`.worktrees/skill-card-style`（分支 `agent/skill-card-style`）

## 1. 现象

素材工作台（右侧 Asset Hub）Skills 标签页目前用 `InspirationPickerCard` 兜底渲染技能项：暗色方形卡 + 灯泡图标 + 单字符 + 一行标题（图 1）。与图 2 技能/专家页的 Creatify 高饱和渐变卡片（封面 WebP、徽章、分类胶囊、悬停描述与用量）风格不一致。

## 2. 用户操作旅程

1. 打开素材工作台 → 切到 Skills 标签。
2. 网格中以 Creatify 渐变卡片呈现技能：封面 WebP（缺图回退极光渐变）、左上徽章（热门火苗/新品）+ 分类胶囊、居中加粗白标题、悬停浮层显示两行简介与 `N uses`。
3. 点击卡片仍只向输入框追加运行技能的提示词（不产出附件负载）。

## 3. 期望界面反馈

- Skills 标签网格卡片从暗色方卡变为 Creatify 渐变卡（3:2 封面）。
- 徽章/分类/悬停描述/用量与技能/专家页一致。
- 其他 lane（assets/products/trending/inspiration/featured）卡片不受影响。

## 4. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | `lane==='skills'` 时 `UniversalLibraryCard` 渲染 `SkillCard`（omnimux-creatify-card 结构） | 单测/DOM 断言 |
| AC-2 | 技能卡用 `card.raw`（含 coverIndex/tags/downloads/summary）与 `index` 选封面 | 单测 |
| AC-3 | 瀑布流比例与卡片 `aspect-ratio: 3/2` 匹配 | 单测 cardRatioOf |
| AC-4 | 点击 skills 卡仍触发 onPick/onAttach（不产附件负载） | 单测 |
| AC-5 | 真实浏览器 Skills 页渲染渐变卡，封面/徽章/悬停生效 | 工作树浏览器截图 |
| AC-6 | 其他 lane 卡片视觉不变 | 回归对比 |

## 5. 设计

### 5.1 数据通道（已具备）

`asset-hub-data.js` 的 `normalizeSkillItem(row)` 已把 featured-skills 行映射成
`{id, lane:'skills', title, thumbnailUrl: resolveSkillCover(cover,coverIndex), mediaType:'skill', formatText:'SKILL', dimensionsOrSize: row.category, raw: row}`。
`card.raw` 即完整技能行（coverIndex/tags/isNew/downloads/summary/category），满足
`SkillCard` 全部输入。

### 5.2 分发器新增 skills lane

`UniversalLibraryCard.jsx` 新增分支：当 `lane==='skills'` 时渲染
`SkillCard({ skill: card.raw||card, t, active:isSelected, onSelect: handleAction, categoryTitle, index })`。
`index` 用 `card` 在网格中的序号（或 `coverIndex` 已足够，组件内部 `COVER_NUMS[index]` 兜底）。

注意：`SkillCard` 的 `aspect-ratio: 3/2`，而 `masonry-layout.js` `cardRatioOf` 目前给
`skills` 返回 `1/1`。为匹配 Creatify 卡片几何，把 skills 比例改为 `3/2`（含悬停 chrome
系数已由 `cardHeightOf` 统一加上 `CARD_CHROME_RATIO`，保持一致即可）。

### 5.3 样式注入

`SkillCard` 依赖 `omnimux-creatify-*`/`omnimux-skill-card-*` 的 CSS。需确认这些类在
素材工作台宿主下已注入；若样式来自 `session-guide/styles.js`，需要在工作台
`AssetHubPanel`/`ensureLibraryFlowStyles` 链路里确保该样式已加载（复用现有 ensure/install
函数，勿复制 CSS）。

### 5.4 点击语义

`adaptCardToAttachmentPayload` 对 skills 返回 `null`，点击只走 `promptForCard` 追加
`为我运行技能「${title}」，指导下一步创作流程。`——保持不变。

## 假设

- Skills 标签页网格项的 `card.raw` 已含 coverIndex/tags/downloads/summary/category。
- `SkillCard` 在 3:2 画幅下即 Creatify 视觉，无需再改其内部结构。
- 复用 `SkillCard` 而非复制样式。

## 证伪方式

- 若 `normalizeSkillItem` 的 `raw` 缺字段导致封面/描述缺失 → 在控制台打印 raw 并截图。
- 若 3:2 比例与工作台列宽不匹配（过矮/过高）→ 工作树浏览器截图比对图 2。
- 若样式类未注入（渐变/悬停失效）→ 检查 ensure 样式函数覆盖范围。

## 旧标准变更

- `plugins/omnimux/src/client/components/library-flow/masonry-layout.test.js` :: `cardRatioOf: 精准推导不同 lane 与不同分辨率数据`
  - 原断言：`cardRatioOf({ lane: 'skills' }) === 1 / 1`
  - 改的理由：`SkillCard` 视觉规范 `aspect-ratio: 3/2`，`cardRatioOf` 必须与之一致，否则瀑布流
    按 1:1 预留高度，会留出大片空白/挤压。
  - 新期望：`cardRatioOf({ lane: 'skills' }) === 3 / 2`
- `plugins/omnimux/tests/e2e/skills-lane-creatify-card.e2e.test.mjs` :: `UniversalLibraryCard 必须将 lane=skills 卡片分发到 SkillCard 并携带 category/index`
  - 原断言：`src.search(/card\.lane\s*===\s*['"]skills['"]/)`
  - 改的理由：实现用 `const lane = card.lane` 提前解构，断言匹配的是源文本形态，需改为 `lane === 'skills'` 才能命中。
  - 新期望：`src.search(/lane\s*===\s*['"]skills['"]/)`
- `plugins/omnimux-inspiration/src/explore/templates/home-skill-cards-aurora.test.js` :: `首页 Skills 技能库货架卡片：100% 对齐图 2 技能插件高颜值极光样式`
  - 原断言（3/4/5/6 段）：断言**严禁**渲染 `omnimux-creatify-card-top-left`/`omnimux-creatify-star-btn`/`omnimux-creatify-card-hover-drawer`/`omnimux-creatify-drawer-uses`、要求毛玻璃按键文案为「使用」。
  - 改的理由：用户新目标是把 Skills 卡完整复刻 Creatify（badge + 星标 + hover-drawer + 分类胶囊），且现在直接复用 `SkillCard` 组件——这些类名/文案正是 `SkillCard` 的标准实现，旧断言与新需求冲突。
  - 新期望：断言**必须**渲染 `omnimux-creatify-card-top-left`（含 badge）、`omnimux-creatify-card-hover-drawer`（含 uses）、分类胶囊、星标按钮；文案对齐 `SkillCard`（默认 zh「使用 Skill」）。

## 8. 不做

- 不改 SkillCard 内部结构、不改其他 lane、不改点击追加提示词语义。
- 不改 featured-skills.json 数据。
