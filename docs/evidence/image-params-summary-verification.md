# 生图输入框参数胶囊核心数据回显与自适应折叠验证证据

## 一、验证目标与环境
- **任务目标**：修复图像生成节点输入框参数触发条被错误折叠为仅剩图标的死锁缺陷，补齐画质选项并对齐图 2 展示规范。
- **环境**：独立 Worktree 隔离工作区 `omnimux-dsh-wt-image-params-summary`。
- **基线版本**：`origin/main`（commit: `604a744ee`）。

## 二、实操证据与验证结果

### 1. 宽度折叠死锁解除验证
- **问题机制**：`CfgSummaryBar` 此前以自身 `clientWidth` 作为 `available` 输入，在元素被缩小时触发 `ResizeObserver` 循环震荡收缩。
- **修复方案**：改为探测外部父级容器 `.wf-config-panel__params-group` 的实际剩余宽度，并以该容器作为 `ResizeObserver` 监听目标。
- **验证结果**：当父级容器宽度充足（500px）时，`available` 稳定计算为 300px+，不会发生多余折叠，所有核心参数完整展示。

### 2. 画质参数接入与格式化验证
- **输入参数**：
  - `aspectRatio: '1:1'`
  - `resolution: '1K'`
  - `quality: 'hd'`（高清 HD）
  - `operation: 'text_to_image'`（文生图 / 自适应）
- **输出结果**：
  - `ratioText`: `'1:1'`（带 14px 比例图标）
  - `resolutionText`: `'1K'`
  - `qualityText`: `'高'`
  - `modeText`: `'自适应'`
  - 完整拼接展示结果：`1:1 · 1K · 高 · 自适应`
  - 各槽位间伪元素分隔符渲染为点号 `'·'`，与图 2 预期 100% 吻合。

### 3. 单元与集成测试结果
- `imageParamAdapter.test.mjs`：11/11 测试全部通过（覆盖 `qualityText` 格式化、回退及边界值）。
- `summaryCollapse.test.mjs`：21/21 测试全部通过（覆盖 `IMAGE_COLLAPSE_ORDER` 包含 `quality` 后的各级折叠逻辑）。
- `imageParamsIntegration.test.mjs`：4/4 集成测试通过。
- `omnimux-workflow` 全量测试：1948 项单测 100% 通过，无回归。

## 三、结论
经实机代码与结构化逻辑验证，参数面板已完全具备正常回显「比例、清晰度、画质、模式」的能力，死锁收缩循环已彻底消除。
