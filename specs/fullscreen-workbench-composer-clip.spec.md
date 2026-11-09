# Spec: 全屏右栏下底部输入框不被裁切

- 任务：`omnimux-fullscreen-composer-clip`
- 日期：2026-11-09
- 状态：active

## 目标

修复宿主右侧栏处于 `fullscreen` 时，`computeChromeLayout` 仍把上次分栏比例（约 670px）写成 `--omnimux-conversation-width`，导致 610px 宽的输入框延伸到右栏面板下面、右半部分被裁切的问题。全屏右栏按宿主契约保留 360px 会话窄栏，输入框应在该窄栏内完整显示。

## 用户操作旅程与期望反馈

1. 在项目库成功打开项目后，右栏项目/画布 tab 以全屏显示；底部输入框完整可见、可点击、无被面板覆盖的半截。
2. 全屏时 `--omnimux-conversation-width` 使用 360px 会话窄栏，而不是上次分栏的 670px。
3. 分栏模式仍保留 360px 会话最小宽度与 split max 夹紧。

## 假设

- `data-sidebar-right-panel="fullscreen"` 是宿主官方全屏真源；全屏右栏保留 360px 会话窄栏，面板宽度仍由 shell 的 split max（1088px）决定。
- 全屏时 `computeChromeLayout` 必须把 stale split ratio 夹到 `CONVERSATION_MIN_CHAT_PX`，不能把 670px 写进 `--omnimux-conversation-width`。
- 不改变正常分栏拖拽与 360px conversation floor。

## 证伪方式

- 构造带 `[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]` 的 DOM，调用 `computeChromeLayout`，若 `conversationWidth` 仍是约 670px 而不是 360px，则修复失败。
- 在真实 Dev 全屏右栏页面测量 `[data-composer-card]`：若 `elementFromPoint` 的右侧区域仍命中 `react-flow__pane` 而非 composer，则 UI 仍被裁切。
- 分栏模式回归测试 `syncSplitMaxCssVar writes the live split ceiling` 仍须通过。

## 验收标准

- `plugins/omnimux/tests/e2e/fullscreen-rightbar-composer.e2e.test.mjs` 新增全屏 360px 用例通过。
- 既有 workbench / 顶栏测试全绿。
- Dev 页面全屏右栏时输入框完整可见（真实渲染截图/元素命中证据）；分栏模式不回归。

## 边界

- 只调整客户端 split-width 上限判定，不改宿主全屏实现、不改输入框业务功能、不改模型目录。
