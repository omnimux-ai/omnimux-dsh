# 中枢目录带上渠道分组价格（面板与 Agent 同源）

- 任务工作树：`.worktrees/omnimux-catalog-pricing-issue-2156`（分支 `agent/omnimux-catalog-pricing-issue-2156`）
- 基线：`origin/main` @ `69e0142d2`
- Issue：#2156
- 日期：2026-09-17

## 1. 背景与问题

只读审计（`.agent-reports/model-selection-audit/REPORT.md`）确认：

- **G4**：输入框模型面板只渲染 name / subtitle / badge，**没有任何价格**。
- **G3 前置**：Agent 侧工具无价格入参、无价格返回；`modelCatalog` seam 只供前端。

价格的唯一真源已经存在——`plugins/omnimux/src/catalog/serving/channel-groups.js` 的 `MODEL_CHANNEL_GROUPS`，每条线路带 `pricing.pointsEstimate` / `billingMode` / `priceRatio` 与 `constraints`，创作画布侧也已镜像展示。缺的是把它带进**中枢目录 DTO**，让面板（以及后续 Agent 查价）共用同一来源，而不是各自再抄一份。

## 2. 目标

1. `projectModelDto` 为每个模型补 `channelGroups`（分组粒度：id、label、badge、wireGroup、pricing、constraints、enabled）。
2. `/omnimux/model-catalog` 的 `models[]` 直接带上该字段。
3. 输入框模型面板展示价格：有积分显示「≈N 积分」，无积分但有序价倍率显示「×N 倍率」，两者皆无显示「暂无报价」。
4. 未配置分组的模型返回空数组，字段始终存在——调用方无需区分「字段缺失」与「列表为空」。

## 3. 设计

```
catalog/serving/channel-groups.js  MODEL_CHANNEL_GROUPS   ← 价格唯一真源（已存在）
        │ getModelChannelGroups(modelId)
        ▼
catalog/project.js  projectChannelGroups(modelId)  →  净化后的分组数组
        │ 挂到 projectModelDto 输出
        ▼
/omnimux/model-catalog  models[].channelGroups
        │
        ├─→ market 面板渲染价格（本轮）
        └─→ Agent 查价（后续议题）
```

**净化原则**：只输出面板与调用方需要的字段，不透传整条内部记录（避免把未来新增的内部字段意外变成对外契约）。

**始终存在**：`channelGroups` 恒为数组。缺字段会让调用方被迫写 `?.` 与默认值两套分支。

## 4. 验收标准（可测试）

- **AC-1**：`projectModelDto` 输出含 `channelGroups` 数组；有分组的模型其元素含 id/label/wireGroup/pricing/constraints。
- **AC-2**：无分组的模型 `channelGroups` 为 `[]`（不是 undefined、不是缺字段）。
- **AC-3**：`GET /omnimux/model-catalog` 返回体的 `models[]` 逐条带 `channelGroups`，且与 `getModelChannelGroups` 同源一致。
- **AC-4**：面板对三种情形分别渲染「≈N 积分」/「×N 倍率」/「暂无报价」。
- **AC-5**：`pnpm verify:model-contracts` 严格模式仍全绿；跨插件对齐门禁不回归。
- **AC-6**：`plugins/omnimux` 与 `plugins/omnimux-market` 定向单测全绿。

## 5. 产品基线（新用户基线）

- 分组价格来自随代码分发的常量表，不依赖开发机私有状态、不依赖网络、不依赖环境变量。
- 未配置分组的模型（如纯文本对话模型）返回空数组，面板显示「暂无报价」而非编造数值。
- 中枢目录接口不可达时，面板沿用既有降级路径（显示加载/不可用提示），不新增失败面。

## 6. 非目标

- 不改积分数值口径、不接上游实时价目（独立议题：审计 G6）
- 不做「对 Agent 可见/不可见」开关（G5）
- 不做跨模型低价择优（G2）
- 不新增 Agent 查价工具（G3 本体）

## 7. 文档影响

本步骤不新增契约文档；分组价格的既有真源与展示约定不变，仅扩大其可达面。

## 8. 风险

R2。纯投影扩展：新增字段、不改既有字段语义。最坏情况是面板价格显示不准确，不影响出片链路。
