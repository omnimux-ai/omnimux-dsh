# 规格：从分栏页面切换至全屏工作台页面时视窗调和恢复机制

- 任务单号：Issue #2044
- 目标模块：`plugins/omnimux`
- 实施分支：`agent/omnimux-cross-page-reconciler-issue-2044`

## 一、背景与问题排查

在多页面切换测试中，发现当用户在「项目」页切换为分栏（`push`）模式后，再点击左侧入口切到「资产库」（该页面独立偏好为全屏 `gui`）时，未能自动进入全屏模式，仍停留为 `push` 分栏。

排查 `tab-viewport-reconciler.js` 发现：
```js
const sessionSelected = Boolean(doc.querySelector?.('[role="treeitem"][aria-selected="true"]'))
const convVisible = !doc.documentElement?.hasAttribute?.('data-omnimux-conversation-collapsed')
if (sessionSelected && convVisible && targetMode === WORKBENCH_FOCUS.gui && currentMode === 'push') {
  return
}
```
由于当前会话在应用左侧树中本就处于常驻选中状态（`sessionSelected === true`），且会话栏展开时 `convVisible === true`，上述判断把所有在分栏模式下点击左侧插件入口切入全屏页面的合法意图全部误杀阻断。

## 二、架构收敛方案

1. 在 Tab 切换分支（`currentTab !== lastActiveTabId`）中，移除 `sessionSelected && convVisible` 对合法 Tab 视窗调和的阻断；
2. 当用户明确点击插件入口切换至目标工作台 Tab 时，以该 Tab 自身记录的 `targetMode` 为准（偏好全屏则进入全屏，偏好分栏则进入分栏并执行健康宽度自愈）；
3. 会话项点击的最高优先级保护依然由会话点击事件自身（`ensure-conversation-visible.js`）保证，两者职责正交，互不干扰。

## 三、验收标准（Acceptance Criteria）

- **AC-1**：用户在分栏页面切换至偏好全屏的页面时，系统确定性调和至全屏模式；
- **AC-2**：用户在全屏页面切换至偏好分栏的页面时，系统确定性调和至分栏模式，且右侧面板保持健康宽度（≥500px），中间零黑洞；
- **AC-3**：在全屏状态下点击左侧会话记录，会话栏确定性退出全屏并舒展展开；
- **AC-4**：7大插件入口页面在全屏与分栏之间连续两轮实机测试 100% 毫无异常。
