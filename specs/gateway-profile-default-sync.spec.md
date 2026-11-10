# 同步网关默认推理与推荐元数据

## Objective

网关 Issue #769 / PR #771 已将 `reasoning_efforts`、`default_reasoning_effort` 和顶层 `defaults` 发布到公开合同。插件侧只做消费与复核：

- `executionProfile` 携带 `defaultReasoningEffort`；
- 分析默认优先使用网关 `defaults.vision_chat`；
- 模型设置页的思考等级默认值优先使用当前文本模型的 `defaultReasoningEffort`；
- 线上 API 尚未发布新字段时保持现有安全回退，不修改网关源码。

## New-user baseline

新用户只安装插件并登录。网关未提供新字段时，插件使用现有目录默认和本地回退；网关提供字段后，下一次目录刷新自然生效，不要求用户手工改配置。

## Structure and contracts

- `plugins/omnimux/src/catalog/execution-profile.js`：把 `default_reasoning_effort` 映射为 `defaultReasoningEffort`，只在它是 `reasoning_efforts` 的键时保留。
- `plugins/omnimux/src/catalog/list.js`：分析默认从 `gatewayDefaults.vision_chat` 解析，且只接受 ready 的分析行。
- `plugins/omnimux/src/client/ModelsSettingsCard.jsx`：思考等级默认优先取所选模型的 `executionProfile.defaultReasoningEffort`。
- `docs/contracts/hub.md` / `docs/contracts/model-list-ownership.md`：补充新字段说明。
- 绑定快照：网关生产 `/api/pricing` 尚未出现新字段时，不伪造 bundled snapshot；待线上发布后刷新 `plugins/omnimux/src/catalog/cloud/bundled/pricing.json` 并执行 snapshot check。

## 假设

- 网关 PR #771 合并后，生产 `/api/pricing` 会在部署窗口内发布 `defaults` 与 `reasoning_efforts` / `default_reasoning_effort`；插件不依赖未部署的字段，也不自行猜测。
- `defaults.vision_chat` 与现有 `chat` 推荐共享同一套 on-sale 过滤规则；不可见的推荐必须省略。
- 已有的显式用户默认和显式思考等级优先于网关推荐。

## 证伪方式

- 用包含 `defaults.vision_chat` 和 `default_reasoning_effort` 的 fixture snapshot 运行目录与设置组件测试；若分析默认不取 `vision_chat`、思考等级不取该模型的默认档位，或缺失字段被猜出值，则方案失败。
- 用没有新字段的旧 snapshot 运行测试；若现有默认解析、启动或设置页回退被破坏，则方案失败。
- 线上 `/api/pricing` 发布后刷新 snapshot，若 `catalog:snapshot:check` 不一致，则同步未完成。

## Acceptance

- `executionProfile` 对新字段做可选透传；缺失时字段不存在。
- 分析默认、设置页思考等级默认按网关推荐解析；显式用户值优先。
- 新字段 fixture、旧字段回归、`verify:model-contracts` 和 `catalog:snapshot:check` 通过。
- 不修改网关代码、不发起真实模型请求。
