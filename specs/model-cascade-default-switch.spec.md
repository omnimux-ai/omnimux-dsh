# 规范 · 模型级联菜单默认模型切换与跨品牌隔离加固 (Issue #1702)

## 1. 业务背景与加固目标

在画布材质节点中，用户使用三级级联选择器（`ModelCascadeMenu`）选择品牌、模型与渠道策略。
为确保极简纯净的交互体验与绝对数据安全：
1. **点击即切换默认模型**：用户点击任意一级品牌，系统立即将模型切换为该二级菜单配置的默认模型，并保存至节点，展示其对应渠道。
2. **纯粹硬隔离判定（零兜底假阳性）**：弃用带有默认回退（`allowed[0]`）的弱从属判定，采用严格基于品牌特征词匹配的 `modelBelongsToBrand(modelId, brandId)`，彻底消除在任何复杂或离线上下文下跨品牌模型混入二级列表的可能性。

## 2. 核心架构与函数契约

1. **`modelBelongsToBrand(modelId: string, brandId: string): boolean`**：
   - 提取 `brandId` 对应的全部特异性特征词（fragments）。
   - 仅当且仅当 `modelId` 明确包含任一特征词时返回 true。
   - 绝无任何兜底分支，不属于该品牌的模型绝对返回 false。
2. **`shownModels` 推导**：
   - `const belongsToBrand = modelBelongsToBrand(activeModelId, shownBrandId);`
   - 仅当 `belongsToBrand` 为 true 时，才允许未在目录列表中的已提交模型进行回退补全。
3. **`handleBrandClick` 切换流**：
   - 用户点击一级菜单直接触发 `handleSelectModel(defaultModelForBrand(brandId, materialType, rows))`，同步更新模型、品牌、渠道分组并提交节点。

## 3. 验收标准

1. 单元测试与端到端测试 100% 通过；
2. 工作树隔离 Web QA 验收通过并产出截图与报告证据；
3. 构建完整 bundle 并同步物化至开发环境（`~/.omnimux-dev`）。
