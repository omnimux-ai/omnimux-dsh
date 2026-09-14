# 规格说明：推特首页常驻发帖框输入定位与文案注入修复 (Twitter Home Injector Fix)

## 1. 业务痛点与问题定义
- **问题现象**：
  用户在推特首页（`https://x.com/home`）点击小幽灵助手生成文案后，提示“未找到推特输入框，且剪贴板访问受限”，输入框没有任何文字注入，表现为“点击后毫无反应”。
- **根因剖析**：
  推特首页发帖框是常驻内联编辑区，非弹窗（无 `role="dialog"` 祖先）、非 `<form>` 且非 `<article>`；小幽灵按钮挂载在底部的工具栏（`data-testid="toolBar"`）内。
  `injector.ts` 旧有逻辑仅匹配 `closest('[role="dialog"]')`、`closest('form')`、`closest('article')` 及一层直接父节点，无法覆盖跨越 6 层 div 的常驻发帖大容器，导致 `container` 与 `targetArea` 均返回 `null`。

---

## 2. 详细接口与实现契约 (`injector.ts`)

### 2.1 向上逐级祖先回溯算法
当传入 `anchorButton` 时：
1. 沿 `anchorButton.parentElement` 向上回溯（不超过 `document.body`）；
2. 对每个祖先节点检查其是否包含有效的推特富文本输入框：
   `div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"]`；
3. 一旦命中，立即锁定该祖先所包含的第一个输入框作为目标输入框；
4. 若回溯未命中，安全回退到当前获得焦点的输入框，或页面上唯一的 `div[data-testid="tweetTextarea_0"][role="textbox"]`。

### 2.2 文本注入与发帖按钮点亮
- 对找到的目标输入框执行原生 `ClipboardEvent('paste')` 模拟注入；
- 若内容未变化，回退到 `execCommand('insertText')` 与 `InputEvent` 派发；
- 触发推特 React 状态同步，点亮“发帖/回复”按钮。

---

## 3. 验收标准
1. **算法覆盖性**：在常驻发帖区（非弹窗）、弹窗发帖区、推文详情回帖区均能 100% 精准定位到输入框；
2. **实机验证**：在 ego-browser 实机访问 `https://x.com/home`，模拟点击小幽灵助手生成并注入，输入框成功填入文本且“发帖”按钮点亮（`disabled === false`）；
3. **单元测试与回归**：`tests/twitter-copilot.spec.ts` 专项用例通过。
