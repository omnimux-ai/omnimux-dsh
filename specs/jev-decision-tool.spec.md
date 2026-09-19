# Spec: TypeSafe Jev 最新决策模型接入与中枢工具

## 1. 业务目标与背景
用户提供 OpenRouter 密钥与模型地址 `https://openrouter.ai/~typesafe/jev-latest`，要求将该模型直接接入 OmniMux 执行中枢，作为智能体工具可调用。
经过接口探测发现：
- 该模型不是普通的文本对话模型（不支持 /chat/completions，无自由格式文本输出）。
- 该模型为 TypeSafe 出品的 System One 结构化决策模型（Jev 1.13 / jev-latest），专用于毫秒级单选决策（choice）与量化评分（score），通过 OpenRouter `/api/alpha/decisions` 端点交互。
- 目标：将该模型作为一级工具 `omnimux_jev_decision` 接入 OmniMux 执行中枢（`plugins/omnimux`），并在中枢暴露服务通道，供会话内所有 Agent、工作流及外部调用。

## 2. 接口规格与契约
### 工具名称：`omnimux_jev_decision`
- 描述：调用 TypeSafe Jev 最新模型（~typesafe/jev-latest）进行结构化单选决策与量化评分。
- 输入参数：
  - `state` (string | object, 必需): 决策上下文、代码片段、事实陈述或候选方案背景。
  - `choices` (object | array, 可选): 单选候选集。如 `{"ship": "立即发布", "hold": "暂缓发布"}` 或 `["A", "B"]`。
  - `score_criteria` (array of string, 可选): 评分量表阶梯，如 `["差", "较差", "合格", "良好", "优秀"]`。
  - `instructions` (string, 可选): 决策准则或指导说明。
  - `questions` (object, 可选): 原生复杂 questions 字典，支持高级多题组合。
  - `model` (string, 可选): 模型 ID，缺省为 `~typesafe/jev-latest`。
- 输出结构：
  - `mode`: "live"
  - `model`: 返回实际模型 ID（如 `typesafe/jev-1.13-20260917`）
  - `answers`: 详细答案字典（含置信度 confidence 与概率分布 probabilities）
  - `decision`: 当仅有一个 choice 问题时提供的快捷决策结果
  - `score`: 当仅有一个 score 问题时提供的快捷得分
  - `confidence`: 核心决策置信度数值
  - `usage`: token 消耗与成本
  - `id`: 生成 ID

## 3. 验收标准与测试矩阵
1. 缺少 `state` 或没有任何问题定义时，抛出格式化的 `OmnimuxError`。
2. 缺失 `OPENROUTER_API_KEY` 时抛出认证错误。
3. 单元测试覆盖 choices 单选解析、score 打分解析、原生 questions 透传以及错误拦截。
4. Live 真实网络测试成功调用并返回真实决策概率与置信度。
5. 门禁检查通过：`pnpm verify:tools` 和单测绿灯。
