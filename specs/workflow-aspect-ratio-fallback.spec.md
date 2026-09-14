# 视频首帧模式画幅比例自适应回退与防残留规格说明（Video Aspect Ratio Fallback Spec）

## 1. 背景与业务痛点
用户在工作流画布的视频生成节点中使用海螺 H3（Hailuo H3 / `minimax-h3`）模型，并上传/连入首帧图片（进入首帧生视频模式 `first_frame`）。
界面顶部弹出了红色错误提示条：
`⚠️ 参数“aspectRatio”不支持值 "9:16"`，且底部的生成按钮被禁用。

### 1.1 根因分析
1. **模型能力与接口事实**：
   - 海螺 H3 模型在文生视频（`text_to_video`）下完全支持 `9:16`、`16:9`、`1:1`、`4:3`、`3:4`、`21:9` 等画幅比例；
   - 在首帧生视频（`first_frame`）模式下，官方大模型遵循“画面比例完全自适应首帧原图（`adaptive`）”的设计规范，契约声明中 `aspectRatio.options` 仅包含 `adaptive`（自适应），不接受强行固定比例。
2. **画布数据流转缺陷**：
   - 当节点从文生视频进入首帧生视频模式（或初始化默认携带 `aspectRatio: "9:16"`）时，节点持久化参数 `params.aspectRatio` 仍保留旧值；
   - `resolveEffectiveVideoParams` 直接透传了 `params.aspectRatio`，未根据当前生效模式的 `schema.aspectRatio.options` 进行合法性回退，导致解析出的有效参数依然是 `"9:16"`；
   - `validateVideoParamsForUi` 将未清洗的旧参数送入 `findDeclaredParameterFailure`，由于 `"9:16"` 不在 `first_frame` 的 `options`（仅 `adaptive`）中，触发了反直觉的错误拦截；
   - 在图准备阶段 `prepareExecutionSlotGraph` 中，当推断或绑定为仅支持 `adaptive` 的生成模式时，也未对不兼容的画幅做规范化回退，导致后端就绪检查同样面临拦截风险。

## 2. 改造方案

### 2.1 读侧解析回退（`resolveEffectiveVideoParams`）
在 `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/videoParams/videoParamAdapter.ts` 中：
- 当 `schema.aspectRatio?.options` 存在且非空时，使用 `optionValue` 检查当前 `params.aspectRatio`：
  - 若在选项列表中，保留原值；
  - 若不在选项列表中（例如当前模式为 `first_frame` 且选项仅有 `adaptive`，而原参数为 `"9:16"`），自动回退为当前模式声明的默认画幅 `defaultValue`（例如 `adaptive`，无默认值则取首项）。
- 确保解析出的 `EffectiveVideoParams.aspectRatio` 始终合法，底部胶囊条展示为“自适应”。

### 2.2 界面即时校验对齐（`validateVideoParamsForUi`）
在 `validateVideoParamsForUi` 中：
- 传递给 `findDeclaredParameterFailure` 的参数集必须与当前有效参数的合法画幅对齐，避免已被安全回退吸收的残留值继续触发虚假拦截报错。

### 2.3 执行准备图参数规范化（`prepareExecutionSlotGraph.ts`）
在 `plugins/omnimux-workflow/src/shared/graph/feedSlot/prepareExecutionSlotGraph.ts` 中：
- 当根据上游连线与素材推断或补充 `params.operation` 时，检查该 `operation` 的 `aspectRatio` 定义；若当前 `params.aspectRatio` 存在且不在其选项列表中，将其规范化回退为该操作声明的默认值（`defaultValue`，如 `adaptive`），确保提交到后端的执行就绪校验 100% 顺畅通过。

## 3. 验收标准（Acceptance Criteria）
- **AC-1（首帧画幅自适应回退）**：当节点存在首帧图片（模式为 `first_frame`）且此前残留 `aspectRatio: "9:16"` 时，有效参数自动回退为 `adaptive`，底栏胶囊正确显示“自适应”。
- **AC-2（消除误报拦截）**：首帧模式下不再弹出 `参数“aspectRatio”不支持值 "9:16"` 错误，生成按钮保持可用状态。
- **AC-3（文生视频不受影响）**：文生视频模式下选中的 `"9:16"`、`"16:9"` 等合法比例保持原样不变，无回归。
- **AC-4（全流程自动化测试全绿）**：新增单元测试覆盖首帧模式画幅自适应回退及就绪检查，相关测试 100% 通过。
