# Spec · 精灵助手会话输入栏模型面板列表布局样式隔离与修复

- **Scope**:
  - `plugins/omnimux-browser/extension/src/panel/styles.css`
  - `plugins/omnimux-browser/extension/tests/e2e/model-picker-layout.e2e.spec.ts`
- **Status**: Approved for implementation

---

## 1. 背景与问题定位

### 1.1 现状与用户问题
在精灵助手（OmniMux 浏览器扩展）的会话输入框左下角点击模型选择胶囊（如 `Devin SWE-2 ^`）展开上浮面板时：
- 面板内的模型列表项被严重挤压，10 个模型项并排挤成一横排约 28px 的深色小圆角方块；
- 每个方块内只有小图标，模型名称和副标题完全被隐藏或挤压消失；
- 无法正常进行模型阅读、比较与纵向滚动选择。

### 1.2 根因分析
1. **外层选择器样式深度污染**：
   - 会话输入框操作区最外层定义了 `.composer-actions button`（`width: 28px; height: 28px; display: inline-flex; padding: 0; ...`）；
   - `.amp-wrap` 作为 `.composer-actions-start` 的后代，其弹出的浮层面板 `.amp-panel` 也在 `.composer-actions` 内；
   - `.composer-actions button`（权重 0, 0, 2, 1）无限制穿透了浮层面板内部的所有 `<button>`，包括模型行 `.amp-row` 和开关 `.amp-switch`；
   - 导致 `.amp-row` 原本声明的 `width: 100%; min-height: 44px; display: flex;` 被 28px × 28px 的 `inline-flex` 强制覆盖，所有按钮在横向以流式并排挤在一行。
2. **浮层选择器缺乏防御性隔离**：
   - `.amp-row` 仅以单类选择器（权重 0, 0, 1, 0）声明，无法防御祖先高权重选择器的侵入。

---

## 2. 验收标准（Given / When / Then）

1. **模型列表垂直整齐排列**：
   - Given: 用户在精灵助手输入框中点击展开模型选择面板。
   - When: 面板在手动模式下展开显示模型列表。
   - Then: 每一个模型条目独立占据一行（`width: 100%`，`min-height: 44px`），垂直向下排列；左侧清晰展示 20px 品牌图标，中间完整展示模型大名称和说明副标题，右侧选中时展示对勾，不得挤压为横向小方块。
2. **样式边界严格隔离**：
   - Given: 任何外层 `.composer-actions button` 或全局按钮通用样式变化。
   - When: 渲染浮层面板 `.amp-panel`。
   - Then: 浮层内部的所有操作元素（`.amp-row`、`.amp-switch`）完全免疫外层尺寸和 flex 规则，保持独立的浮层面板设计规范。
3. **回归与真实浏览器验证**：
   - 保证既有自动/手动切换单元测试全绿；
   - 真实浏览器实机渲染截图留证，确认视觉层面对齐。

---

## 3. 修改计划

1. `plugins/omnimux-browser/extension/src/panel/styles.css`：
   - 将 `.composer-actions button` 增加 `:not(.amp-panel *)` 排除，防止穿透浮层。
   - 在 `.amp-panel` 作用域下，使用高特异性选择器显式加固 `.amp-panel button.amp-row` 和 `.amp-panel button.amp-switch` 的几何尺寸（`width: 100%`, `height: auto`, `min-height: 44px`, `display: flex`, `flex-direction: row`）。
   - 确保 `.amp-list` 显式具有 `display: flex; flex-direction: column; gap: 2px;` 保证列表永远纵向排列。
2. 增加端到端测试覆盖并用真实浏览器（ego-browser）复检留存证据。
