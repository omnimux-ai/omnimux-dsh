# 项目管理模态对话框对标设计规范规格说明

- 工作区：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-modal-dialog-polish`
- 分支：`agent/workflow-modal-dialog-polish`
- 日期：2026-09-17
- 目标：全面淘汰项目库中粗暴的原生系统弹窗（`window.prompt` 与 `window.confirm`），对齐《OmniMux UI 设计规范》（`design.md` v2.0 §5.5）

## 1. 问题陈述

1. **项目与创作页重命名**：目前采用浏览器原生 `window.prompt`，在暗黑模式下呈现高反差白底系统对话框，输入体验割裂；
2. **删除创作页**：采用浏览器原生 `window.confirm`，缺乏对破坏性操作的危险视觉警示与规范确认层；
3. **新建资产文件夹**：同样采用 `window.prompt`，与整个现代桌面端体验脱节。

## 2. 规范对标要求（单一真源：design.md §5.5）

1. **模态弹窗外壳（ModalDialog）**：
   - 宽度 `min(480px, calc(100vw - 48px))`，圆角 `16px`，背景 `var(--dsw-alias-bg-elevated)`；
   - 遮罩层：Fixed 全屏，背景 `var(--dsw-alias-bg-mask-1)`，带 `backdrop-filter: blur(8px)`；
   - 底部行动栏：右对齐，间距 8px，包含取消（Secondary）与确认（Primary / Danger）按钮；
2. **输入型模态框（PromptModal）**：
   - 统一封装为组件内受控弹窗，包含文本输入框（InputField，32px 控件高、8px 圆角）；
   - 支持回车键直接提交、Esc 键或点击右上角/遮罩关闭取消；
   - 自动聚焦输入框，并预选现有名称；
3. **确认型模态框（ConfirmModal）**：
   - 删除创作页接入规范的 `ConfirmModal`（红色的危险确认按钮，语义清晰）。

## 3. 验收标准

- **AC-1**：项目库中彻底消除 `window.prompt` 与 `window.confirm` 调用。
- **AC-2**：重命名项目、重命名创作页、新建文件夹均使用深色毛玻璃 `PromptModal`。
- **AC-3**：删除创作页使用规范的 `ConfirmModal` 危险确认弹窗。
- **AC-4**：单元测试与 E2E 契约测试 100% 通过，UI01~UI10 静态门禁 0 违规。
