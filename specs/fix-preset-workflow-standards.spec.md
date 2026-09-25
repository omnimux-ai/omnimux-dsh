# 规格：修复 AI 应用官方预设工程文件规范与副本克隆自愈机制

## 1. 任务背景与核心目标
- **关联 Issue**: #2648
- **背景现状**:
  用户在使用 AI 应用并点击「编辑/创建副本」进入创作页画布时，发现预设工作流存在多项严重不符合创作页规范的异常表现：
  1. **节点间无连接线**：画布上素材节点与生成节点之间无法绘制出连接线；
  2. **模型选择器显示「待重新选择」**：底部配置面板未正确解析并选中预设配置的模型（如 Seedance 2.0）；
  3. **配置面板顶部警告堆叠错位**：显示 `⚠️ (Product Image) 商品主图槽位 · 素材不可用，请替换或重试` 及 `⚠️ (Copywriting) · 核心文案槽位 · 素材不可用，请替换或重试`，且警告卡片因重复渲染而层叠错位。
- **根本原因诊断**:
  1. **连线 Handle 错误**：官方预设（`catalog/presets/*.workflow.json` 及 `presetWorkflows.js`）中的 `edges` 缺失了 `sourceHandle: "out"`，且将 `targetHandle` 硬编码成了业务语义名 `"image"` 和 `"prompt"`。而创作页 `MaterialNode` 物理桩只有 `id="in"` 与 `id="out"`，React Flow 无法定位 Handle DOM 节点，导致连线渲染完全失效；
  2. **模型层级错位**：预设将模型配置放在了 `node.data.model` 顶层，而创作页配置面板及选择器读取的是 `node.data.params.model`。由于 `params.model` 为空，触发了缺失兜底逻辑显示为「待重新选择」；
  3. **卡槽绑定非法**：由于 `targetHandle` 被设为 `"image"` 和 `"prompt"`，内核将其解析为卡槽名。但视频生成模型（如 Seedance 2.0）的合法槽位为 `first_frame`，文案则是提示词文本流（textSources）。非法卡槽名被判定为 `slot_removed`，并同时推入 `slotConflicts` 与 `unloaded` 队列，导致渲染出双份警告按钮并相互重叠。

- **核心预期成果**:
  1. **源头与预设数据规范化**：
     - 纠正 `scripts/transpile-creatify-workflows.mjs`，统一输出标准结构：
       - `sourceHandle: "out"`, `targetHandle: "in"`，图片槽位挂载 `edge.data = { targetSlot: "first_frame" }`，文案槽位使用普通连线（无非法卡槽）；
       - 视频生成节点规范配置 `node.data.params.model = "seedance-2.0"`；
       - 输入素材节点规范配置 `nodeKind: "import"`, `selectedTool: "import"`, `status: "completed"`；
     - 重新构建物化全部 10 套官方预设工程 JSON（`catalog/presets/*.workflow.json`）、静态内联数据（`builtinCatalogData.ts`）以及前端预设库（`presetWorkflows.js`）；
  2. **前端副本创建与克隆自愈兜底 (Fail-Closed/Fail-Open Hybrid Resilience)**：
     - 在 `plugins/omnimux-workflow/src/client/projects/appLibrary.js` 中的 `createProjectForkFromManifest` / `wrapNodesInGroup` 增加拓扑自愈归一化机制：
       - 自动检测并修复历史遗留/外部不合规的连线 Handle（补齐 `out`/`in`，将非法 targetHandle 纠正）；
       - 自动兼容检测 `node.data.model` 并向 `node.data.params.model` 自动对齐；
  3. **全面自动化测试**：
     - 补齐/更新针对预设拓扑 Handle 规范性、克隆自愈逻辑的回归测试，保证单测 100% 通过；
  4. **开源审查与双闭环**：通过两轮 `ocr` 代码审查与 QA 验证后合入主线。

## 2. 详细技术方案
### 2.1 预设工程规范对齐
- **连线 (Edges)**:
  ```json
  {
    "id": "edge-img-to-video",
    "source": "node-slot-product-image",
    "sourceHandle": "out",
    "target": "node-video-generation-core",
    "targetHandle": "in",
    "label": "商品图输入",
    "data": {
      "targetSlot": "first_frame"
    }
  },
  {
    "id": "edge-text-to-video",
    "source": "node-slot-copywriting",
    "sourceHandle": "out",
    "target": "node-video-generation-core",
    "targetHandle": "in",
    "label": "分镜文案"
  }
  ```
- **生成节点 (Generate Node)**:
  ```json
  {
    "id": "node-video-generation-core",
    "type": "material",
    "data": {
      "type": "video",
      "materialType": "video",
      "nodeKind": "generate",
      "selectedTool": "omnimux_video_submit",
      "model": "seedance-2.0",
      "params": {
        "model": "seedance-2.0",
        "aspectRatio": "9:16",
        "duration": 5,
        "mode": "first_frame"
      }
    }
  }
  ```

### 2.2 副本克隆拓扑自愈归一化 (appLibrary.js)
实现 `normalizeWorkflowTopology(nodes, edges)`：
1. 遍历 `edges`：
   - 若缺失 `sourceHandle`，设为 `'out'`；
   - 若 `targetHandle` 不为 `'in'`：
     - 若旧值为 `'image'` 或包含 `'image'`，将 `edge.data.targetSlot = 'first_frame'`；
     - 统一将 `targetHandle` 设为 `'in'`；
2. 遍历 `nodes`：
   - 若存在 `node.data.model` 且 `node.data.params?.model` 为空，自动设置 `node.data.params = { ...(node.data.params || {}), model: node.data.model }`；
   - 若 `isSlot` 为 true 且缺失 `nodeKind`，补齐 `nodeKind: 'import'`, `selectedTool: 'import'`。
