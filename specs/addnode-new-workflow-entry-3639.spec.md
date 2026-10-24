# 「添加节点」面板底部补「新建工作流」入口卡（Issue #3639）

## 背景与现状

用户对照 MiniMax Design 的「添加节点」面板截图，要求把底部的「新建工作流」入口卡对齐到我们面板的同一位置。

现状（已核实）：

- `AddNodeMenu.tsx` 是「添加节点」面板唯一实现，两处挂载：Dock（`Toolbar.tsx:549`，`scope="dock"`）与右键菜单钻取（`ContextMenu.tsx:208`，`scope="context"`）。面板当前只有 标题 / 搜索 / 分组列表，**底部无任何入口**。
- 「新建工作流」（存为可复用模板）入口目前只在底部工具栏的模板面板里（`WorkflowTemplatePanel` 的入口卡，Issue #3625 交付）。
- `Toolbar` 已持有 `onCreateWorkflow?: () => void` prop（#3625 新增），`CanvasEditor` 已接线为 `() => setCreateWorkflowModalOpen(true)`。
- 文案 key 已存在：`template.panel.newWorkflow`（新建工作流）、`template.panel.newWorkflowHint`（把当前画布保存为可复用模板）。**本任务不新增 i18n key。**

命名坑（必须避免混淆）：右键菜单里的「创建工作流」⌘G 是 `handleCreateWorkflowFromMenu` → 在画布建**工作流分组容器**，与「存为模板」不是一回事。本任务不修改该行为。

## 用户操作旅程

1. 用户在画布底部点「+」→ 打开「添加节点」面板。
2. 面板列表下方看到入口卡：「新建工作流 / 把当前画布保存为可复用模板」+ 右箭头。
3. 点它 → 打开既有「创建可复用工作流模板」弹窗（与模板面板入口卡、右键无关）。
4. 若宿主未提供回调（例如独立使用该组件），**入口卡不渲染**，面板与今天一致。

## 期望界面与交互

- 入口卡位于面板底部（列表之下），与列表面板同一容器内，不遮挡搜索框与列表。
- 卡片为「图标 + 主文案 + 副标题 + 右箭头」的整块可点区域，键盘可聚焦（原生 `button`）。
- 零 inline 颜色；样式进 `theme/components.css` 的 BEM 区块（追加，不改他人条目）。
- 点击不得冒泡触发画布/菜单的其它行为（沿用组件既有 `stopPropagation` 约定）。

## 验收标准

1. `onCreateWorkflow` 存在时渲染入口卡（主文案 + 副标题 + 箭头）；缺省时不渲染。
2. 点击入口卡调用回调一次，不冒泡。
3. Dock 与右键钻取两处挂载都能拿到入口卡（同一组件，回调透传）。
4. 中英 key 复用既有 `template.panel.*`，`i18n.test.mjs` 的 zh/en 集合一致性保持绿。
5. 单测：有回调 → 渲染；无回调 → 不渲染（渲染式测试，stub 掉 `addNodePalette` 以免触碰全局注册表）。
6. 隔离 worktree 真实浏览器证据：打开「添加节点」面板 → 截图见入口卡 → 点击 → 截图见 `CreateWorkflowModal` 打开；**截图在 ship 之前复制到 worktree 之外**（#3625 的 22 张截图随 worktree 清理被删，不得重复）。

## 技术设计

- `AddNodeMenu.tsx`：新增可选 prop `onCreateWorkflow?: () => void`；在 `wf-node-menu__container` 内、`wf-node-menu__list` 之后渲染 `wf-node-menu__footer > button.wf-node-menu__entry`（`Boxes` 图标 + `wf-node-menu__entry-title` / `wf-node-menu__entry-hint` + `ChevronRight`）。
- `Toolbar.tsx`：把已有 `onCreateWorkflow` 透传给 `AddNodeMenu`（dock）。
- `ContextMenu.tsx`：新增可选 `onCreateWorkflow?: () => void` 并透传给 `AddNodeMenu`（context）；`CanvasEditor.tsx` 在渲染 `ContextMenu` 处传入同一 `setCreateWorkflowModalOpen(true)`。
- `theme/components.css`：追加 `.wf-node-menu__footer/__entry/__entry-text/__entry-title/__entry-hint/__entry-arrow` 区块（注释不带 `#`，避免裸色门禁误判）。
- 不改 `addNodePalette.ts`、不改任何节点注册表/定义、不改调度与 Feed/Slot 语义。

## 硬性约束

- 不新增 i18n key（复用既有）；不内联颜色；不引入后端/网络/插件宿主。
- 不改右键「创建工作流」既有语义；不新增模态。
- 不复制 MiniMax 的「ComfyUI 工作流」卡与其托管后端引导（本仓明确不复刻范围）。

## 证据要求

- `pnpm --filter omnimux-workflow test`（含新测试）与 `pnpm --filter omnimux-workflow typecheck` 的真实输出。
- `node --test scripts/verify-anti-slop.test.mjs`、`pnpm verify:stages`（Client 改动）。
- 隔离 worktree 真实浏览器截图（面板含入口卡 / 点击后模态打开），**留存于 worktree 之外**。

## 假设

1. 「新建工作流」的既有语义就是「把当前画布/节点组保存为可复用模板」，入口卡副标题照此写，不编造功能描述。
2. Dock 与右键钻取共用 `AddNodeMenu`，因此一处改动可覆盖两处挂载；回调由宿主透传，组件自身不打开任何模态。
3. 面板高度有余量容纳底部卡片，不需要改弹层定位或滚动策略。

## 证伪方式

1. 若「新建工作流」在既有产品里另有所指（例如也承担建分组容器），则以 `menu.createWorkflow` 的既有文案与 `handleCreateWorkflowFromMenu` 行为为准，本任务只做「存模板」入口，命名冲突另开 Issue 记录。
2. 若面板内出现布局问题（卡片挤压列表、超出可视高度、遮挡搜索框），则改为列表内滚动容器 + 固定底部卡；若无法在不改弹层定位的前提下解决，则如实上报并把该 UI 问题留作后续 Issue，不硬塞。
3. 若 `AddNodeMenu` 的渲染式测试无法在仓库门禁下成立（例如 stub 方式被判为越界），则改为「源码契约 + 浏览器证据」并如实声明单测覆盖缺口，不伪造测试。

## 新用户基线

新装用户在 Dev/正式版画布中点「+」即可看到入口卡；不依赖 Dev 专属端口、本地模型服务、兼容代理或任何绝对路径。
