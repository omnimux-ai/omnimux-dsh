# 规格说明：模型选择按钮前置图标遮罩缺失与白色方块根治规范

- **任务编号**：Issue #1719
- **分支名称**：`agent/omnimux-model-icon-mask-issue-1719`
- **目标领域**：会话输入框模型选择按钮视觉层（`conversation.input.model`）

---

## 1. 问题背景与根因定位

在输入框全宽模式下，模型选择按钮前置图标由于以下原因退化为实心白色小方块：
1. 原 `--omnimux-model-icon` 变量只声明在 `button::before` 伪元素内部，普通子 DOM 元素（如 `[class*="triggerIcon"]`）无法继承伪元素中的局部变量；
2. 样式对 `[class*="triggerIcon"]` 设置了 `background-color: currentColor !important;`，但在 mask 路径为空（`none`）时，直接退化为实心纯色填充矩形；
3. 需要将 `--omnimux-model-icon` 提升至 `[data-composer-card]` 全局卡片作用域，并在 `triggerIcon` 上显式内联该遮罩路径，确保 100% 渲染为清晰的 3D 立体模型层细线条。

---

## 2. 变更设计

1. 在 `composer-compact.js` 根部将 `--omnimux-model-icon` 声明在 `[data-composer-card]` 容器上；
2. 在 `[data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerIcon"]` 上直接内联完整遮罩路径，并设置 `mask-type: alpha`，杜绝任何变量丢失导致的纯色填充；
3. 保留默认透明无背景（`background: transparent !important`），保证视觉通透；
4. 单元测试与端到端测试覆盖遮罩变量与真实 DOM 渲染。

---

## 3. 验收标准

1. `composer-compact.js` 包含在 `[data-composer-card]` 作用域的 `--omnimux-model-icon` 定义；
2. `[class*="triggerIcon"]` 遮罩路径有效，不出现任何未遮罩的纯色方块；
3. 单元测试与端到端测试 100% 通过。
