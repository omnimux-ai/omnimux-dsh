# Verify · float dock sidepanel (#2117)

- time: 2026-09-17T00:16:39+0800
- conclusion: PASS
- unit: float-dock 4/4；session continuity 相关通过

## Journey
1. 悬浮窗内点发送：用户手势内 open 原生右侧边栏 + 收起悬浮窗（不立刻 unload）
2. session.create/active 与 session.prompt 由当前悬浮面板完成
3. prompt 入队后 unload 悬浮 iframe，只留原生边栏
4. background session.active 刷新 resume-hint；同窗口 sibling 会话优先
5. 页面刷新后原生边栏会话仍在
