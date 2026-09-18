# 规格：将 Shopee 系列技能从官方精选下架

## 背景与业务目标
依据业务与运营策略，将 Shopee 系列 5 个技能从「官方精选」（Featured）和「首页精选推荐」（homeRecommendations）中下架，保持电商分类正常索引，但不再作为官方主推与首页推荐卡片。

## 涉及技能名单
1. `sk-shopee-market-analysis`（Shopee 市场分析）
2. `sk-shopee-product-analysis`（Shopee 商品分析）
3. `sk-shopee-shop-analysis`（Shopee 店铺分析）
4. `sk-shopee-brand-analysis`（Shopee 品牌分析）
5. `sk-shopee-keyword-analysis`（Shopee 关键词分析）

## 验收准则（Acceptance Criteria）
- **AC-1 目录精选标记下架**：在 `plugins/omnimux-market/catalog/index.json` 中，上述 5 个技能条目的 `recommended` 改为 `false`，并从 `tags` 数组中移除 `"精选"` 标签。
- **AC-2 推荐配置文件同步下架**：在 `plugins/omnimux-market/catalog/skill-recommendations.json` 中，`featuredSkills` 列表移除上述 5 个 ID（总数从 70 降至 65），`homeRecommendations` 列表移除上述 5 个 ID（总数从 20 降至 15）。
- **AC-3 精选快照生成一致性**：运行 `node scripts/generate-featured-skills.mjs` 重新生成 `featured-skills.json`，且执行 `node scripts/generate-featured-skills.mjs --check` 必须完全通过。
- **AC-4 发现页与工坊推荐回归测试**：运行 `pnpm --filter @omnimux/omnimux-market test` 及 `plugins/omnimux/src/client/session-guide/skills/skills-tab.test.js` 全量通过，确认在「官方精选」和首页推荐列表中不再呈现 Shopee 系列技能卡片。

## 新用户基线说明
新用户在首次进入技能市场或会话灵感面板时，首屏官方精选卡片与首页精选卡片中不再展示 Shopee 系列技能，原有电商分类其他技能（如 Amazon 分析、TikTok 脚本等）保持正常展示。
