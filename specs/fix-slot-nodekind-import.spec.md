# 规格：修复应用插槽节点缺少 nodeKind import 导致工作流就绪度校验失败

## 1. 任务背景与核心目标
- **关联 Issue**: #2385
- **背景现状**:
  在应用「手机与网页交互实机演示」等工作流中，包含 `node-slot-product-image`（商品主图槽）与 `node-slot-copywriting`（核心文案槽）。
  这些槽位节点在预设中未显式声明 `nodeKind: "import"` 与 `selectedTool: "import"`。
  在执行真实工作流无头调度时，工作流调度内核判定未标注的节点默认为 `generate` 生成节点，并执行生成就绪度检查 `findExecutionReadinessFailure`。由于图片槽节点没有配置生成模型与上游提示词，直接触发报错：
  `[HeadlessExecutionSeam] readiness_failure: Execution readiness check failed for node "node-slot-product-image" [prompt_required]: 请提供正文或补充要求，也可连接已有文本`。

- **核心诉求与预期成果**:
  1. 在 `plugins/omnimux-apps/src/host/executionBridge.ts` 中，为所有插槽节点（`isSlot: true`、`node-slot-*`、`slotRole` 节点）及动态生成的源节点固化身份：
     - `nodeKind: 'import'`
     - `selectedTool: 'import'`
     - `status: 'completed'`
     - `materialType: node.data.type || node.data.materialType`
  2. 同步规范 7 套官方预设工作流文件（`catalog/presets/*.workflow.json`）与静态内联数据（`builtinCatalogData.ts`）；
  3. 补齐端到端回归测试用例，通过真实工作流就绪度检查；
  4. 质量门禁全绿，代码合入主干并编译物化。

## 2. 详细技术方案
1. **执行桥智能属性修复 (Fail-Closed Robustness)**:
   在 `prepareAndInjectWorkflowSnapshot` 中：
   - 遍历 `nodes`，凡命中插槽标识的节点，将其标记为输入节点（`nodeKind: 'import'`）；
   - 用户传入表单参数后，所绑定的目标节点与虚拟上游节点均置为 `status: 'completed'`；
   - 使得工作流内核在调度前识别到它们为已完成的外部输入素材，直接放行给视频生成核心节点；
2. **测试与回归断言**:
   - 导入 `findExecutionReadinessFailure`，验证快照在接入执行桥处理后，不再出现 `prompt_required` 就绪度失败。
