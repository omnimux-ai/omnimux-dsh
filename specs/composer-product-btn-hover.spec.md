# 规格说明：对话输入框底栏「产品」按钮鼠标交互与视觉对齐

## 1. 业务背景与问题定义
- **问题现状**：在会话输入框底栏中，左侧的「产品」入口按钮（`.omnimux-composer-product-btn`）由于之前采用硬编码内联样式且缺乏动态交互类规则，在鼠标悬停（Hover）、点击按压（Active）及弹窗展开激活（Open）时没有任何视觉反馈，与右侧官方模型切换按钮（透明底色、胶囊微圆角、Hover 高亮、Active 响应）的交互风格不一致。
- **目标**：严格对标右侧模型切换按钮（Model Selector Trigger）的设计与交互规范，消除内联样式，为「产品」按钮补齐透明底色、悬停高亮、按压微反馈及激活态样式，保持输入框底栏控件交互语言的高度统一。

## 2. 交互与视觉验收标准 (AC)
- **AC-1（默认态）**：
  - 高度 28px，胶囊圆角（`border-radius: 24px`），无边框（`border: 0`），默认背景完全透明（`background: transparent`）。
  - 文本与图标颜色为次级文本色（`var(--dsw-alias-label-secondary)`），内边距 `0 8px`，字体大小 13px，字重 500。
  - 具备平滑过渡动画：`transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease`。
- **AC-2（悬停与激活态 Hover & Active）**：
  - 鼠标悬停（`:hover:not(:disabled)`）及弹窗打开时（`.is-active` / `[data-state="open"]`），背景呈现高亮胶囊底色（`var(--dsw-alias-interactive-bg-hover)`），文本与图标提升为主文本色（`var(--dsw-alias-label-primary)`）。
  - 鼠标点击按压（`:active:not(:disabled)`）呈现按压反馈底色（`var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover))`）。
- **AC-3（键盘无障碍 Focus-visible）**：
  - 键盘聚焦（`:focus-visible`）时展示外发光描边（`box-shadow: 0 0 0 2px var(--dsw-alias-border-l3)`），`outline: none`。
- **AC-4（设计规范门禁 UI01~UI10 合规）**：
  - 彻底移除硬编码内联样式（消除 UI02 违规）；
  - 零裸色硬编码（全部使用 CSS 变量与官方设计 Token，UI03 合规）；
  - 纯矢量 SVG 图标，零 Emoji（UI04 合规）；
  - 标准字阶 13px（UI10 合规）。
