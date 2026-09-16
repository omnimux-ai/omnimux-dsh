# 规格 · 右侧边栏展开不再强制伪全屏（Issue #2056）

## 1. 问题

在「左右侧边栏都收起」的前置状态下点击右上角「打开右侧边栏」，右侧面板被插件强行推到全屏（`data-sidebar-right-panel="fullscreen"`），中间会话栏被折叠为 0 宽。左侧栏展开且会话列表有选中行时，同样的点击却是正常三栏并排。

实测属性变更时序（开发版，CDP + MutationObserver）：面板展开 → 插件点击宿主全屏按钮 → 面板 `data-sidebar-right-panel="fullscreen"` → `data-omnimux-conversation-collapsed` 置位。因果方向是「先全屏，后折叠会话栏」。

## 2. 根因

`plugins/omnimux/src/client/workbench/tab-viewport-reconciler.js`：

1. 工作台页签的视窗偏好默认值即「全屏独占」：`focusRecordForTab` 首次读取时用 `resolveDefaultFocus(tabId)` 播种，工作台页签返回 `gui`；调和器再以 `record?.mode || WORKBENCH_FOCUS.gui` 兜底。
2. 唯一的例外出口是 `sessionSelected = Boolean(doc.querySelector('[role="treeitem"][aria-selected="true"]'))`，读的是左侧会话列表的**渲染结果**。左侧栏收起时该列表不渲染，恒为 `false`；列表可见但无选中行时同样为 `false`。

结论：右侧栏的显示方式被绑定在「左侧列表有没有选中行」这一与用户意图无关的渲染事实上。自动播种的默认值无法与用户亲手选择区分，是缺陷的结构性原因。

## 3. 决策

- **只有用户亲手选过视窗模式的页签才恢复其偏好**；自动播种的默认值不构成用户意图，按「并排分栏」处理。
- 在一个新字段 `explicit` 上区分两类记录，不改动 `resolveDefaultFocus`（其 `gui` 默认值由 Issue #2006 契约覆盖，属其他调用路径的既有产品决策）。
- 调和器不再读取左侧会话列表的任何渲染事实。
- 面板由「收起 → 展开」的那一次同步，一律呈现分栏：展开是一次「并排」意图，即使该页签有显式全屏记录也不在此刻占满整屏。

## 4. 验收标准

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| AC-1 | 未记录偏好的工作台页签，面板为 push | 不触发进入全屏，按下分栏健康宽度处理 |
| AC-2 | 未记录偏好的工作台页签，面板已是 fullscreen | 触发退出全屏，并清掉会话折叠键与快照键 |
| AC-3 | 用户在该页签亲手切到全屏（同页签模式变更） | 记录写入 `mode: gui` 且 `explicit: true` |
| AC-4 | 面板已展开，从一个页签切到「有显式全屏记录」的页签 | 触发进入全屏 |
| AC-5 | 面板处于收起态 | 调和器完全静默（不调用任何进出全屏动作） |
| AC-6 | 面板由收起转为展开（含页签有显式全屏记录） | 本次同步呈现分栏，不进入全屏 |
| AC-7 | 页面不存在 `[role="treeitem"][aria-selected="true"]` | 调和结果与存在选中行时完全一致 |

## 5. 影响面

- `plugins/omnimux/src/client/workbench/focus-state.js`：记录播种新增 `explicit: false`。
- `plugins/omnimux/src/client/workbench/tab-viewport-reconciler.js`：目标模式判定、展开过渡处理、用户手势写入标记、删除会话列表选中态依赖。
- `plugins/omnimux/src/client/workbench/tab-viewport-reconciler.test.js`：按新契约重写旅程用例。

历史遗留记录（无 `explicit` 字段）自动按分栏处理，不构成迁移负担。

## 6. 非目标

- 不改 `resolveDefaultFocus` 的返回值，不改左栏入口点击的聚焦策略。
- 不改宿主面板的 `setMode` 实现或壳层网格列计算。
- 不改 `data-omnimux-conversation-collapsed` 的置位规则。
