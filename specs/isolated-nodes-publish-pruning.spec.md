# 需求规格：导入素材节点拖拽交互解绑与未连线孤立节点发布剪枝（Spec-Isolated-Nodes-Publish-Pruning）

## 1. 目标（Objective）
- **背景与痛点**：
  1. 用户在创作画布中添加 `import` 类型素材节点（NodeKind === 'import'）时，由于根容器挂载了 `nodrag` 与整卡点击事件（`onClick`），导致用户无法选中该节点进行移动，也无法与画布背景平滑交互。
  2. 用户在创作画布中构建复杂工作流并发布为 AI 应用时，若画布上存在未经连线或者不在可达路径上的孤立节点（例如草稿、孤立素材、未连接的提示词节点），旧分析器将所有入度为 0 的孤立节点皆误判为核心根输入项，导致发布出的应用表单出现无关字段，破坏表单纯净度。
- **业务目标**：
  1. 解绑 `import` 素材卡片主体根容器上的 `nodrag` 与整卡点击事件，允许空白区域正常冒泡被选中与拖拽位移；仅在卡片内部提供独立按钮热区触发文件导入。
  2. 在发布分析算法中引入有效终点识别与逆向 BFS 祖先可达闭包算法（`computeReverseReachability`），彻底排除未连线孤立节点，仅提取有效链路节点的输入参数，并将孤立节点归入 `prunedNodes`。
  3. 在发布向导 Step 2（输入配置页）中，若存在被剪枝的未连线节点，在汇总栏下方渲染极简透明提示条（`{count} 个未连线节点已排除`），符合现代 SaaS 极简科技风格。

## 2. 用户操作旅程与期望界面反馈（User Journeys & UI Feedback）

### 旅程 1：导入素材卡片拖拽与独立热区点击
1. **操作**：用户向画布中添加一个「导入素材」节点（`nodeKind: 'import'`）。
2. **期望界面反馈**：
   - 节点主体卡片支持鼠标按下拖拽，在画布自由平滑移动；
   - 节点卡片内部渲染独立操作热区按钮（文案 `选择文件` / `Select file`），引导文本显示 `点击或拖拽上传素材` / `Click or drop to import`；
   - 鼠标点击「选择文件」独立按钮时，拦截事件冒泡（`e.stopPropagation()`），仅触发 `onImport` 唤起系统文件选择，不触发画布节点误位移；卡片主体空白区域点击正常冒泡选中节点。

### 旅程 2：工作流发布中排除未连线孤立节点
1. **操作**：画布中包含主链路（文本节点 A -> 视频生成节点 B），同时存在孤立节点 C（未连线）。用户点击「发布为 AI 应用」。
2. **期望界面反馈**：
   - 算法识别出有效终点为节点 B（`inDegree > 0 && outDegree === 0`），排除纯孤立节点 C；
   - 逆向 BFS 可达闭包集合包含 A 与 B，节点 C 自动归入 `prunedNodes`（`prunedNodeCount = 1`）；
   - 打开发布向导进入 Step 2（输入项与配置项），表单仅包含主链路节点 A 与 B 的输入项，绝对不出现节点 C 的配置字段；
   - 在 Step 2 汇总栏正下方展示极简中性提示条：`1 个未连线节点已排除`；
   - 计算得到的 `workflowHash` 仅对主链路可达节点集合计算，孤立节点变动不影响哈希一致性。

### 旅程 3：完全孤立无连线图的边界兼容
1. **操作**：画布中只有 1 个或多个孤立节点，没有任何连线（`edges.length === 0`），用户进行拓扑分析或单节点测试。
2. **期望界面反馈**：
   - 算法安全退化兼容，不发生运行时异常与崩溃；
   - `prunedNodes` 为空，所有节点维持活跃兼容，`categorySuggestion` 和 `workflowHash` 正常产出，保障单节点分析单测（如 T01.2）零回归。

## 3. 验收用例（Acceptance Criteria）
1. **AC-1 (NodeEmptyState)**：
   - 当 `nodeKind === 'import'` 时，根容器 `<div className="wf-node-empty wf-node-empty--import-kind">` 不含 `nodrag` 类；
   - 根容器不挂载 `onClick`、`onKeyDown`、`role="button"`、`tabIndex`；
   - 内部包含独立的按钮元素，携带 `nodrag` 与 `onClick`（带 `e.stopPropagation()`），文案匹配 `t('canvas.node.import.actionBtn') || '选择文件'`。
2. **AC-2 (i18n)**：
   - `dict.zh.ts` 和 `dict.en.ts` 补齐 3 条锁定词条：
     - `canvas.node.import.hint`
     - `canvas.node.import.actionBtn`
     - `wizard.step2.pruneNotice.bar`
3. **AC-3 (Publish Types & Topology Analyzer)**：
   - `WorkflowAnalysisResult` 包含 `prunedNodes: FlowNodeLike[]`、`prunedNodeCount: number`、`activeNodeIds: string[]`；
   - 导出 `computeReverseReachability` 函数；
   - 有连线图中，有效终点排除 `inDegree === 0 && outDegree === 0`；
   - `activeNodes` 以外的孤立节点进入 `prunedNodes`，不提取输入项，不参与 `workflowHash` 计算；
   - 无连线图兼容退化，零崩溃。
4. **AC-4 (PublishWizardModal)**：
   - Step 2 当 `analysis.prunedNodeCount > 0` 时，渲染提示条显示 `{count} 个未连线节点已排除`。
