# 规格：点击会话消息确定性恢复会话栏与自适应布局保障

## 一、背景与问题陈述
用户反馈在右侧栏全屏或打开插件页面时，在左侧栏点击会话消息（`[role="treeitem"]`），会出现以下两个严重问题：
1. **会话栏未出现**：中间会话栏被压制在 0 像素（`convW: 0`），没有展开呈现，用户无法查看和参与对话；
2. **出现后布局挤压变形**：有时会话栏展开后，右侧工作台没有自适应收缩或退出全屏，导致会话栏被挤在狭窄的半屏中，输入框与工具栏排版变形。

## 二、根因分析
1. **退出全屏按钮选择器误匹配**：
   `HOST_FULLSCREEN_EXIT_SELECTORS` 中包含 `'button[aria-label="分栏"]'`。
   在实际 DOM 中，`button[data-dockkit-split-button]` 的 `aria-label` 正是“分栏”（其作用是在右栏内部切分窗格），导致点击退出全屏时误点了内部窗格切分按钮，根本没有退出右侧栏的全屏模式！
2. **折叠状态读数未与 DOM 属性对齐**：
   全屏态下会话栏的折叠由 `fullscreen-collapse-sync` 直接在 DOM 上设置 `data-omnimux-conversation-collapsed`，而内存中的 `api.getConversationCollapsed()` 返回 `false`。
   `ensureConversationVisible` 只读取了 `api.getConversationCollapsed()`，误判为未折叠，导致跳过了清除折叠属性的动作，中间会话栏依然被 CSS 规则死死锁定在 `0px`！
3. **调和器在进入会话手势时反向误拉全屏**：
   `tab-viewport-reconciler` 检测到面板变为 `push`，但此时右侧依然激活着偏好为全屏的 Tab，调和器反向将面板再次推回全屏，把刚弹出的会话栏重新收起。

## 三、修复方案
1. **精准收敛退出全屏按钮选择器**：
   严禁将 `button[data-dockkit-split-button]` 误判为退出全屏按钮；严格匹配 `button[data-sidebar-right-mode="push"]`、`button[data-sidebar-right-mode="split"]`、`button[aria-label="退出全屏"]`、`button[aria-label="Exit fullscreen"]`。
2. **全方位清除折叠状态**：
   `ensureConversationVisible` 必须同时检查 DOM `data-omnimux-conversation-collapsed` 属性与内存状态；在进入会话意图触发时，物理移除该属性与快照属性，并调用 `api.setFocus('split')` 确保会话列恢复 `1fr` 弹性宽度。
3. **会话手势优先**：
   在会话列表项被选中（`SESSION_ROW_SELECTOR` 命中且会话可见）时，会话优先，调和器绝对不得将工作台反向推回全屏。
