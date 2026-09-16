# Spec: 悬浮窗自动化前强制切到原生右侧边栏

## Objective

浏览器插件「网页悬浮窗」挂在页面 DOM 内。自动化一旦触发刷新/跳转，悬浮窗与会话 UI 会被整页销毁。  
目标：在用户发送（即将进入可触发浏览器自动化的回合）时，**强制**打开 Chrome 原生右侧边栏并收起悬浮工作台；边栏不随页面刷新销毁，同一会话可续接。

## Success criteria

1. 悬浮窗模式下点击发送：在同一用户手势内调用 `chrome.sidePanel.open`，并 `COLLAPSE_WORKSTATION` 收起悬浮工作台。
2. 发送路径会 `session.active` 绑定当前页；后台向同窗口其它面板推送 `session.resume-hint`，原生边栏接管同一 `sessionId`。
3. 原生边栏已打开时再次发送：仍幂等 open + collapse，不新建无关空会话抢焦点。
4. 顶栏「切换到原生右侧边栏」按钮与发送路径共用同一 dock 辅助函数。
5. 相关单测通过（dock 辅助 + 发送时调用 + session.active 后刷新 hint）。

## Non-goals

- 不禁止日常浏览仍用悬浮窗。
- 不改 bridge 协议、不改工具授权策略。
- 不在无用户手势的纯 background 工具回调里依赖 `sidePanel.open`（Chrome 会拒绝）。

## Design

| 落点 | 行为 |
| --- | --- |
| `panel/float-dock.ts`（新） | `dockFloatToNativeSidePanel()`：sync open sidePanel + postMessage collapse |
| `panel/App.tsx` `send()` | `isFloatMode` 时在任何 `await` 之前调用 dock |
| `panel/App.tsx` 顶栏按钮 | 改为调用同一 helper |
| `background` `session.active` | 绑定后 `refreshPanelResumeHints()`，让新开边栏吃到同一会话 |
| 边栏 `onSessionResumeHint` | 已有「sessionRef === null → initializeSession」；保持；必要时在空会话时采纳 hint |

## Testing strategy

- 单测：`float-dock` 调用 open + postMessage。
- 单测或轻量模块测：`session.active` 路径触发 resume-hint 广播（沿用 background-session-continuity 风格 mock）。
- `pnpm --filter omnimux-browser…` / extension `vitest` 相关文件全绿。

## Boundaries

- Always: 用户手势内 sync open；会话经既有 `session.active` / page context 续接。
- Ask first: 改默认打开方式（彻底废弃悬浮窗）。
- Never: 直推 main；改官方 harness；提交密钥。
