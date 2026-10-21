# 规范：AutoModelPicker 选择无 reasoning 模型时清空 effort（Issue #3540）

## 1. 问题

#3529 修了设置页 `ModelSelector`，但面板底部 `AutoModelPicker.handlePick` 固定传 `effort=undefined`；`App.handleSelectModel` 把 undefined 解释为沿用旧 effort，仍把 `max` 写进 `agent-default-model` 与 `session.selectModel`，选择 CPA Anti / Gemini 3.8 Flash High 后报 `does not support reasoning effort "max"`。

## 2. 方案

- `PickerModelRow` 增加 `reasoning`，在 `session.modelCatalog` / bridge-config 拍平阶段透传。
- `handlePick` 用 `pickEffortForRow` 计算：无 efforts → `''`（App 清除）；有 efforts → 合法 defaultEffort 或首个。
- 复用 #3529 的 `handleSelectModel` 空 effort 清除逻辑，不改协议。

## 假设

根因假设：面板底部选择器的报错与设置页同源——选择动作没有按模型 reasoning 元数据传入 effort，导致旧的 `max` 被沿用。只要该选择器对无 reasoning 模型显式传空 effort，既有清除逻辑即可消除报错，且无需改 provider。

## 证伪方式

在真实面板底部选择 `CPA Anti / Gemini 3.8 Flash High` 后发消息：若仍出现 `does not support reasoning effort`，或 `settings.describe` 的 `agent-default-model.reasoningEffort` 仍为 `max`，即证伪。先跑 `pnpm exec vitest run tests/auto-model-picker.spec.ts` 验证空 effort 分支。

## 3. 验收

- 单测：reasoning 透传；无 reasoning 行返回空 effort；有 reasoning 行返回 defaultEffort/首个。
- 扩展构建/测试通过。

## 4. 边界

R1；不改 provider adapter、模型目录与海报观点通道。
