# Spec: 商品查爆款视频双轨打捞引擎（云端内库+外部社媒接口保底满足20条标准匹配）(Issue #2498)

## 1. 业务目标与愿景
在出海短视频营销与爆款选品调研场景下，单一的内部数据库在细分或长尾品类中不可避免存在数据稀疏问题（例如香水喷雾瓶在 2943 条内部库中合格对标仅 11 条）。
为彻底解决“命中数量过少、内容受限”的痛点，构建「**双轨补水机制（Dual-Track Pool Expansion）**」：
- **第一轨（云端内部库）**：快速扫描已有 2943 条精选灵感库，秒级提取已有高分资产；
- **第二轨（外部社媒接口）**：当第一轨命中数 `< 20 条`（可配置 `target_min`）时，自动携带 10 维关键词调用外部社媒搜索接口（TikTok 公域视频检索），动态补充打捞全网新素材补齐差额；
- **裁决层（TypeSafe Jev）**：双轨汇总候选视频统一送入 Jev 决策模型，执行前 3 秒钩子提炼与 0~100 质量评分，过滤噪音；
- **交付看板**：确保向用户交付至少 20 条高质量、带清晰来源标记（【云端精选】vs【全网雷达】）的标准对标爆款视频矩阵，并支持真实在线流式预览。

## 2. 接口契约与数据结构

### 2.1 后端扩展：`POST /omnimux/inspiration/local/radar/match`
- **请求体（Request Body）**：
  ```json
  {
    "keywords": ["Comfort Bay perfume atomizer review", "travel perfume spray TSA"],
    "product": { "name": "5ml便携迷你香水喷雾瓶", "brand": "Comfort Bay" },
    "target_min": 20,
    "region": "ALL"
  }
  ```
- **响应体（Response Body）**：
  ```json
  {
    "success": true,
    "items": [
      {
        "id": "insp_...",
        "title": "...",
        "source_track": "internal" | "external",
        "jev_score": 98,
        "matched_keyword": "...",
        "hook_category": "...",
        "embed_url": "...",
        "views": 12400000
      }
    ],
    "analytics": {
      "total_delivered": 20,
      "internal_count": 11,
      "external_count": 9,
      "hooks_summary": [...]
    }
  }
  ```

### 2.2 外部社媒搜索补齐算法 (`src/radar/radar-matcher.js`)
- 当 `internalMatches.length < targetMin` 时：
  计算 `deficit = targetMin - internalMatches.length`；
  调用外部打捞函数 `fetchExternalSocialCandidates(keywords, deficit)`；
  将外部候选对象标准化为灵感条目形态（含 title, cover_url, embed_url, views, author, hook）；
  经 Jev 统一评分后合并，去重并排序，最终截取 `targetMin` 条。

## 3. 前端交互与账本
- 上限选择器默认增加 `20 (标准交付)` 选项；
- 卡片增加双轨徽标：`云端精选` vs `全网雷达`；
- 运行账本展示：
  - `① 关键词生成`（大模型耗时+费用）
  - `② Jev 决策打标`（Jev 耗时+费用）
  - `③ 云端内库打捞`（内库条数+耗时）
  - `④ 外部社媒补齐`（外网条数+耗时）
  - `本轮合计` 与 `会话累计`

## 4. 自动化测试与验收
- 单元测试覆盖双轨补齐逻辑（内库不足时触发外部补足至 20 条，已足时不重复触发）；
- ego-browser 实机自动化测试端到端跑通，验证 20 条全量渲染且各具特色。
