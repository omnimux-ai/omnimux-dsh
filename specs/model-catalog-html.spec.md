---
title: "持久化执行中枢模型全景面板与实时映射规范"
id: "spec-model-catalog-html"
type: "acceptance-spec"
status: "active"
date: "2026-09-14"
authors: ["agent"]
issue: 1704
---

# 持久化执行中枢模型全景面板与实时映射规范

在模型契约层治理中，执行中枢模型资产及状态（各模态分组、品牌归属、模型 ID、别名映射、官方就绪状态）对于日常协作、架构审核与业务排查至关重要。交付一个随本地代码/配置动态更新的独立持久化可视化工具，并注册入工作区指南。

## 1. 范围

| 交付项 | 说明 |
|---|---|
| 动态生成脚本 | 新增 `scripts/generate-model-catalog-html.mjs`，动态加载 `plugins/omnimux/src/catalog/contract/load.js` 真实契约与 `dispositions.json`，支持一键实时编译出单文件静态面板。 |
| 持久化单文件 HTML | 产出 `docs/tools/model-catalog.html`，页面包含完整的 50 款模型全息数据、5 大模态分组、品牌归属、能力操作、就绪状态及 26 项别名映射。界面提供即时搜索、模态过滤、就绪状态过滤与纯净极简黑白灰深浅色质感体验。 |
| 便捷命令配置 | 在根目录 `package.json` 中配置 `"catalog:html": "node scripts/generate-model-catalog-html.mjs"`，方便一键执行。 |
| AGENTS.md 规范注册 | 在 `AGENTS.md` 的 `Source map` 索引表中登记 `docs/tools/model-catalog.html`，说明其用途为「执行中枢模型全景面板，实时映射契约规格与处置配置」。 |

## 2. 验收标准

1. `docs/tools/model-catalog.html` 自包含可用，无任何外部无法离线访问的资源，可在浏览器或桌面端会话侧边栏通过 `sidebar_open` 秒开；
2. 页面中的模型数量（50 款）、处置记录（76 条）、就绪状态（26 款就绪，24 款草稿/存根）与契约门禁 `node scripts/verify-model-contracts.mjs --strict` 的数据 100% 吻合；
3. 搜索与筛选功能完全正常，支持按名称、模型 ID、品牌模糊过滤；
4. `AGENTS.md` 完成注册登记；
5. 门禁校验与自动化测试全绿。
