# 规格：点击会话项确定性恢复会话栏与退出全屏同步调和

## 一、背景与问题陈述
在工作台处于全屏状态或页面切换后，用户在左侧栏点击会话消息项时，中间会话栏未展开（宽度仍为 0px），出现大面积黑屏空缺。

## 二、深度根因分析
1. **全屏同步器快照污染死锁**：
   在 `fullscreen-collapse-sync.js` 中，若首次检测到全屏或在全屏状态下快照被清除重置，`resolveFullscreenCollapse` 从 DOM 重新采样当前折叠值 `currentDomValue`，而全屏状态下 DOM 上已被标记为折叠（`data-omnimux-conversation-collapsed`），导致快照被误记为 `true`。退出全屏时，系统还原快照的 `true`，导致会话栏在退出全屏后继续被锁定在折叠状态（0px），永远无法回显。
2. **退出全屏契约收敛**：
   退出全屏的明确业务目标是显示会话栏（进入分栏或常规视窗），除用户在分栏状态下显式折叠外，退出全屏应当确保会话栏展开（`collapsed: false`）。
3. **点击会话项确定性展现**：
   用户点击会话消息项（进入会话意图）拥有最高优先级，必须确定性退出全屏并展开会话栏。

## 三、修复方案
1. **`resolveFullscreenCollapse` 修复**：
   - 进入全屏时，只有在明确没有折叠时快照才记为 `false`；若进入前快照未初始化，快照默认置为 `false`（即退出全屏时默认应展开会话栏）；
   - 退出全屏时，明确还原为未折叠（`collapsed: false`）。
2. **`ensureConversationVisible` 增强**：
   - 物理移除 `data-omnimux-conversation-collapsed` 与快照属性；
   - 显式通知 `fullscreen-collapse-sync` 重置快照，确保 MutationObserver 响应后不会反向写回折叠；
   - 派发 `setFocus('split')` 恢复中间列 1fr 弹性宽度。
