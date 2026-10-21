# 规范：无 reasoning 元数据的模型不得继承 max 推理等级（Issue #3529）

## 1. 问题

截图报错：`provider "cpa-anti" model "gemini-3.8-flash-high" does not support reasoning effort "max"`。`session.modelCatalog` 中 CPA Anti 的 `gemini-3.8-flash-high` 没有 `reasoning` 字段，但 `ModelSelector` 对空 efforts 回退 `DEFAULT_FALLBACK_EFFORTS`，并继续把上一模型/默认的 `max` 传给 `settings.mutate` 与 `session.selectModel`。

## 2. 方案

- `ModelSelector` 导出 `resolveEffortForModel(item, current)`：无 efforts 返回空串；有 efforts 时取 current、defaultEffort、首个合法值。
- 无 reasoning 元数据时隐藏推理等级控件；选择/切端口/实时目录加载后用 helper 归一化，空 effort 不传 max。
- `App.handleSelectModel`：`effort === ''` 视为清除，`settings.mutate` 写 `unset reasoningEffort`，`session.selectModel` 不带 effort，并清除本地 effort 存储；provider 持久化到 `omnimux_default_provider`。
- 有 reasoning 元数据的模型行为不变。

## 假设

根因假设：报错不是 CPA 模型本身不可用，而是面板在模型切换时没有按模型的 reasoning 元数据归一化 effort，把旧值 `max` 一并写进了 agent-default-model 与 session.selectModel。只要对无 reasoning 元数据的模型清除 effort，Dev 里已能单独使用的该模型就能在扩展会话中正常对话。

## 证伪方式

在真实面板选择 `CPA Anti / Gemini 3.8 Flash High` 后发一条消息：若仍出现 `does not support reasoning effort` 即证伪；同时可看 `settings.describe` 的 `agent-default-model.reasoningEffort`，若仍为 `max` 也证伪。命令：`node --test extensions 相关单测` 与 Dev 面板实测截图。

## 5. 验收

- 单测：`resolveEffortForModel` 对无 reasoning 模型返回 `''`；对支持模型返回合法值；`''` 不会变成 `max`。
- 扩展构建/测试通过；真实浏览器回归证据留存。

## 6. 边界

R1；不改 provider adapter、模型目录、Dev 配置；本任务不实现海报观点改走 session.prompt。
