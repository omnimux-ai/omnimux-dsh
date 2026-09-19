# Spec: 全量接入网关 38 款社媒与跨境电商数据模型及专属工具集

- Issue: #2393
- 风险级别: R2（中枢官方数据能力全量对齐与跨插件接缝增强，向后兼容）
- 依据: 网关在 `tikhub.json` / `contracts.json` 中声明的 38 款数据服务模型全量真源

## 1. 业务目标与价值

### 1.1 背景与痛点
1. **数据模型缺失**：底层网关已具备 38 款社媒与电商数据模型能力，但执行中枢此前仅接入了基础的 22 款，导致 TikTok 电商（类目树、搜索联想、直播带货商品、买家秀 v2、店铺链接反查等 11 款）与达人商业画像（里程碑、深度受众洞察、带货趋势、作品集、直播间反查等 5 款）共计 16 款高价值模型在中枢无法调用；
2. **工具认知与调用成本高**：除油管（YouTube）拥有 4 款专属工具外，照片墙（Instagram）、推特（X）、海外抖音（TikTok）均未配备语义直观的一级工具，智能体与用户交互时参数繁琐；
3. **跨插件接缝缺失**：缺少 `ctx.provide('tiktok')`、`ctx.provide('instagram')`、`ctx.provide('x')` 统一跨插件服务。

### 1.2 预期成果
1. 中枢底层数据模型目录 100% 对齐网关 38 款模型，全部支持标准参数解析；
2. 为 TikTok、Instagram、X 分别提供直观的一级专属工具集；
3. 为四大社交平台全面注入跨插件服务通道（Seams），支持其他插件直接获取结构化数据。

---

## 2. 接口设计与模型目录

### 2.1 底层数据模型目录扩充（`plugins/omnimux/src/official/social-data.js`）
在 `SOCIAL_DATA_CATALOG.tiktok` 中全量补齐：
- `shop_shop_link`: `'tiktok-shop-shop-link'`（业务字段：`share_link`）
- `shop_reviews_v2`: `'tiktok-shop-reviews-v2'`（业务字段：`product_id`，扩展字段：`region`）
- `shop_categories`: `'tiktok-shop-categories'`（业务字段：`region`）
- `shop_category_products`: `'tiktok-shop-category-products'`（业务字段：`category_id`，扩展字段：`region`）
- `shop_live_products`: `'tiktok-shop-live-products'`（业务字段：`room_id`，扩展字段：`author_id`）
- `shop_live_products_v2`: `'tiktok-shop-live-products-v2'`（业务字段：`room_id`，扩展字段：`author_id`）
- `shop_creator`: `'tiktok-shop-creator'`（业务字段：`creator_uid`）
- `live_room_id`: `'tiktok-live-room-id'`（业务字段：`live_room_url`）
- `shop_search_v2`: `'tiktok-shop-search-v2'`（业务字段：`search_word`，扩展字段：`region`）
- `shop_search_suggest`: `'tiktok-shop-search-suggest'`（业务字段：`search_word`，扩展字段：`region`）
- `shop_seller_products_v2`: `'tiktok-shop-seller-products-v2'`（业务字段：`seller_id`，扩展字段：`region`）
- `creator_milestones`: `'tiktok-creator-milestones'`（业务字段：`user_id`）
- `creator_search_insights`: `'tiktok-creator-search-insights'`（业务字段：`keyword`）
- `creator_search_detail`: `'tiktok-creator-search-detail'`（业务字段：`query_id_str`）
- `creator_search_trend`: `'tiktok-creator-search-trend'`（业务字段：`query_id_str`）
- `creator_search_videos`: `'tiktok-creator-search-videos'`（业务字段：`keyword`）

### 2.2 专属 Agent 工具矩阵
在中枢 `plugins/omnimux/src/official/mount.js` 中注册专属工具：
1. **TikTok 专属工具**：
   - `omnimux_tiktok_video`（视频详情与无水印直链）
   - `omnimux_tiktok_user`（创作者资料）
   - `omnimux_tiktok_posts`（创作者作品列表）
   - `omnimux_tiktok_search`（视频关键词搜索）
   - `omnimux_tiktok_shop_search`（电商商品搜索）
   - `omnimux_tiktok_shop_product`（电商商品详情与价格）
2. **Instagram 专属工具**：
   - `omnimux_instagram_post`（图文/视频贴文详情）
   - `omnimux_instagram_user`（用户个人主页资料）
   - `omnimux_instagram_posts`（用户发布作品列表）
   - `omnimux_instagram_search`（内容搜索）
3. **X / Twitter 专属工具**：
   - `omnimux_x_tweet`（推文详情与媒体附件）
   - `omnimux_x_user`（用户个人资料）
   - `omnimux_x_posts`（用户发布动态列表）
   - `omnimux_x_search`（时间线搜索）

### 2.3 跨插件服务接缝（Context Providers）
通过 `ctx.provide` 注册：
- `ctx.provide('tiktok', { ... })`
- `ctx.provide('instagram', { ... })`
- `ctx.provide('x', { ... })`
与此前已注入的 `youtube` 形成四大社媒全套服务闭环。

---

## 3. 验收标准 (Acceptance Criteria)

1. **模型覆盖率**：网关 38 款数据模型全部在 `SOCIAL_DATA_CATALOG` 建立映射，无任何未登记模型；
2. **参数解析与兼容性**：
   - 链接自动反查（如 TikTok 视频链接、短链、商品分享链）能正确提取对应业务 ID；
   - 区域自动识别（如 `region: "US"`, `"SG"`）正确附加至 `extras`；
3. **测试覆盖**：
   - 单测覆盖所有新增模型解析与工具调用；
   - `pnpm test:agent-tools` 4 层架构测试 100% 绿灯；
   - 全景接口面板 `hub-interfaces.html` 自动同步并显示最新工具数量。
