---
title: "OmniMux 渠道分组定价推导与真实性契约 (Channel Group Pricing)"
id: "contract-channel-group-pricing"
type: "contract"
status: "living"
authority: "L1"
date: "2026-10-05"
updated: "2026-10-08"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
related:
  - "docs/contracts/channel-group-naming.md"
  - "docs/contracts/model-list-ownership.md"
---

# OmniMux 渠道分组定价推导与真实性契约

本规范保留既有 `pointsEstimate` 的来源与对账要求，不是角色创作的对外价目表。下列倍率和折扣是 2026-10-05 的基准记录，不能当当前金额或恢复旧分组选价入口的依据。统一对外口径与内部低价优先是不同层面，见[产品定位](product-positioning.md)；本次未改计费或路由。

> **上游依据**：执行网关官方定价元数据 `GET https://api.omnimux.ai/api/pricing`（`data[].model_ratio`, `group_ratio.pool`）。
> **级别**：**强制 (MANDATORY)** —— 由 `pnpm verify:group-pricing` 机械门禁强制拦截。

## 一、核心原则：消灭手工臆造，统一算价推导

所有暴露给创作画布与消费端的渠道分组预估积分（`pointsEstimate`）必须具有客观上游依据，严禁 Agent 或人工根据主观感觉填写：

1. **文本模型计费对账法则**：
   - 官方标准专线（`standard` / `default`）积分严格锚定网关公开 `model_ratio`：
     - `gemini-3.8-flash`（ratio: 0.375）标准基准为 **100 积分**；
     - `claude-sonnet-4-6`（ratio: 1.500）倍率为 Gemini 的 4 倍，标准基准严格为 **400 积分**；
   - 自建号池畅享档（`pool`）严格按照网关公布的分组折扣系数（`pool: 0.285714`，即 2.9 折）折算：
     - Gemini 3.8 Flash 畅享版：`100 * 0.2857 = 28 积分`；
     - Claude Sonnet 4.6 畅享版：`400 * 0.2857 = 114 积分`。

2. **双端逐字镜像一致**：
   - 执行中枢（`plugins/omnimux/src/catalog/serving/channel-groups.js`）与创作画布镜像（`plugins/omnimux-workflow/.../channelGroups.ts`）的 `pointsEstimate` 序列必须严格逐字匹配。

3. **机械门禁防御**：
   - CI 与代码提交时执行 `pnpm verify:group-pricing`，发现脱离网关底表比值或两端不一致时立即阻断合入。
