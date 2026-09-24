# AI 应用表单模型选择器、模型能力驱动画幅比例与旧缓存自愈 · 规格说明书 (Issue #2631)

## 1. 业务目标与背景
1. **模型选择权回归创作者**：在 AI 应用表单中增加「生成模型」选择器，用户既能使用默认推荐的最佳模型，也能主动切换为自己偏好的模型（如 Kling、MiniMax H3 等）；
2. **画幅比例彻底动态化**：成片比例选项彻底脱离前端写死逻辑，100% 由所选模型的真实参数契约（`model-catalog` / `parameters.aspectRatio`）动态驱动；
3. **执行桥接层支持模型动态穿透**：用户选定模型后在工作流执行节点中动态覆盖主生成节点（`targetNode.data.model = selectedModelId`），实现流程拓扑与底层模型的严密解耦；
4. **探索模板与旧缓存智能自愈**：修正 `featured-apps-data.js` 模板数据源，且在 `resolveWidget` 决策层增加自愈规则：只要字段标识为 `product_image`，自动升级为 40px 紧凑商品三合一输入条，彻底消灭大虚线框残留。

## 2. 关键设计规格
### 2.1 表单模型选择器 (`AppTab.jsx`)
- 表单首部增加「生成模型」定制下拉菜单（40px 紧凑单行条）；
- 默认值为 `""`（显示为「智能推荐 (默认)」）；
- 展开列出当前模态（视频/图片）支持的可用模型（名称、能力说明）；
- 点选模型后，更新 `selectedModel` 状态，并联动下方画幅比例。

### 2.2 动态画幅比例推导 (`appTabWidgets.js`)
- 新增 `resolveModelAspectRatios(activeModel, prop)` 纯函数：
  - 读取所选模型的 `parameters.aspectRatio.options`；
  - 若模型定义了有效 options，按模型 options 渲染为比例卡片组；
  - 若用户切换模型后，原本选中的比例不被新模型支持，自动回退到新模型的 `defaultValue`。

### 2.3 执行桥接层模型注入 (`executionBridge.ts`)
- 检查 `formValues.__model__` 或 `formValues.model`；
- 若显式指定模型，将该值覆盖至主生成节点（`node.data.type === 'video'` 或 `omnimux_video_submit` 等）的 `node.data.model`；
- 保持上游输入槽位与节点拓扑不变。

### 2.4 模板数据与老旧缓存自愈
- 将 `featured-apps-data.js` 中 7 款经典应用的 `product_image` 统一为 `product-link`；
- 在 `resolveWidget` 中对 `product_image` 进行自愈提升，彻底防止旧本地缓存滞留大虚线框。

## 3. 验收标准
1. 表单首部可清晰查看并切换「生成模型」；
2. 比例卡片随所选模型动态改变（例如切到支持 21:9 的模型出现 21:9，切到仅支持 16:9/9:16/1:1 的模型自动收敛）；
3. 历史工程打开时商品主图 100% 呈现为 40px 单行三合一复合条；
4. 自动化测试 100% 通过，无安全漏洞与协议注入隐患。
