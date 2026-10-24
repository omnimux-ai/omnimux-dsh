# Issue 3659 · 入口卡「新建工作流」保存报「缺少分组」

- 任务工作树：`.worktrees/workflow-template-canvas-scope-3659`（分支 `agent/workflow-template-canvas-scope-3659-issue-3659`，base `origin/main` = `b6d5709fc`）
- 驱动：插件 dev harness（`node scripts/canvas-harness.mjs --port 0`，真实 `CanvasEditor`）+ ego-browser 真实 Chromium；harness 无后端，页内覆写 `window.fetch` 拦截 `POST /omnimux-workflow/api/templates` 并返回合成 200，payload 原样记录
- 结构化证据与截图（本机生成物，不进版本库）：`docs/evidence/issue-3659-template-scope.json`、`docs/evidence/issue-3659-0*.png`

## 根因

`CanvasEditor` 的 `CreateWorkflowModal.onConfirm` 原先硬要求 `targetGroupForWorkflow`：

```ts
const groupId = targetGroupForWorkflow?.id;
if (!groupId) throw new Error(t('template.missingGroup'));   // 「缺少分组」
```

而 `targetGroupForWorkflow` 只在**组右键**事件里被设置；#3639 新增的入口卡（Dock 与右键钻取两处）走 `setCreateWorkflowModalOpen(true)`，从不设置范围 → 这两处保存必然报「缺少分组」。同一个原因还让模态提示恒显示「包含 **0** 个节点」。

## 修法

新增纯函数 `resolveWorkflowTemplateScope(nodes, edges, groupId?)`，把范围定义成两种：

| 入口 | 范围 | 坐标处理 |
| --- | --- | --- |
| 组右键「保存工作流」 | 该组直接子节点（`childIdsOfGroup`）+ 组内连线 | 保持原样（同组内相对坐标，插入时整体平移） |
| 入口卡（无分组） | 整块画布：所有非 `group` 节点 + 两端都在范围内的连线 | 组内子节点用 `toAbsoluteCoordinates` 还原为绝对坐标，并丢弃 `parentId`/`extent` |

模板是扁平快照（`planInstantiateTemplate` 插入时本就剥掉 `parentId`/`extent`），所以落库前就把父引用丢掉，避免模板 JSON 里留下指向「不在模板内的组」的悬空引用。`nodeCount` 与提交取同一份范围；范围内 0 节点时抛 `template.emptyCanvas`（模态 catch 后提示且不发请求）。

## 实测（真实浏览器）

| 断言 | 结果 |
| --- | --- |
| Dock 入口卡保存 | 成功 toast「工作流「新建工作流模板」已保存到模板库」，**无**「缺少分组」，模态关闭 |
| 右键钻取入口卡保存 | 同上（第 2 次 POST） |
| payload 形状（两次一致） | `nodes=5`、`edges=2`、带 `parentId`/`extent` 的节点 **0**、连线两端在范围内 **2** |
| 模态提示 | 「包含 5 个节点…」= payload `nodes.length`（修复前恒为 0） |
| 空画布（全选删除后） | DOM 节点 0、提示「包含 0 个节点」、提交 toast「画布还没有节点，先添加节点再保存」、POST 数 2→2（**未写库**） |

> DOM 里 `.react-flow__node` 只有 4 个而 store 非 group 节点是 5 个：React Flow 只渲染可见节点，不是范围算错（payload 与提示都是 5）。

## 单测（新增 `workflowTemplateScope.test.mjs`）

- 组范围：只取该组直接子节点，坐标与 `parentId` 保持原样，组外连线被排除。
- 画布范围：排除组容器；组内子节点 `(10,20)+(100,200)=(110,220)`；`parentId`/`extent` 丢弃；父组不在画布内时坐标原样保留。
- 空画布（只有组容器）：`nodeCount = 0`。
- 连线过滤：指向组容器/范围外的连线被丢弃。

## 自动化检查

- `pnpm --filter omnimux-workflow test` → 2927 pass / 0 fail
- `pnpm --filter omnimux-workflow typecheck` → canvas + host + director 三段绿
- `pnpm verify:stages` → PASS（14 Stage / 8 sidebar）；anti-slop 3/3；`git diff --check` clean
- `w4-i18n.test.mjs` → zh/en key 集合一致（新增 `template.emptyCanvas` 双语齐备）

## 已知缺口

- 组右键入口未由 Lead 在浏览器复测（组范围由单测覆盖；已要求独立验收方补做）。
- 浅色主题、键盘可达性、Electron 壳层未覆盖。
