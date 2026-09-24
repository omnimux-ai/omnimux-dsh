# AI 应用表单模型选择显式绑定工程默认与多参数契约自适应 · 规格说明书 (Issue #2642)

## 1. 业务目标与背景
1. **默认模型显式化（以工程节点为准）**：表单首部「生成模型」选择器的默认项不展示抽象词汇，而是精确解析工程主生成节点配置的模型 ID，显式呈现为 `[模型名称] (工程默认 · 作者推荐)`（如 `Seedance 2.0 (工程默认 · 作者推荐)`），让创作者清晰知晓原始调优底座；
2. **多参数（比例、时长、分辨率）跟随模型契约自适应**：
   - 切换不同模型时，表单已公开的参数（如比例 `aspect_ratio`、时长 `duration`、分辨率 `resolution` 等）必须动态跟随新模型的真实参数契约（`parameters`）刷新可选卡片与滑动范围；
   - 若当前选中的值不被新模型支持，自动平滑收敛为合法参数，杜绝提交非法参数；
3. **隐藏参数安全清洗**：
   - 执行桥接层（`executionBridge.ts`）在替换主生成节点模型时，自动校准节点固定的未公开参数，彻底杜绝契约参数与模型不匹配导致底层生成崩溃。

## 2. 关键设计规格
### 2.1 表单默认模型名称显式解析 (`AppTab.jsx`)
- 从 `manifest?.workflowBinding?.snapshot?.nodes` 精确提取主生成引擎节点配置的 `model`；
- 在模型目录中匹配该模型的人类可读名称（如 `seedance-2.0` -> `Seedance 2.0`）；
- 未手动切换模型时（`selectedModel === ''`），首行下拉按钮展示：`${defaultModelName} (工程默认 · 作者推荐)`；
- 下拉菜单首项展示：
  - 标题：`${defaultModelName} (工程默认 · 作者推荐)`
  - 副标题：`当前工程预设模型，与分镜提示词深度调优`

### 2.2 多参数契约推导纯函数扩展 (`appTabWidgets.js`)
- `resolveModelDurations(activeModel, prop)`：读取 `activeModel?.parameters?.duration`（支持 discrete options 与 numeric range）；
- `resolveModelResolutions(activeModel, prop)`：读取 `activeModel?.parameters?.resolution?.options`；
- `isAspectRatioSupported(model, val)`、`sanitizeModelDuration(model, val)`、`sanitizeModelResolution(model, val)`：提供纯函数用于参数边界收敛校验。

### 2.3 桥接层未公开隐藏参数校准 (`executionBridge.ts`)
- 当用户显式指定 `__model__` 切换模型后：
  - 读取目标新模型的参数契约；
  - 遍历目标节点的固定 `data.params`：
    - 若 `params.duration` 超过新模型允许的最大时长，自动收敛为上限；
    - 若 `params.aspectRatio` 不被新模型支持，自动收敛为新模型默认比例；
    - 若 `params.resolution` 不被新模型支持，自动收敛为新模型默认分辨率。

## 3. 验收标准
1. 表单首项清晰展示工程作者预设的模型名称（带有 `工程默认 · 作者推荐` 标识）；
2. 切换模型后，比例/时长/分辨率等参数随模型动态联动并自动收敛；
3. 提交至执行桥接层的数据完全合规，无任何契约参数不匹配报错；
4. 全量自动化测试 100% 全绿，两轮开源 OCR 代码审查无阻断。
