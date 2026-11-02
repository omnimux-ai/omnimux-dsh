---
id: "3901"
title: "插件详情页任务模型配置"
issue: 3901
status: active
---

# 3901 插件详情页任务模型配置：文本任务与多模态理解任务

## 目标

在官方插件管理详情页（`plugins.item` + `plugins.detail.section`，subject=omnimux）落地任务模型配置：用户可为「文本任务」与「多模态理解任务」分别挑选默认模型。补齐 `defaultAnalysisModel` 设置字段并让 hub analysis 场景与 omnimux-video `understand` 共用同一份用户选择。

## 假设

- 假设 1（≥20 字）：官方 `plugins.item` / `plugins.detail.section` 卡槽在桌面宿主由 `configForms` 服务供给，`ctx.configForms.get('omnimux')` 返回的 scope 携带 `getSnapshot() / subscribe / set / unset`，`snapshot.status==='ready'` 时值可读、`writable===true` 时可写；沿用 `omnimux-reference-storage` 已验证的挂载骨架即可挂载本卡。
- 假设 2（≥20 字）：`/omnimux/model-catalog` 的 `catalog.text` 行数组携带 `input`（可接受素材类型数组），`execute.js` analysis 场景可据此过滤出「能接受当前素材」的模型作为多模态默认；`SETTINGS_DEFAULTS.defaultTextModel` 已是官方默认的文本兜底。

## 证伪方式

- 证伪 1（≥20 字）：若 `configForms` scope 缺失或 `getSnapshot` 结构不含 `value`/`user`/`writable`，则挂载后下拉读不到值；用 `provider-config-state.test.js` 同款假 scope 跑组件级测试可证伪。
- 证伪 2（≥20 字）：若 catalog 文本行没有 `input` 数组或 `execute.js` 不消费 `defaultAnalysisModel`，则多模态默认永远落到旧路径；在 `settings/runtime-mode` 或 `text/execute` 单测里断言 `scenario==='analysis'` 时读取 `defaultAnalysisModel` 可证伪。

## 范围

- `plugins/omnimux/src/settings/schema.js`：新增 `defaultAnalysisModel`（`SETTINGS_DEFAULTS`/`FIELD_META`/`dict`/`toJSON`）。
- `plugins/omnimux/src/text/execute.js`：analysis 场景官方通道默认模型优先读 `runtimeSettings.defaultAnalysisModel`，按 `catalog.text` 行 `input` 兼容过滤，回退到原 `catalog.defaults.text` 逻辑。
- `plugins/omnimux-video/src/config.js`：`understand.defaultModel` 默认 `''`（不内建死值），execute 层为空时不再硬编码 gemini-3.8-flash，交还 hub `resolveScenarioChoice`。
- 新建 `plugins/omnimux/src/client/TaskModelsSection.jsx`：两个 `DropdownSelect`（文本任务、多模态理解任务），写 `scope.set('defaultTextModel'|'defaultAnalysisModel')`；`plugins.item`（subject-matched `omnimux`，`whileServed`）+ `plugins.detail.section` 双挂载，复用 `reference-storage` 骨架。
- `plugins/omnimux/src/client/locales.js`：补 `taskModels.*` 文案。
- `plugins/omnimux/src/client/index.js`：注册 TaskModelsSection。
- `plugins/omnimux/src/client/settings-placement.test.js`：放开 `TaskModelsSection` 相关断言（移除 doesNotMatch 覆盖范围或改为断言挂载骨架存在）。
- `docs/contracts/settings-ui.md`：occupants 表登记新卡 + 决策表补一行。
- `AGENTS.md`：写入一条「所有面向用户的可配置能力必须走官方插件配置面（settings.register + plugins.item/plugins.detail.section + configForms）」及三通道模型来源归属说明。

## 基线

全新用户机器装完登录后：官方通道默认可用，`defaultAnalysisModel` 留空时走 catalog 兼容默认；不依赖任何 dev-only 状态。

## 验证

- `pnpm --filter omnimux test` + `pnpm --filter omnimux-video test`
- `pnpm check:boundaries`
- `pnpm verify:model-contracts`
- `node --test scripts/verify-agents-md.test.mjs`
- 组件级测试复用 `provider-config-state.test.js` 假 scope 模式

## 旧标准变更

- `plugins/omnimux/src/settings/omitted-model-defaults.test.js` :: `3312: saved defaults pointing at delisted models resolve only to the fixed real published catalog`
  - 原断言：`catalog.defaults` 深比较 `{ text, image, video, audio }` 四键，无 `analysis`。
  - 必须改的理由：`catalog/list.js` 新增 `defaults.analysis` 解析键，对象形状扩展；测试不更新就永远 deepEqual 失败。
  - 新期望证据：`defaults` 增加 `analysis` 键，值等于 `defaults.text`（无 analysis 保存值时回退链）。
- `plugins/omnimux/src/settings/omitted-model-defaults.test.js` :: `3312: invalid saved defaults fall back to legal fixed catalog models and all four public executors remain usable`
  - 原断言：同上，`catalog.defaults` 深比较四键无 `analysis`。
  - 必须改的理由：同上。
  - 新期望证据：同上。
