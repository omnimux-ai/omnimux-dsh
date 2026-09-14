# 规格说明：会话输入框用量图标隐藏与模型按钮视觉收敛规范

- **任务编号**：Issue #1707
- **分支名称**：`agent/omnimux-composer-visual-issue-1707`
- **目标领域**：会话输入框底部操作栏视觉层（`conversation.input`）

---

## 1. 业务背景与用户诉求

用户在使用聊天界面时，提出以下三个直接视觉优化要求：
1. **隐藏会话用量进度图标**：隐藏输入框右下角发送按钮旁的环形进度图标（`ContextMeter`）及其弹出层，消除视觉噪音；
2. **修复模型选择按钮图标**：官方新版中硬编码了默认的“数据库齿轮”图标（`IconDataOutline16`），将其彻底隐藏，还原并生效 AI 专属的 **3D 立体模型层图标**；
3. **模型按钮默认无背景**：模型选择按钮默认保持纯透明（`background: transparent !important`），与左侧功能图标保持一致的极简通透风格，仅在 `:hover` 时提供轻柔交互反馈。

---

## 2. 界面与契约变更范围

### 2.1 会话用量进度图标（`styles.js`）
- 在 `HUB_CSS` 中补充精准防御性隐藏规则：
  - 隐藏 `.JdJrwG_root`、`[data-composer-card] [class*="trailing"] > span:has(button[aria-label*="上下文已用"])`、`[data-composer-card] [class*="trailing"] > span:has(button[aria-label*="context used"])`、`[data-composer-card] [class*="trailing"] button[aria-label*="上下文已用"]`、`[data-composer-card] [class*="trailing"] button[aria-label*="context used"]` 等选择器；
  - 设置 `display: none !important;`。

### 2.2 模型选择按钮（`composer-compact.js`）
- 隐藏官方原生的数据库齿轮图标：
  - `[data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerIcon"]` 以及 `svg:not([class*="chevron"])` 设为 `display: none !important;`；
- 确保 `::before` 伪元素正常渲染 `--omnimux-model-icon`（3D 立体模型层图标）；
- 默认无背景：
  - `[data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] { background: transparent !important; }`
  - `:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08)) !important; }`。

---

## 3. 验收标准

1. **样式断言**：
   - 单元测试验证 `HUB_CSS` 包含防御性隐藏上下文用量图标的规则；
   - 单元测试验证 `composer-compact.js` 包含模型按钮默认透明无背景、隐藏官方 `triggerIcon` 并渲染立体模型图标的规则。
2. **测试全绿**：
   - 相关单测全部通过；
   - 客户端构建与打包正常。
3. **真实浏览器验证**：
   - 包含 DOM 挂载和视觉渲染证据。
