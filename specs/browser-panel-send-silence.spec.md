# 规格 · 浏览器插件工作台发送无响应与静默吞错修复 (Issue #1757)

## 1. 目标 (Objective)
修复在推特等网页中使用 OmniMux 浏览器插件右下角悬浮工作台（`fab-companion`）发送消息时，因硬编码默认模型 `gpt-6-astra` 强行覆盖会话模型，导致非 ChatGPT 渠道（如 CPA/本地模型服务）直接以 `UNKNOWN_MODEL` 终止；以及前端在 `turn/end` 遇到错误时静默吞错、不展示任何提示且清空界面的严重体验缺陷。

## 2. 核心改动契约与六核心区
- **目标文件**：
  - `plugins/omnimux-browser/extension/src/panel/App.tsx`:
    1. 修正 `turn/end` 事件捕获：当 `event.data.reason.kind === 'error'` 时，提取具体的错误描述并调用 `setError(errorMessage)`，确保红字警告条正常渲染，杜绝静默失败；
    2. 移除强制指派 `gpt-6-astra` 的无保护调用：会话创建时，若用户未特意自定义覆盖模型（或选中的模型与 Host 默认模型一致），不调用盲目的 `session.selectModel`，继承 Host 原生配置；若明确指定了模型，查找所属的 `provider` 并成对提交 `{ sessionId, model, provider, reasoningEffort }`；
    3. 清理与校准本地存储中过期的 `omnimux_default_model_*`，防止旧脏数据残留阻断通信。
  - `plugins/omnimux-browser/extension/src/panel/components/ModelSelector.tsx`:
    1. `getDefaultModelForInstance` 优先返回 `hostDefaultModel`，不再硬编码写死 `gpt-6-astra`；
    2. 切换模型时同步更新对应提供商（provider），避免配置冲突。

## 3. 测试与验证策略
1. **单元测试**：针对 `App.tsx` 与 `ModelSelector.tsx` 编写自动化测试，验证：
   - `turn/end` 携带 `error` 时 `setError` 能正确触发；
   - 默认模型继承逻辑优先采用 Host 默认模型；
   - 错误不再被静默忽略。
2. **真实浏览器 Web 验证**：在 ego-browser 访问 `https://x.com/home`，打开右下角 OmniMux 工作台，发送“你好”，验证 15 秒内获得正式气泡回复，输入框不闪退、错误不吞。

## 4. 边界（Boundaries）
- **总是做**：遵循 Quality Loop 规范（Spec -> Code -> Verify -> Test -> Green），保持全中文汇报。
- **绝不做**：未经测试合入代码；直接修改生产配置或主工作树；遗留任何 dangling taskSpace。
