# 规格：资产中心「AI生成」页签、动作行「去生成」按钮与卡片尺寸规范收敛（Issue #2598）

## 1. 业务目标与背景
用户在资产中心浏览生成素材时，提出三项关键体验优化诉求：
1. **页签更名**：将资产中心第四个页签从「生成的」重命名为「AI生成」，与业务意图对齐；
2. **新增操作按钮**：在「AI生成」页签上方操作行（Action Row）增加像本地/公共页签图 2 样式一致的白底黑字主按钮「去生成」，点击直达「图像生成」工作台；
3. **修复卡片过度放大**：此前生成素材网格缺少单列最大宽度约束，在仅有 1 张或少量素材时，高分辨率媒体卡片被撑大至整屏宽（铺满视口）；需严格对齐「本地/公共」资产卡片的视觉规格，单张卡片最大宽度收敛在 260px~320px 之间，杜绝横向过度拉伸。

## 2. 影响范围
- `plugins/omnimux-assets/src/client/locales.js`：更新字典词条 `source.generations` 为「AI生成」，新增 `generations.createButton` 词条「去生成」；
- `plugins/omnimux-assets/src/client/AssetsStage.jsx`：
  - 更新 `AssetsActionRow` 支持 `sourceTab === 'generations'` 渲染「去生成」主按钮（`variant="primary"`，带 `PlusIcon`），点击后通过 `window.__omnimuxWorkbench` 调起 `omnimux:media-viewer`；
  - 更新页签配置 `{ id: 'generations', label: t('source.generations') || 'AI生成' }`；
- `plugins/omnimux-assets/src/client/styles.js`：
  - 更新 `.omnimux-generations-grid` 为标准 CSS Grid 布局：`display: grid !important; grid-template-columns: repeat(auto-fill, minmax(260px, 300px)); gap: 12px; justify-content: start;`；
  - 限制 `.omnimux-generation-card` 最大宽度 `max-width: 320px;`；
- `plugins/omnimux-assets/src/client/GenerationsIntegration.test.js`：同步测试断言与契约校验。

## 3. 新用户基线 (Product Baseline)
在全新安装并签入的环境中，资产中心无需任何特殊配置：
- 打开资产中心，第四个页签文字恒定为「AI生成」；
- 切换至「AI生成」页签，顶栏操作行展示「+ 去生成」白底黑字主按钮；
- 当生成素材列表仅有 1 项时，该卡片稳定呈现为 260px~300px 标准宽度，绝不出现整屏拉伸放大。

## 4. 验收准则 (Acceptance Criteria)
- **AC-1（页签文案对齐）**：资产中心顶部 Tab 栏第四项文本严格显示为「AI生成」（英文为「AI Generations」或「Generations」）。
- **AC-2（动作行按钮展示）**：切换到「AI生成」页签时，标题下方操作行渲染白底黑字主按钮「+ 去生成」，其高度、内边距、字体、图标规格与「本地」页签下的「+ 添加资产」一致。
- **AC-3（点击打开图像生成页）**：点击「去生成」按钮后，正确调用工作台公开通道打开 `omnimux:media-viewer`（图像生成页面）。
- **AC-4（卡片最大尺寸约束）**：无论生成素材数量为 1 件还是多件，网格中单个 `.omnimux-generation-card` 的物理宽度恒定限制在 `320px` 以内，媒体封面比例正常，不发生整屏拉伸。
- **AC-5（单元测试与回归 100% 绿灯）**：`pnpm --filter @deepseek-ai/omnimux-assets test` 全部通过。
