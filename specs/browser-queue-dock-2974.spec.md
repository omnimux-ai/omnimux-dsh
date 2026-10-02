# Spec: 排队坞官方同款重做 + 编辑/删除（Issue #2974）

产品真源：`docs/product/browser-panel-task-rail.md` + 本轮用户确认（方案 A：官方 QueueDock 同款 + 编辑/删除）。前置：#2964 已合入（排队坞 v1 为虚线行平铺，本 Issue 替换为官方同款形态）。

## 一、目标

排队坞外观与交互对齐 DSH 官方 QueueDock：可折叠「队列图标 + N 条排队消息 + chevron」头部、行分隔线列表、每行预览 + 28px 圆形编辑/删除按钮、行内 textarea 编辑态；数据回流仍走 inbox 投影 + `agent/inbox/spliced`，编辑/删除经新增桥白名单 `session.updateQueue` 直达宿主。

## 二、范围

- 桥：`invokeTarget` 增 `session.updateQueue`（`{request: call.payload}`）；`ORDERED_SESSION_METHODS` 纳入。
- 面板 `QueueDock.tsx` 新组件：折叠态管理（>1 条显示头部可折叠、默认折叠；1 条直接展示行无折叠头）、编辑态（textarea + ✓/✕）、busy 禁用。
- 文案 zh/en 对齐官方 `queue.*`：`{n} 条排队消息`/`编辑排队消息`/`删除排队消息`/`保存排队消息`/`取消编辑`/`编辑失败：这条消息可能已经开始发送。`/`删除失败：这条消息可能已经开始发送。`
- 样式按官方结构在扩展 token 体系重写；移除旧 `.queue-dock*`。
- 图标：新增 `QueueIcon`、`TrashIcon`（SVG 自绘）。
- 不做：steer 转插队、删除确认弹窗、附件缩略。

## 三、验收标准

- AC-1 多条排队显示「N 条排队消息」头部，点击折叠/展开列表。
- AC-2 每行有编辑与删除图标按钮；编辑进入行内 textarea，✓ 保存触发 `session.updateQueue {kind:'edit', content:[{type:'text',text}]}`；删除触发 `{kind:'remove'}`。
- AC-3 编辑/删除成功后该行由 spliced 事件更新/消失；失败展示官方同款错误文案且行保留。
- AC-4 单条排队直接展示行（无折叠头）；0 条整个坞不渲染。
- AC-5 深浅两主题层级与对比度正常（复用既有 token，不新增硬编码色值）。
- AC-6 busy 期间对应行按钮禁用；行 ID 以宿主消息 id 为准。

## 四、工程落点

- `src/remote-host-api.ts` invokeTarget + `src/server.ts` ORDERED_SESSION_METHODS。
- `extension/src/panel/QueueDock.tsx`（新）、`App.tsx`（替换内联 dock）、`strings.ts`、`styles.css`、`components/icons.tsx`。
- 测试：`task-rail-events.spec.ts` 增补 updateQueue payload 断言；`verify-task-rail-qa.mjs` 增补 dock 形态与操作断言。
