---
title: "OmniMux 渠道分组定价推导与真实性契约 (Channel Group Pricing)"
id: "contract-channel-group-pricing"
type: "contract"
status: "living"
authority: "L1"
date: "2026-10-05"
updated: "2026-10-25"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
related:
  - "docs/contracts/channel-group-naming.md"
  - "docs/contracts/model-list-ownership.md"
  - "docs/contracts/omnimux-contracts-architecture.md"
---

# OmniMux 渠道分组定价推导与真实性契约

本规范约束渠道分组积分（`pointsEstimate`）的来源与对账要求，不是对外价目表。2026-10-05 的倍率与折扣只作历史记录，不能当当前金额、也不能恢复旧分组选价入口。统一对外口径与内部低价优先是不同层面，见[产品定位](product-positioning.md)。

> **上游依据**：执行网关官方定价元数据 `GET https://api.omnimux.ai/api/pricing`（`data[].model_ratio`, `group_ratio.pool`），经网关快照进入中枢目录投影。
> **级别**：**强制 (MANDATORY)** —— 由 `pnpm verify:group-pricing` 离线门禁拦截（**本地按需执行**，未接入 `test:gates` 或 CI）。

## 一、核心原则：单一真源，消灭手工臆造

渠道线路与价格只有一条真源链：**网关快照 → 中枢目录 `channelGroups` 投影 → 各消费方（画布、应用页、媒体查看器）**。同一条规则只允许一处权威表述，其余位置只做消费，禁止手抄第二份镜像（[契约单一真源](omnimux-contracts-architecture.md)）：

1. **线路集合**来自网关快照的 `enable_groups`；**价格**来自快照的 `group_ratio` + 每模型计费，由 `estimatePointsFromGateway` 推导。中枢展示覆盖表只决定 label / badge / SLA / constraints / 默认线路，**不决定某条线路是否存在、也不决定它多少钱**。
2. **消费方不得手抄第二份**：画布渠道菜单直接渲染目录行自带的 `channelGroups`（`row.channelGroups`），本地只保留纯格式化函数与运行期自备（BYOK）渠道的展示表。画布侧历史上的 `MODEL_CHANNEL_GROUPS` 镜像与手抄倍率已在 Issue #3762 删除。
3. **没有可比数字时不编造**：网关按表达式或按上报 token 计费的线路，`pointsEstimate` 为 `null`，由 `pricing.pointsNote` 说明原因；消费方照实展示该说明，不得用一个没有可比意义的倍率折算。

## 二、机械门禁防御

3. **机械门禁防御**：`pnpm verify:group-pricing` 是**离线**门禁，本地按需执行；它**未接入 `test:gates`，也不在 CI**（现状见 [plugin QA · 模型与渠道门禁的自动化归属](plugin-qa.md#模型与渠道门禁的自动化归属)）。发现脱离网关底表比值或两端不一致时判红，须在合入前确认已实际执行，不得写成自动阻断。它校验两件事，全部对着上面的真源：

   1. **投影 vs 快照**：目录每条线路的积分必须等于 `estimatePointsFromGateway` 用该快照单价/按次价与分组倍率重算的结果；无可比数字的线路必须带 `pointsNote`；非 token 计费线路的积分必须落在 0–100 安全区间。
   2. **画布零本地价格表**：画布渠道模块不得出现 `MODEL_CHANNEL_GROUPS`、`pointsEstimate: <数字>` 或 `groupRatio: <数字>`。

   跨插件的「目录投影 vs 画布消费」逐字段一致性由 `pnpm verify:cross-plugin-models` 覆盖；门禁自测见 `scripts/verify-channel-group-pricing.test.mjs`。
