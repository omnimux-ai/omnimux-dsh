# 规格说明：浏览器插件选中文本组件悬停预览遮挡修复与关闭按钮悬停显隐优化

## 1. 业务目标与背景
用户在浏览器插件使用过程中反馈：
1. 选中的文本胶囊组件在鼠标悬停时本应展示预览浮层（引用原文），但由于输入框父容器存在溢出隐藏限制，导致浮层被边界截断遮挡，无法正常查看。
2. 选中文本胶囊上的关闭按钮「×」原为常驻显示，占用胶囊内部空间且右侧留白不协调，需优化为平时隐藏、鼠标悬停时才展示。
3. 严格遵循产品设计规范中的极简黑白高对比美学，彻底杜绝滥用紫色。

## 2. 关键验收标准与指标

### 2.1 悬停预览浮层无遮挡与展示增强
- **解除父容器裁剪**：输入框容器（`.composer-box` 及 `.composer-box.clean-chat-box`）设置 `overflow: visible`，确保子元素绝对定位的浮层自由向外弹出。
- **层叠上下文保障**：`.composer` 设置 `position: relative; z-index: 20`，浮层设置 `z-index: 50`，保证浮层完全位于消息列表与页面其它元素之上。
- **浮层视觉与纯黑白极简风格**：
  - 彻底移除任何紫色色值（如旧版 `#b8c5ff`、`#818cf8` 等）。
  - 浅色模式（Light）：背景纯白 `var(--surface)`，左边框为墨黑纯色高对比线条 `3px solid var(--ink)`，边框 `1px solid var(--line-strong)`，阴影柔和 `var(--shadow)`。
  - 深色模式（Dark）：背景深墨 `#18181b`，左边框为高光白线条 `3px solid rgba(255, 255, 255, 0.85)`，边框 `1px solid rgba(255, 255, 255, 0.12)`，字体白色 `#f3f4f6`，深邃弥散阴影。
  - 展示能力提升：支持多行展示（最高 4 行，允许滚动），`max-height: 120px; overflow-y: auto`。

### 2.2 胶囊关闭按钮交互升级（悬停才显示）
- **平时未悬停态**：
  - 关闭按钮 `width: 0; opacity: 0; margin-left: -4px; pointer-events: none; overflow: hidden;`，完全不占据视觉与点击空间。
  - 胶囊左右边距均等（`padding: 2px 7px`），整体小巧圆润，消除视觉噪音。
  - 杜绝紫色：浅色下使用中性半透明浅灰黑底 `var(--blue-wash)`，深色下使用中性深色半透明底 `rgba(255, 255, 255, 0.08)`，边框 `rgba(255, 255, 255, 0.14)`。
- **悬停态（:hover / :focus-within）**：
  - 鼠标移动到胶囊上或获得焦点时，关闭按钮平滑过渡至 `width: 15px; opacity: 1; margin-left: 0; pointer-events: auto`。
  - 鼠标悬停到关闭按钮本身时，背景具有轻微高对比悬停反馈。
  - 单击关闭按钮可立即取消并移除当前选中文本。

## 3. 影响范围
- `plugins/omnimux-browser/extension/src/panel/styles.css`
- 相关的单元测试（`plugins/omnimux-browser/extension/tests/panel-selection-composer.spec.ts`）。
