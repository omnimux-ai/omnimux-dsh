# Issue #2642 表单模型选择显式绑定工程默认与多参数契约自适应 · 实测验收证据

## 1. 验证目标
核验 Issue #2642 的核心功能交付与契约一致性：
- 表单首部生成模型默认项显式绑定工程作者模型名称与作者推荐标识；
- 切换模型后多参数（比例、时长、分辨率）跟随新模型契约自适应联动并平滑收敛；
- 后端执行桥接层（executionBridge.ts）在模型切换后安全清洗未公开隐藏参数。

## 2. 自动化验证用例与结果
- `plugins/omnimux-workflow/src/client/projects/appTabWidgets.test.mjs`:
  - `isAspectRatioSupported()`: 校验比例有效性通过；
  - `resolveModelDurations()`: discrete options 与 numeric range 规格推导通过；
  - `resolveModelResolutions()`: 分辨率契约推导通过；
  - `sanitizeModelDuration()`: 离散上限收敛与 range 边界收敛通过；
  - `sanitizeModelResolution()`: 分辨率平滑重置通过。
- `plugins/omnimux-workflow/tests/apptab-form-widgets.e2e.test.mjs`:
  - `E2E: 表单首部生成模型默认项显式绑定工程作者模型 (Issue #2642)`: 验证默认收起态呈现 `Seedance 2.0 (工程默认 · 作者推荐)`，浮层首项标题与说明完整对齐，无模型工程安全兜底为 `智能推荐 (默认)`；
  - `E2E: 表单多参数（比例、时长、分辨率）跟随模型契约自适应并平滑收敛 (Issue #2642)`: 验证切换到 MiniMax H3 后，时长 15s 平滑收敛为 10s，分辨率 480p 平滑重置为 768p，支持的比例 21:9 完整保留。
- `plugins/omnimux-apps/src/host/executionBridge.test.mjs`:
  - `T05.17: auto-heals undisclosed hidden parameters (duration, aspectRatio, resolution) against model contract (Issue #2642)`: 验证未公开时长 10s 在切到只支持 5s 的模型时，节点 params.duration 被安全校准为 5s，彻底避免提交被拒；比例与分辨率同样完成平滑收敛。

## 3. 全量测试通过结果
- omnimux-workflow: 2053 pass, 0 fail (100% 通过)
- omnimux-apps: 82 pass, 0 fail (100% 通过)
- 产物构建验证: omnimux-workflow 与 omnimux-apps build 均成功
- 格式检查: git diff --check 全绿，无违规空白换行与禁用文案
