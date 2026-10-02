# 规格：会话栏「自动」面板裁剪修复 + 触发器纯文本样式 (Issue #2972)

## 一、问题定义

Issue #2966 交付后真实插件侧栏实测两处缺陷：

1. **面板不显示**：点击「自动」按钮无面板弹出。根因：`.composer-actions-start > span { overflow: hidden }` 作用于 `.amp-wrap`，把其绝对定位子节点 `.amp-panel`（bottom: calc(100% + 8px)）整体裁剪——面板已渲染但剪裁到 span 盒内不可见。
2. **触发器样式不符要求**：当前为胶囊按钮（边框 + 底块 + 999px 圆角），用户明确要求仅保留「文本 + chevron」、无胶囊外观。

## 二、修复方案

- 面板可见性：新增同级后置选择器 `.composer-actions-start > .amp-wrap { overflow: visible }`，覆盖原 `> span` 的 `overflow: hidden`；不动原规则。
- 触发器纯文本化：移除边框、底块背景、999px 胶囊圆角；保留透明背景、hover 变色、focus ring、按压缩放、chevron 旋转与手动态品牌图标。

## 三、用户操作旅程与验收

1. 点击「自动」→ 上浮模型面板立即可见（标题「模型」+ 自动开关 + 说明；开关 OFF 时模型列表）。
2. 触发器呈现为「自动 ⌄」纯文本（手动态「品牌图标 + 模型名 ⌄」），无边框无底块。
3. 面板交互不变：外点/Esc/点选关闭并回焦触发按钮。
4. 回归：既有 `auto-model-picker.spec.ts` 16 例不回退；构建 `vite build --config vite.panel.config.ts` 通过。
