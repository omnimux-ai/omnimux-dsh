# Spec: 浏览器侧边栏任务队列连续提交 + 任务刻度轨（Issue #2964）

产品真源：`docs/product/browser-panel-task-rail.md`（用户已确认实施，范围 = P0 保活+F1 连续提交 + P1 刻度轨+完成提醒；P2 归档/P3 队列管理不在本 Issue）。

## 一、问题与目标

浏览器侧边栏当前任务运行中禁用输入框与发送键，用户必须等上一轮结束才能发下一条；桥连接绑定面板开启状态，关面板即断；消息流无轮次定位入口。目标：派单后继续浏览，回来逐条点击验收。

## 二、范围

- **F0 保活**：background `startBridge()` 解除 `panelPorts.size===0` 前置；面板全关时保持 WS 连接与断线重连（事件泵继续接收轮次事件）。
- **F1 连续提交**：`working` 期间输入框与发送键可用；提交仍走 `session.prompt` `mode:'queue'`；输入框上方渲染「排队坞」（`agent/inbox/spliced`/`inbox` 快照的 next-turn 条目，排队数+逐条摘要）；发送键与停止键并存。
- **F2 刻度轨**：消息区右缘每轮一条横线刻度（常态/当前轮高亮/进行中呼吸/排队细淡四态）；悬停浮出预览卡（用户语 1 行 ≤50 字符 + 回复摘要 3 行 ≤120 字符）；点击滚动定位到该轮首个 assistant 行并短暂高亮；行模型 Row 增加 turn 字段（turn/start|turn/end 边界与 assistant-stream turn 推断）。
- **F3 完成提醒**：轮次完成时刻度态变化（完成态）；无面板打开时复用审批通知通道发 chrome.notifications，点击 openAssistantPanel 并携带定位参数跳转到该轮结果。

## 三、非目标

任务级归档、session.updateQueue（edit/remove/steer）、跨会话总览、定位回 DSH 主工作台、消息级删除。

## 四、验收标准

- AC-1 任务运行中连续发送 3 条消息，3 条均出现在排队坞并按序各自成轮执行。
- AC-2 点击任一已完成刻度，消息区滚动定位到该轮结果气泡并短暂高亮。
- AC-3 悬停刻度出现预览卡，首行用户语、下方回复摘要。
- AC-4 进行中刻度呼吸动画，排队刻度细淡，当前轮高亮。
- AC-5 无面板打开期间任务完成触发系统通知；点击通知打开面板并定位到该轮。
- AC-6 面板关闭再打开，队列与刻度状态完整恢复（宿主 inbox + 事件重放）。
- AC-7 少于 2 个轮次时刻度轨不渲染；刻度区超出高度内部滚动。

## 五、新用户基线

本功能不引入新的外部依赖：排队与轮次锚点由宿主会话原生提供；通知沿用扩展已有 notifications 权限；无宿主连接时侧边栏维持既有「未连接」提示，不静默降级。

## 六、工程落点

- `extension/src/background/index.ts`：`startBridge` 解除面板前置、断线重连常开；完成通知复用审批 notify 通道 + openAssistantPanel 定位参数。
- `extension/src/panel/App.tsx`：放行 working 期间输入/发送；渲染排队坞；消息容器右缘挂刻度轨；点击刻度 scrollIntoView。
- `extension/src/panel/events.ts`：Row 增加 `turn`；边界事件推断轮次。
- `extension/src/panel/strings.ts`：文案「排队中（N）」「可继续派任务」「第 N 个任务」。
- `src/remote-host-api.ts`（宿主桥插件，仅当需要读 turnOutline 时）：历史轮预览数据优先从已加载事件自算（不新增白名单方法）；未加载历史段本期不预填刻度（已知裁剪：AC-7 覆盖）。
