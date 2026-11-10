# 刷新网关 execution profile 快照

## Objective

网关 Issue #769 / PR #771 已合并且线上 `/api/pricing` 已发布顶层 `defaults` 与 `reasoning_efforts` / `default_reasoning_effort`。本任务只刷新插件随包的网关快照：

- 从公开 `/api/pricing` 重新生成 `plugins/omnimux/src/catalog/cloud/bundled/pricing.json`；
- 验证 12 个模型、推荐默认和 Gemini/Grok 推理档位进入快照；
- 不修改插件运行时逻辑，不修改网关源码，不发起模型请求。

## New-user baseline

新用户未联网或首次启动时读取 bundled snapshot；刷新后离线默认与网关推荐一致，联网后仍由 live refresh 覆盖。Dev 机器上的本地模型或端口不参与默认值。

## Structure and contracts

- `plugins/omnimux/src/catalog/cloud/bundled/pricing.json`：由 `catalog-snapshot.mjs` 从 `https://api.omnimux.ai/api/pricing` 生成。
- `plugins/omnimux-assets/cloud-catalog/voice-preview-snapshot.json`：由 `export-voice-previews.mjs` 重新生成，跟随模型目录指纹。
- `plugins/omnimux/src/catalog/cloud/snapshot.js` 与 `/omnimux/model-catalog`：既有消费链路，本任务不修改。

## 旧标准变更

- `plugins/omnimux/src/catalog/list.test.js` :: `returns Catalog v1.1: models[] authority + listed-only four lists + defaults`
  - 原断言：文本默认来源为 `offline-floor`。
  - 必须改：刷新后的 bundled snapshot 已包含网关顶层 `defaults`，同一默认应标记为 `gateway-recommended`。
  - 新证据：断言来源改为 `gateway-recommended`，目录默认值和模型行保持不变；`node --test plugins/omnimux/src/catalog/list.test.js` 通过。

## 假设

- 线上 `/api/pricing` 已经发布网关 #769/#771 的 `defaults` 与推理字段；刷新脚本读取的是公开匿名接口，不依赖登录或本地服务。
- 快照只能由官方生成器写入，不手工编辑模型或字段；如果线上仍缺字段，本任务应等待而不是伪造。

## 证伪方式

- 用 `curl https://api.omnimux.ai/api/pricing` 检查 `defaults` 非空且至少有一个模型的 `reasoning_efforts` 非空；若不满足，停止刷新。
- 刷新后运行 `catalog:snapshot:check`、`verify:model-contracts` 和 `omnimux` 包测试；若快照仍缺 `defaults` 或与在线数据不一致，则同步失败。

## Acceptance

- bundled snapshot 含线上 12 个模型、顶层 `defaults`、Gemini/Grok 的 `reasoning_efforts` 与 `default_reasoning_effort`。
- `catalog:snapshot:check`、`verify:model-contracts`、`verify:models` 和 `omnimux` 包测试通过。
- 仅两个快照文件（目录快照与语音预览快照）发生变化。
