# 「加入会话」复用立即复刻的会话栏激活机制（Issue #3422）

## 授权与范围

用户实测：点「立即复刻」能激活会话栏，点合辑卡「加入会话」在会话栏未打开时无法激活，并要求复用「立即复刻」相同的方式。修复仅限 `plugins/omnimux-inspiration` 客户端「加入会话」的会话栏展开逻辑与测试/证据；不改官方 DSH 宿主、不改立即复刻代码、不改合集数据与文案。

基线 `origin/main`（含 #3420 追加行为）。

## 现象与根因

当前 `collection-to-chat.js` 的展开只调用 `setConversationCollapsed(false)` + `setFocus('split')`，且在异步读取合集成员之后才调用。会话栏不可见有两层状态：插件折叠键与**宿主右侧栏全屏**（官方 `surface.layout.mode === 'fullscreen'`）。只清折叠键无法退出宿主全屏，表现为「点了没反应」。「立即复刻」能生效是因为它先点击官方「新会话」，由宿主自己的 UI 打开会话栏。

## 与 #3420 / #3411 契约的关系

本规格取代 #3420 中「先读取合集成员、再 `setConversationCollapsed(false)` + `setFocus('split')`」的展开顺序与机制：点击后立即展开，并优先走 `ensureConversationVisible`。append 语义（保留原草稿/附件、空行追加、不发送、失败显式）与 #3411 的对比度/不覆盖原则保持不变。由于先展开后读取，成员读取失败/空合集/不可追加状态时会话栏已展开属于预期；`ensureConversationVisible()` 不传 sessionId，保持「退出宿主全屏 + 清折叠键 + split」而不是切到会话全屏，灵感库 Stage 与其 toast 仍可见。

## 确定行为

- 展开会话栏复用 hub 官方唯一入口 `window.__omnimuxWorkbench.ensureConversationVisible()`（**无参**）：退出宿主右侧栏全屏、清插件折叠键并保持 split 布局（不切会话全屏，灵感库 Stage 与失败 toast 仍可见）；接口不可用时回退 `setConversationCollapsed(false)` + `setFocus('split')`（与立即复刻同款调用）。
- 点击后**立即**展开（在读取合集成员之前触发），并在 0ms / 50ms 重放，覆盖 React/宿主布局收敛窗口（与 `replicate-to-chat` 的 replay 一致）。
- 仅在解析出有效当前会话时展开；无会话仍提示不打开。
- 展开不发送消息、不覆盖草稿、不改合集数据；追加行为沿用 #3420（mode: append）。
- 单测覆盖：优先 ensure、无 ensure 回退、展开早于成员读取、无会话不展开；E2E 覆盖「会话栏收起 → 点击 → 会话栏展开 + 草稿追加」。

## 验收与先后顺序

先落本规格，再实现 + 单测；随后工作树真实浏览器证据（会话栏收起态点击后展开且草稿追加；ensure 被调用）；证据落盘后更新 E2E 多轮跑绿；最小静态门禁、独立评审、PR/Merge Queue、主干同步、开发版物化与工作区清理。Dev 45120 最终观感归用户确认，Agent 不把 Dev 诊断冒充验收证据。
