# Spec: 商品内容研究雷达与 Jev 爆款匹配引擎 (Issue #2489)

## 1. 业务目标与愿景
为解决短视频创作者与跨境电商卖家“拥有海量灵感库，但无法针对特定商品精准打捞爆款与高效分析”的痛点，构建一套以商品为驱动的【内容研究与 Jev 爆款匹配流水线】：
1. **输入商品**：自动从商品库拉取或由用户手动输入商品名称、卖点与客群。
2. **关键词雷达裂变**：基于固化的 10 维系统提示词，逆向推导 10 组涵盖测评、功效、痛点、对比、日常、构造、终极状态、高颜值、避坑、对标PK的高转化搜索词。
3. **Jev 毫秒级多维匹配**：调用 Jev 决策模型从全库视频元数据中极速筛选对标素材，完成钩子提取与多维打标。
4. **实时数据分析看板**：在页面上流式呈现匹配结果，并按黑马视频、黄金钩子、带货转化、发布时段热力图与核心达人 6 大维度呈现深度数据洞察。

## 2. 核心架构与契约规范

### 2.1 关键词生成器与提示词固化 (`src/radar/keyword-generator.js`)
- **固化提示词存储**：默认读取 `.workbuddy/prompts/product-keyword-generator.prompt.md` 或内置契约。
- **10 维模态标准**：
  1. `review` (真实测评类)
  2. `benefits` (功效价值类)
  3. `pain_point` (痛点场景类)
  4. `before_after` (前后对比类)
  5. `daily_routine` (翻包日常类)
  6. `how_it_works` (构造解密类)
  7. `outcome` (终极状态类)
  8. `aesthetic` (明星外观类)
  9. `honest_review` (无广避坑类)
  10. `versus` (对标PK类)

### 2.2 匹配引擎与 Jev 决策调用 (`src/radar/radar-matcher.js`)
- 遍历灵感库已有记录（标题、文案、AI五维拆解、标签）。
- 结合多关键词命中词频与 Jev 决策模型评分标准（`score_criteria`: `["Unrelated", "Low Match", "Moderate Match", "High Match", "Perfect Match"]`）。
- 聚合出 6 大研究分析维度（总匹配数、黑马爆款、前3秒钩子聚合、带货橱窗统计、24小时发布时段热力图、核心创作者分布）。

### 2.3 HTTP 路由契约 (`src/radar/radar-routes.js`)
- `POST /omnimux/inspiration/radar/keywords`
  - Body: `{ product: object }`
  - Response: `{ success: true, keywords: Array<KeywordItem> }`
- `POST /omnimux/inspiration/radar/match`
  - Body: `{ keywords: string[], product?: object, region?: string }`
  - Response: `{ success: true, items: Array<MatchedVideoItem>, analytics: object }`

### 2.4 前端体验契约 (`src/client/ProductRadarStage.jsx`)
- 严格遵循 DSH 原生纯黑（`#111113`）+ 极光紫（`#7961f2`），坚决禁用蓝色。
- 提供商品信息卡、10 维药丸标签勾选区、Jev 流式状态指示器与 6 大数据分析看板。

## 3. 测试与验证标准
- 核心算法纯单元测试通过率 100%。
- HTTP 路由端点契约测试通过。
- 零外部网络依赖，严格通过 deny-network 门禁。
