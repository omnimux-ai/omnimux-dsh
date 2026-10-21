# #3497 立即复刻展开会话栏 · 交付证据

- Issue：#3497；基线 `51b7e470a4c8e55c696bbf6ec321db2667fe7131`
- 工作树：`.worktrees/reveal-conversation-issue-3497`

## 根因

账号监控的 `revealConversation` 只调 `setConversationCollapsed(false)` + `setFocus('split')`。宿主右侧栏全屏时插件折叠键本就是 false，旧链路无动作，会话仍被全屏挡住。内核官方 `ensureConversationVisible()` 会先退出宿主全屏，灵感库/合集已使用。

## 改动

- `rival-add-to-chat.revealConversation(workbench, windowObject)` 优先无参 `ensureConversationVisible()`；异常/缺失回退旧 collapse+focus；0/50ms 重放；异常静默不阻断附件成功。
- 调用点传入 window；新增单测：ensure 优先、ensure 抛错回退、旧行为保留。

## 真实浏览器证据

- 真实 `RivalTimelineRow` + 真实 `revealConversation`，假宿主 workbench：初始宿主 fullscreen、会话宽 1；点「立即复刻」后 fullscreen=false、会话宽 41、附件文案出现；调用序列 ensure×3（0/50ms 重放），未走 fallback。
- 截图：`browser-reveal-conversation-3497.png`；事实：`browser-facts.json`。

## 离线检查

| 检查 | 结果 |
| --- | --- |
| 插件核心套件 | 1733 / 1733 通过，0 fail，0 skip，0 外连 |
| stage contracts | PASS（14 Stage / 8 sidebar） |
| anti-slop | 3/3 |
| scan-ui-gates | 与 main 同为 7 条既有违规（其它插件），inspiration 0 |
| build-client | 成功，2,429,109 bytes |

## 边界

- 只改账号监控 rival 露出调用链；附件 payload、当前会话/新会话语义、Tab/画布/发送行为不变。
- 拆解弹窗的 replicate 未改，保留原 split 语义（避免新会话全屏回归）。
- 真机需 Dev 复验：主导航全屏态点账号监控「立即复刻」应退出全屏并出现会话栏。
