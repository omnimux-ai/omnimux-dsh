# 入口卡「新建工作流」保存报「缺少分组」（Issue 3659）

- 任务：`.worktrees/workflow-template-canvas-scope-3659`（分支 `agent/workflow-template-canvas-scope-3659-issue-3659`）
- 插件：`omnimux-workflow`；风险 R3（模板范围解析 + 一处提示文案，不改 API/存储结构）

## 目标

「添加节点」面板底部「新建工作流」入口卡（#3639 新增，Dock 与右键钻取两处）打开「创建可复用工作流模板」后，保存必然抛 `template.missingGroup`（「缺少分组」）：`CanvasEditor` 的 `onConfirm` 硬要求 `targetGroupForWorkflow`，而该入口从不设置范围（只有组右键事件会设置）。同时模态提示的节点数在无分组时恒为 0。

修法：把「未指定分组」定义成**整块画布**范围（入口卡文案本身就是「把当前画布保存为可复用模板」），并让模态显示真实节点数；空画布给出明确提示且不写库。

## 变更点

1. 新增 `src/canvas/editor/utils/workflowTemplateScope.ts`（纯函数，可 node --test）：
   - 指定分组：沿用现状（`childIdsOfGroup` 的直接子节点 + 组内连线，坐标不动）。
   - 未指定分组：所有非 `group` 节点；组内子节点坐标经 `toAbsoluteCoordinates` 还原为绝对坐标，并丢弃 `parentId`/`extent`（模板是扁平快照，`planInstantiateTemplate` 插入时本就会剥掉，落库不该留悬空父引用）；连线只保留两端都在范围内者。
   - 返回 `{ nodes, edges, nodeCount }`。
2. `CanvasEditor.tsx`：`onConfirm` 改用该函数；`nodeCount` 在无分组时取画布范围真实节点数；范围内 0 节点时抛 `template.emptyCanvas`（模态 catch 后 toast 且不关窗、不发请求）。
3. `dict.zh.ts` / `dict.en.ts`：新增 `template.emptyCanvas`（zh/en key 集合必须一致）。
4. 新增 `workflowTemplateScope.test.mjs`：组范围 / 画布范围（含组内子节点绝对化、parentId 丢弃、跨范围连线过滤）/ 空画布三种。

## 非目标

- 不改模板库 API、`templateSchema`、`TemplateStore` 与存储结构。
- 不改组右键「保存工作流」入口语义，不新增「选择分组」交互。
- 不动 `planInstantiateTemplate` 插入路径与 #3651 的面板形态。

## 新用户基线

纯画布内行为：全新用户安装后打开画布 → 添加节点 → 从入口卡保存模板即可成功，不依赖任何本机状态、服务或凭据。缺节点时给出明确文案（`template.emptyCanvas`），不发请求。

## 假设

1. 「未指定分组」只可能来自 #3639 的入口卡（`CanvasEditor.tsx:973` Dock、`:1042` 右键钻取）与右键主菜单的 `create-workflow` 动作；组右键路径一定带 `targetGroupForWorkflow`，因此按「有/无分组」二分即可覆盖全部调用点。
2. 模板是扁平快照：插入路径 `planInstantiateTemplate` 会剥掉 `parentId`/`extent` 并按包围盒重排坐标，因此保存时把组内子节点绝对化 + 丢弃父引用不会改变插入结果，只会让落库 JSON 自洽。
3. 组内子节点坐标是相对组容器的（`planGroupNodes` 用 `toRelativeCoordinates`），因此画布范围必须用 `toAbsoluteCoordinates` 还原，否则插入位置会偏移组容器位置。

## 证伪方式

1. 若 `rg "setCreateWorkflowModalOpen\(true\)"` 还能找到第三个不经过 `targetGroupForWorkflow` 的调用点，假设 1 被证伪，需要逐个补范围。
2. 若 `planInstantiateTemplate` 保留了 `parentId`/`extent`（或依赖模板内 parentId 还原层级），假设 2 被证伪，落库时就不能丢父引用。
3. 若实测组内子节点坐标与组容器位置无关（例如已是绝对坐标），假设 3 被证伪，画布范围就不该做坐标变换；用真实浏览器把同一份模板插入空白画布，比对插入前后相对布局是否一致来判定。
4. 若空画布路径仍发出 POST（合成 fetch 计数 > 0），或非空画布仍出现「缺少分组」，则本修复未达成目标。

## 验收标准

1. 入口卡路径（Dock + 右键钻取）保存不再出现「缺少分组」，可走到成功保存；组右键路径回归正常。
2. 模态提示节点数 = 画布范围内非 group 节点数。
3. 保存 payload 无 `parentId`/`extent`、组内子节点为绝对坐标、连线两端都在 payload 内。
4. 空画布：明确提示且无 POST。
5. `pnpm --filter omnimux-workflow test`、`typecheck`、`pnpm verify:stages`、anti-slop 绿；真实浏览器证据留存。

## 文档影响

无用户文档需要同步：修复的是既有入口的保存失败，不新增能力、命令或配置；`docs/evidence/issue-3659-*.md|json` 作为任务证据留存。
