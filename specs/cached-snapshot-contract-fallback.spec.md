# Spec: 缓存快照缺少 v2 合同时仍展示网关模型

- 任务：`omnimux-cached-snapshot-contract-fallback`
- 日期：2026-11-09
- 状态：active

## 目标

修复用户已在用的旧缓存快照（`~/.omnimux-dev/omnimux/catalog/anonymous/snapshot.json` 等）没有 Gateway Contract v2、导致画布文本/图片节点仍只显示一个本地模型的问题。运行时以缓存快照的成员/价格为当前视图，但当缓存快照的模型 `contract` 仍是 v1 或缺失时，应从随包 bundled snapshot 取同 ID 的 v2 contract 作为能力补充，不能要求用户清缓存或重启后才能看到新模型。

## 用户操作旅程与期望反馈

1. 用户保留旧缓存快照启动 Dev：文本节点显示 `gemini-3.8-flash` 与 `gemini-4-argon`，图片节点显示 `gpt-image-2.5` 与 `gemini-3.1-flash-lite-image`；不要求清缓存。
2. 缓存快照的成员/价格仍然优先；bundled 只补合同能力，不能用旧 bundled 覆盖缓存里的在售成员、线路和价格。
3. 缓存快照本身已含 v2 contract 时，不读取/覆盖 bundled contract。
4. 没有任何 v2 contract（bundled 也缺失）时保持旧本地规格 fallback，目录不崩。

## 假设

- 旧缓存快照仍包含当前在售模型 ID；bundled snapshot 包含同一 ID 的 v2 contract。
- 缓存快照的 `generatedAt` 可以晚于 bundled，但合同版本可能落后；成员/价格与合同能力需要按不同来源组合。
- 运行时不能访问网络；补充必须来自随包文件，不能探测真实模型。

## 证伪方式

- 用 `generatedAt` 较新、所有 `contract.schemaVersion='1.0'` 的缓存快照构建 `buildModelCatalog()`，若 text 仍只有 `gemini-3.8-flash` 或 image 仍只有 `gpt-image-2.5`，则修复失败。
- 若补充合同后缓存快照的 `enableGroups`/价格被 bundled 覆盖，或 v2 快照被 bundled 反向覆盖，则分层错误。
- 若 `verify:model-contracts --strict` 或 `catalog:snapshot:check` 因补充逻辑变红，则门禁回归。

## 验收标准

- 新增单测：v1 缓存快照 + v2 bundled 快照 ⇒ text/image 各两个网关模型；缓存 `generatedAt` 和成员数据保留。
- 既有 `gateway-contract.test.js` 的 v1 fallback 用例更新为“有 bundled v2 时补 v2、无 v2 时旧本地 fallback”。
- hub 全量测试、`verify:model-contracts --strict`、`catalog:snapshot:check` 通过。

## 边界

- 不刷新磁盘缓存、不联网、不删除用户缓存。
- 不改变缓存快照的线路/价格；只补 missing 的 v2 capability contract。
- 只处理 text/image 第一期 overlay；video/audio 保持现状。

## 旧标准变更

- `plugins/omnimux/src/catalog/gateway-contract.test.js` :: `Gateway v1 snapshot falls back to local specs instead of breaking the catalog`
  原断言 v1 快照下 text/image 只能各有一个本地模型、`missingContract` 非空；现在缓存 v1 快照会从 bundled v2 补齐同 ID 合同，因此改为断言 text/image 各两个网关模型、`missingContract=[]`，并保留旧本地规格作为无 bundled v2 时的 fallback。
