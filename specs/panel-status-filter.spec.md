---
title: "接口全景面板模型区块「已就绪 / 已登记」状态筛选"
id: "spec-panel-status-filter"
type: "acceptance-spec"
status: "active"
date: "2026-09-14"
authors: ["agent"]
issue: 1734
---

# 模型区块状态筛选

在接口全景面板（`docs/tools/hub-interfaces.html`）的模型能力区块增加「已就绪 / 已登记」状态筛选，与既有「接口分类筛选」「关键词搜索」叠加生效。

## 1. 范围

- 生成器 `scripts/generate-hub-interfaces-html.mjs`：模型卡片新增 `data-status="listed|draft"`；工具栏新增「全部状态 / 已就绪 N / 已登记 N」筛选组（带中性分隔符）；过滤逻辑新增状态维度，启用状态筛选时视图自动聚焦模型区块；结果行标注当前生效的状态与关键词。
- 重新生成 `docs/tools/hub-interfaces.html`。

## 2. 验收标准

1. 初始显示 50 款模型（就绪 26 / 登记 24），筛选控件计数与内嵌数据一致。
2. 选「已就绪」仅显示 26 款就绪模型且非模型接口不混入；选「已登记」仅显示 24 款登记模型。
3. 状态筛选与关键词搜索可叠加；清空关键词后状态筛选保持；切回「全部状态」恢复 50 款。
4. 结果行正确标注筛选条件；视觉遵循 design.md 黑白中性双主题与 32px 控件基准。
5. `git diff --check` 干净；`node scripts/verify-model-contracts.mjs --strict` 全绿。
