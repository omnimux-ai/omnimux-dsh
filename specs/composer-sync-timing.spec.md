# 规格说明：输入框文本模型清单启动期与异步时序同步增强 (Issue #2272)

## 1. 目标与背景

会话输入框文本模型清单目前由 `composer-sync.js` 统一根据中枢已上架目录（仅 `gemini-3.8-flash`）收敛 `llm-pi-ai` 路由。但在应用冷启动时，Cordis 插件依赖注入存在异步时序竞争：
若 `apply.js` 执行首次同步时，`@deepseek-ai/dsh-llm-pi-ai` 尚未完成其命名空间与路由描述符的注册，`settings.describe()` 将返回 `namespace-absent`。
如果缺少重试与事件唤醒，输入框将永久停留在出厂的 11 个模型硬编码假名单（包含大量未开放的 Claude、GPT、Grok 等）。

本任务目标：
1. 在 `apply.js` 中增加事件唤醒机制（监听 `llm/adapters-updated` 事件及 `omnimux/model-catalog-updated`）；
2. 在初次同步遇到 `namespace-absent` 或未命中时提供有界渐进退避重试机制（如 200ms、800ms、2000ms），确保一旦底座依赖就绪立即收敛；
3. 保留并增强失败闭门不变量：绝不清空、不猜字段、纯减法过滤；
4. 保证在真实运行时中，输入框模型列表真实仅展示执行中枢真正上架且开放的模型（当前基线仅 Gemini 3.8 Flash）。

## 2. 验收标准

1. **时序解耦与事件驱动**：当 `llm/adapters-updated` 事件触发时，自动调用 `syncComposerList` 执行收敛；
2. **渐进退避重试**：单次同步若因 `namespace-absent` 失败，自动在后续定时窗口中重试，直至成功或重试耗尽；
3. **单测覆盖**：在 `composer-sync.test.js` 中新增针对滞后注册与事件触发重试的用例，用例 100% 绿灯；
4. **物化验证**：在开发版环境中实测验证，模型列表收敛至中枢实际可用模型，不再包含未上架的 Claude / GPT 等。
