# 规格说明：Gemini 3.8 Flash 与 Claude Sonnet 4.6 畅享版 (pool) 接入执行中枢

## 1. 业务目标与需求背景
生产 VPS 上 Magpie 服务作为自建号池边车服务已上线（Channel 76 [自建号池-Magpie] Google 专线），覆盖 `gemini-3.8-flash` 与 `claude-sonnet-4-6` 模型，上游分组标识为 `pool`，网关计费倍率为 0.285714。
本任务在 OmniMux 执行中枢（`plugins/omnimux`）为：
1. `gemini-3.8-flash` 接入 `pool`（畅享版）渠道线路分组；
2. `claude-sonnet-4-6` 完成全套模型契约注册与 `standard`（标准版）、`pool`（畅享版）线路分组接入；
3. 同步工作流画布（`plugins/omnimux-workflow`）镜像配置与命名规范白名单，保证中枢与消费端原子对齐与门禁全绿。

## 2. 契约格式与参数规格

### 2.1 档位白名单与分组规范
- **白名单档位词新增**：`畅享版`（对应 `pool` 分组，客户价值语义：自建集群随取随用、高并发专线，每族数量 ≤ 1）。
- **构词法与禁用词**：满足「价值词 + 版」，严格杜绝采购黑话（`号池` 等禁用词禁止出现在 `label` 与 `badge`）。

### 2.2 模型与线路定义
#### gemini-3.8-flash
- 追加第 3 档：
  - `id`: `"pool"`
  - `label`: `"畅享版"`
  - `badge`: `"自建集群 · 随取随用"`
  - `pricing`: `{ "pointsEstimate": 28, "discountRate": 0.2857, "billingMode": "per_token" }`
  - `sla`: `{ "stability24h": 96, "avgWaitTimeSec": 10 }`
  - `wireGroup`: `"pool"`
  - `enabled`: `true`

#### claude-sonnet-4-6
- 注册文本模型契约：
  - `id`: `"claude-sonnet-4-6"`
  - `label`: `"Claude Sonnet 4.6"`
  - `family`: `"anthropic"`
  - `role`: `"standard"`
  - `operations`:
    - `chat`: 文本对话，prompt (node_field, min: 1, max: 1)
    - `vision_chat`: 多模态图文对话，prompt + reference_images (upstream_edge, min: 0, max: 10, png/jpeg/webp)
- 渠道分组：
  - 第 1 档（标准版）：
    - `id`: `"standard"`
    - `label`: `"标准版"`
    - `badge`: `"Anthropic 官方专线"`
    - `pricing`: `{ "pointsEstimate": 1500, "discountRate": 1.0, "billingMode": "per_token" }`
    - `sla`: `{ "stability24h": 98, "avgWaitTimeSec": 12 }`
    - `wireGroup`: `"default"`
    - `enabled`: `true`
  - 第 2 档（畅享版）：
    - `id`: `"pool"`
    - `label`: `"畅享版"`
    - `badge`: `"自建集群 · 随取随用"`
    - `pricing`: `{ "pointsEstimate": 428, "discountRate": 0.2857, "billingMode": "per_token" }`
    - `sla`: `{ "stability24h": 95, "avgWaitTimeSec": 15 }`
    - `wireGroup`: `"pool"`
    - `enabled`: `true`

## 3. 验收标准
- [ ] `node scripts/verify-channel-group-naming.mjs` 绿灯通过。
- [ ] `pnpm verify:model-contracts` 严格模式绿灯通过。
- [ ] `pnpm verify:cross-plugin-models` 跨插件对齐检查绿灯通过。
- [ ] 执行中枢单元测试 `pnpm --filter omnimux test` 全量通过。
- [ ] `pnpm hub:interfaces` 重新生成执行中枢接口全景面板。
