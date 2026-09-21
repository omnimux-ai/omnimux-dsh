# 一级入口全屏预演证据（Issue #2516）

日期：2026-09-21
规格：`specs/primary-entry-fullscreen.spec.md`
工作树：`.worktrees/omnimux-primary-entry-fullscreen`
预演页：`docs/evidence/primary-entry-fullscreen-demo.html`
浏览器：ego-browser TaskSpace 20

## 路径与结果

| 步骤 | 截图 | 布局 |
|---|---|---|
| 点应用 | `primary-entry-fullscreen/01-open-app-fullscreen.png` | 右侧全屏 |
| 点资产库 | `primary-entry-fullscreen/02-open-assets-fullscreen.png` | 右侧全屏 |
| 再点应用（图 1） | `primary-entry-fullscreen/03-reopen-app-still-fullscreen.png` | 仍是右侧全屏 |
| 打开聊天 | `primary-entry-fullscreen/04-open-chat-three-column.png` | 三栏 |
| 点另一个无记忆页面 | `primary-entry-fullscreen/05-other-page-fullscreen.png` | 右侧全屏 |
| 再点记过聊天的应用 | `primary-entry-fullscreen/06-remembered-three-column.png` | 三栏 |
| 新对话 | `primary-entry-fullscreen/07-new-session-fullscreen.png` | 会话全屏 |
| 点记过三栏的旧会话 | `primary-entry-fullscreen/08-old-session-three-column.png` | 三栏 |
| 从右侧全屏点无记忆会话 | `primary-entry-fullscreen/09-session-from-page-fullscreen.png` | 会话全屏 |

结论：图 1 再次打开仍全屏；新对话不继承三栏；点会话必须看见聊天。
