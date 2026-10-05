# 垫图（multi_reference）剩余模型真实状态取证

日期：2026-10-05 · 任务：#3148 后续（工作树 `multiref-rest-3150`）· 基线：`origin/main`（含 PR #3149 的 Seedream 5.0 Pro）

本文件记录 7 个未闭环模型的逐条终态与原始证据，供后续任务与上游（网关仓 `/Users/x/Desktop/Project/OmniMux`）对接。

## 一、结论总表

| 模型 | 上游能力合同 | 本仓规格 | 真机垫图结果 | 终态 |
| --- | --- | --- | --- | --- |
| nano-banana-2 | 200（含图生图） | 有（实现未启用） | 网关适配器拒绝 | 阻塞：网关侧适配器选型 |
| nano-banana-pro | 200（含图生图） | 有（实现未启用） | 未提交（实现未启用） | 阻塞：同上 |
| mj-v7 | 200（含图生图） | 有（实现已启用） | 提交成功但任务号不可读 | 阻塞：统一任务命名空间不可读 |
| mj-v8-1 | 200（含图生图） | 有（实现已启用） | 提交成功但任务号不可读 | 阻塞：同上 |
| seedream-5-0-pro | 200 | 有 | **成功**（文生图 + 垫图各 1 次） | **已上架**（PR #3149 已合入） |
| gpt-image-2.5-hd | 404 | 无 | 无法提交 | 阻塞：上游无能力合同 |
| grok-imagine-image-2-0 | 404 | 无 | 无法提交 | 阻塞：同上 |
| grok-imagine-image-quality | 404 | 无 | 无法提交 | 阻塞：同上 |

## 二、原始证据

### 2.1 上游能力合同探测（`GET https://omnimux.ai/api/model_contract/<id>`）

- 200：`nano-banana-2`、`nano-banana-pro`、`mj-v7`、`mj-v8-1`、`seedream-5-0-pro`；合同 `operations` 均为 `[text_to_image, image_to_image]`（本仓 `multi_reference` 对应上游 `image_to_image`）。
- 404：`gpt-image-2.5-hd`、`grok-imagine-image-2-0`、`grok-imagine-image-quality`；且三者在 `plugins/omnimux/src/catalog/specs/image-models.yaml` 中零命中，无法定义契约。

### 2.2 真机垫图（经中枢 `imageGenerate` 缝隙，`mode: live`，令牌组 48）

- `nano-banana-2#multi_reference`：
  - 首次（实现未启用）：`omnimux-invalid-request: operation multi_reference has no implementation.profileId`（4 ms，未发出网络请求）。
  - 启用实现后再试：`ADAPTER_FAILED: Adapter openai-compatible failed: not supported model for image generation, only imagen models are supported (request id: 202610051329388527087458268d9d6rrFAmBjd)`（4593 ms）。
  - 说明：网关在册（`omnimux models` 共 119 个，含 `nano-banana-2` / `nano-banana-pro` / `mj-v7` / `mj-v8-1` / `seedream-5-0-pro`），但把该模型路由到只认 imagen 的 OpenAI 兼容适配器 → **属网关侧适配器选型缺陷，本仓无法修复**。
  - 交叉线索：网关仓存在并行工作树 `feat/nanobanana-onboard`（提交 `984a11c80` / `87835617a` / `b4f2efb29`），正在为 `gemini-3.1-flash-image`（Nano Banana 2 上游线）补 `modelcontracts/contracts.json` 与治理规格 —— 与本条阻塞同源。
- `nano-banana-pro#multi_reference`：`omnimux-invalid-request: operation multi_reference has no implementation.profileId`（3 ms）；同一适配器缺陷，未重复消耗。
- `mj-v7` / `mj-v8-1`：提交返回 200，但任务号形如 `task-unified-1791201739-cr1kn0el`，在 `/v1/images/generations/{id}`（400 `task_not_exist`，重试 4 次）、`/v1/tasks/{id}`（404）、`/v1/tasks/{id}/artifacts`（404 `artifact_not_found`）、`/api/v1/*`（404 `Invalid URL`）均不可读；网关 Go 源码无 `task-unified` 字样 → **网关侧统一任务读路径缺失**。
- `seedream-5-0-pro`：文生图 `task_j6VmecroAIwPKfNl6H7OzIw8vqIWSPMf`（33,970 ms，94,869 B JPEG 1424×800）；垫图 `task_zkVJMEU1RhYdd8acx6ldcJG0A4jEOeHU`（117,287 ms，116,972 B JPEG 1424×800，volces TOS 签名地址）。

### 2.3 本次新增发现（本仓侧，待与网关修复同批落地）

`nano-banana-2` / `nano-banana-pro` 在本仓 `image-models.yaml` 中 `implementation.status: "none"`，垫图操作没有执行档，真机验证在**发出任何网络请求之前**即被拒绝。因此网关适配器修复后，仍需在本仓把这两个模型的操作实现升为 `ready` 才能完成验证；该改动已在本次探测中验证有效（错误由「无执行档」推进到「网关适配器拒绝」），为避免在主干预留半成品状态，已还原，留待与网关修复同批原子落地。

## 三、未闭环项与下一步

1. 网关侧（另一仓库，需授权）：为 `nano-banana-2` / `nano-banana-pro` 指定 Gemini 图像适配器；补齐 `task-unified-*` 的读路径（`/v1/images/generations/{id}` 与 `/v1/tasks/{id}`）。
2. 本仓侧（网关修复后）：把两个 nanobanana 模型的垫图实现升为 `ready` → 真机取证 → 研究状态升 `verified` + 绑定本文件 → 上架判定 + 画布白名单 + 门禁核验。
3. `gpt-image-2.5-hd` / `grok-imagine-image-2-0` / `grok-imagine-image-quality`：上游无能力合同且本仓无规格行，维持不上架；如需接入，先在上游注册能力合同。
