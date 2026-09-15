# 规格：消除左侧栏收起后的黑边空白死区（纯会话与分屏全场景置零）

## 1. 背景与根因定位
在桌面端实机观察中，用户收起左侧侧边栏时，虽然侧边栏内的导航元素被隐藏，但左侧依然残留一条约 56-90px（macOS 交通灯保护区）宽度的深色黑边空白列，导致会话内容未能贴左展开。

**精确根因**：
1. 桌面端应用中，右侧面板容器节点（`[data-sidebar-right-panel]`）常驻在 DOM 中（即使处于关闭折叠状态，无 `data-sidebar-right-open` 属性）；
2. `conversation-box.js` 中左侧收起的网格首列置零规则均携带了 `:not(:has([data-sidebar-right-panel]))` 排除条件；
3. 由于常驻面板节点的存在，导致所有左侧收起置零规则全量失效，首列网格退回到宿主或既有规则声明的宽度（90px 或 280px），形成左侧死黑空白条；
4. 修复方式：废除 `:not(:has([data-sidebar-right-panel]))` 条件，在左侧收起态下对网格首列执行无条件物理置零（0px），并在纯会话模式（右侧栏折叠）下确保会话列占满全部 100vw 视口宽度。

## 2. 验收标准（AC）
- AC-1：左侧侧边栏收起时（`data-sidebar-collapsed` 或 `html[data-omnimux-left-collapsed]`），无论 DOM 中是否存在 `data-sidebar-right-panel` 节点，首列轨道宽度严格置为 `0px !important`。
- AC-2：在纯会话模式（右侧栏关闭 `data-rightbar-collapsed="true"` 或未打开）下，中间会话栏从视口左缘（x=0）铺满 100vw，彻底消除左侧任何黑边。
- AC-3：在分屏模式（右侧面板打开 `data-sidebar-right-open`）下，中间会话栏紧靠左缘（x=0，宽 440px），右侧面板铺满剩余视口宽度（`calc(100vw - 440px)`）。
- AC-4：展开左侧栏时，完整平滑恢复原有布局，无视觉破坏与测试回归。
