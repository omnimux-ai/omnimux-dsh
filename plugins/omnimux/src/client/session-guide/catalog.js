/** Topview AI Marketer quick actions & popular starters, captured 2026-09-09. */
export const STARTER_GROUPS = ['market-insights', 'listing-reviews', 'content-creators', 'ad-analytics']
export const STARTERS = [
  { id: 'category-opportunity', group: 'market-insights', icon: 'chart-column' },
  { id: 'trending-products', group: 'market-insights', icon: 'chart-column' },
  { id: 'competitor-scan', group: 'market-insights', icon: 'chart-column' },
  { id: 'title-optimization', group: 'listing-reviews', icon: 'file-pen' },
  { id: 'review-insights', group: 'listing-reviews', icon: 'message-square-text' },
  { id: 'ugc-brief', group: 'content-creators', icon: 'clapperboard' },
  { id: 'video-scripts', group: 'content-creators', icon: 'clapperboard' },
  { id: 'recreate-viral-ads', group: 'content-creators', icon: 'wand-sparkles' },
  { id: 'search-terms', group: 'ad-analytics', icon: 'chart-column' },
  { id: 'roas-analysis', group: 'ad-analytics', icon: 'chart-line' },
]

/** 热门入门方式 (4个大卡片) */
export const POPULAR_STARTERS = [
  {
    id: 'marketing-insight',
    type: 'modal',
  },
  {
    id: 'url-to-video',
    type: 'placeholder',
  },
  {
    id: 'recreate-viral-ads',
    type: 'placeholder',
  },
  {
    id: 'bulk-create-ads',
    type: 'placeholder',
  },
]

/** 营销洞察模态框内的 6 项推荐 */
export const MARKETING_INSIGHT_ITEMS = [
  {
    id: 'tiktok-creators',
    icon: 'clapperboard',
    prompt: 'Find and shortlist TikTok creators for [product/brand] in [target market]. Evaluate audience fit, content style, engagement quality, brand safety, and collaboration potential, then recommend campaign roles and outreach angles.',
  },
  {
    id: 'ads-roas',
    icon: 'chart-line',
    prompt: '[Drop or upload your Ads report in CSV or XLSX format]\n\nAnalyze performance on [platform] for [date range] against [target ROAS/CPA], considering [attribution window] and [product margin]. Evaluate campaign, ad group or ad set, and ad-level spend, revenue, ROAS, CPA, CTR, CPC, and conversion rate; identify budget, audience, bidding, creative, and landing-page issues; and prioritize what to pause, scale, or test next. Distinguish data-backed findings from assumptions. If context is missing, ask an open follow-up question about useful report information.',
  },
  {
    id: 'amazon-a-plus',
    icon: 'file-pen',
    prompt: 'Create an Amazon A+ Content brief for [product], including the content structure, key messages, module recommendations, and visual direction.',
  },
  {
    id: 'amazon-search-terms',
    icon: 'chart-column',
    prompt: 'Analyze [uploaded search term report] from [platform] for [date range], using [attribution settings] and [target metrics]. Identify high-performing queries, wasted ad spend, negative-keyword opportunities, and bid or budget actions. Separate data-backed findings from assumptions. If context is missing, ask an open follow-up question about useful report information.',
  },
  {
    id: 'category-market',
    icon: 'chart-column',
    prompt: 'Analyze the potential of [product category] on [ecommerce platform] in [target market]. Evaluate demand, competition, pricing, customer needs, barriers to entry, and growth signals; clearly distinguish facts, inferences, and assumptions; and recommend whether and how to enter. If context is missing, ask an open follow-up question about any useful reference information.',
  },
  {
    id: 'title-optimization',
    icon: 'file-pen',
    prompt: 'Optimize [current product title] for [ecommerce platform] using [product details or target keywords]. Improve search visibility, keyword relevance, readability, differentiation, and conversion while following the platform’s requirements. Provide the recommended title with a concise rationale. If context is missing, ask an open follow-up question about useful product information.',
  },
]

export const guideZh = {
  "guide.title": "开始一个营销任务",
  "guide.market-insights": "市场洞察",
  "guide.listing-reviews": "列表和评论",
  "guide.content-creators": "内容与创作者",
  "guide.ad-analytics": "广告分析",
  "guide.category-opportunity.title": "品类机会",
  "guide.category-opportunity.prompt": "分析[产品品类]在[目标市场]的[电商平台]上的潜力。评估需求、竞争、定价、客户需求、进入壁垒和增长信号；明确区分事实、推断和假设；并建议是否进入以及如何进入。如果缺少背景信息，请用开放式问题追问有用的参考资料。",
  "guide.trending-products.title": "热门产品",
  "guide.trending-products.prompt": "结合[业务背景或限制条件]，找出[目标市场]的[电商平台]上[品类]中具有较强销售潜力的热门产品。解释每项推荐背后的需求信号、受众匹配度、竞争强度、定价机会、季节性和运营风险。如果缺少背景信息，请用开放式问题追问有用的参考资料。",
  "guide.competitor-scan.title": "竞争对手扫描",
  "guide.competitor-scan.prompt": "分析[目标市场]的[电商平台]上[关键词/品类]中排名靠前的竞品商品页面。比较定位、定价、优惠、评论、内容、卖点和转化策略，并找出具体的差异化机会。如果缺少背景信息，请用开放式问题追问有用的参考资料。",
  "guide.title-optimization.title": "标题优化",
  "guide.title-optimization.prompt": "根据[产品详情或目标关键词]，为[电商平台]优化[当前商品标题]。在遵守平台要求的前提下，提升搜索可见度、关键词相关性、可读性、差异化和转化效果。给出推荐标题及简要理由。如果缺少背景信息，请用开放式问题追问有用的产品信息。",
  "guide.review-insights.title": "评论洞察",
  "guide.review-insights.prompt": "使用[评论来源或导出的评论数据]，分析[目标市场]中[产品/商品页面]的客户评论。找出反复出现的抱怨、未满足的需求、购买动机、用语模式，以及产品改进或传播表达的机会。尽可能量化各类主题，并区分证据与假设。如果缺少背景信息，请用开放式问题追问有用的参考资料。",
  "guide.ugc-brief.title": "UGC 简报",
  "guide.ugc-brief.prompt": "为[产品]制定在[目标市场]的[平台]上使用的 UGC 视频简报，面向[目标受众]，在[限制条件]内支持[营销活动目标]。包括核心信息、拍摄指南、必需镜头、交付物和成功标准。如果缺少背景信息，请用开放式问题追问有用的营销活动资料。",
  "guide.video-scripts.title": "视频脚本",
  "guide.video-scripts.prompt": "为[产品]撰写 10 个用于[平台]的短视频脚本，面向[目标受众]，体现[优惠方案]和[语气风格]。每个脚本都应包含有力的开头钩子、能引起共鸣的场景、产品演示、支撑卖点的证据和行动号召，并提供足够的创意差异以便测试。如果缺少背景信息，请用开放式问题追问有用的创意资料。",
  "guide.recreate-viral-ads.title": "复制病毒式广告",
  "guide.recreate-viral-ads.prompt": "使用所选的复刻模式和参考素材复刻这条视频。",
  "guide.search-terms.title": "搜索词",
  "guide.search-terms.prompt": "根据[归因设置]和[目标指标]，分析[平台]在[日期范围]内的[已上传搜索词报告]。找出表现优秀的搜索词、浪费的广告支出、否定关键词机会，以及出价或预算调整措施。区分有数据支持的发现与假设。如果缺少背景信息，请用开放式问题追问有用的报告资料。",
  "guide.roas-analysis.title": "广告支出回报率分析",
  "guide.roas-analysis.prompt": "[拖入或上传 CSV 或 XLSX 格式的广告报告]\n\n结合[归因窗口]和[产品利润率]，按照[目标 ROAS/CPA]分析[平台]在[日期范围]内的表现。评估广告系列、广告组和单条广告层级的支出、收入、广告支出回报率（ROAS）、单次转化成本（CPA）、点击率（CTR）、单次点击成本（CPC）和转化率；找出预算、受众、出价、创意及落地页问题；并按优先级给出接下来应暂停、扩大投放或测试的项目。区分有数据支持的发现与假设。如果缺少背景信息，请用开放式问题追问有用的报告资料。",
  "guide.unavailable": "输入框尚未准备好，请稍后重试。",
  "guide.retry": "重试",

  // 热门入门方式文案
  "guide.popular.title": "热门入门方式",
  "guide.popular.marketing-insight.title": "营销洞察",
  "guide.popular.url-to-video.title": "视频网址",
  "guide.popular.recreate-viral-ads.title": "重现病毒式广告",
  "guide.popular.bulk-create-ads.title": "批量创建广告",
  "guide.popular.placeholder-notice": "该功能正在接入中，敬请期待！",

  // 营销洞察模态框文案
  "guide.insight.modal.title": "营销洞察",
  "guide.insight.modal.subtitle": "选择您想要探索的内容，并为代理提供足够的背景信息，使其能够将其转化为一项专注的营销任务。",
  "guide.insight.suggested": "为您推荐",
  "guide.insight.explore.title": "您想要探索什么？",
  "guide.insight.start-btn": "开始洞察 →",
  "guide.insight.copied": "已添加到剪贴板",
  "guide.insight.applied": "已填入会话输入框，可直接发送",

  // 6个洞察子项标题
  "guide.insight.tiktok-creators.title": "TikTok创作者与网红研究",
  "guide.insight.ads-roas.title": "广告ROAS分析",
  "guide.insight.amazon-a-plus.title": "亚马逊A+内容简介",
  "guide.insight.amazon-search-terms.title": "亚马逊搜索词报告分析",
  "guide.insight.category-market.title": "品类市场分析",
  "guide.insight.title-optimization.title": "产品列表标题优化",
}

export const guideEn = {
  "guide.title": "Start a marketing task",
  "guide.market-insights": "Market Insights",
  "guide.listing-reviews": "Listing & Reviews",
  "guide.content-creators": "Content & Creators",
  "guide.ad-analytics": "Ad Analytics",
  "guide.category-opportunity.title": "Category Opportunity",
  "guide.category-opportunity.prompt": "Analyze the potential of [product category] on [ecommerce platform] in [target market]. Evaluate demand, competition, pricing, customer needs, barriers to entry, and growth signals; clearly distinguish facts, inferences, and assumptions; and recommend whether and how to enter. If context is missing, ask an open follow-up question about any useful reference information.",
  "guide.trending-products.title": "Trending Products",
  "guide.trending-products.prompt": "Identify trending products with strong sales potential in [category] on [ecommerce platform] in [target market], taking [business context or constraints] into account. Explain the demand signals, audience fit, competitive intensity, pricing opportunity, seasonality, and operational risks behind each recommendation. If context is missing, ask an open follow-up question about useful reference information.",
  "guide.competitor-scan.title": "Competitor Scan",
  "guide.competitor-scan.prompt": "Analyze the top-ranking competitor product listings for [keyword/category] on [ecommerce platform] in [target market]. Compare positioning, pricing, offers, reviews, content, selling points, and conversion tactics, then identify specific opportunities for differentiation. If context is missing, ask an open follow-up question about useful reference information.",
  "guide.title-optimization.title": "Title Optimization",
  "guide.title-optimization.prompt": "Optimize [current product title] for [ecommerce platform] using [product details or target keywords]. Improve search visibility, keyword relevance, readability, differentiation, and conversion while following the platform’s requirements. Provide the recommended title with a concise rationale. If context is missing, ask an open follow-up question about useful product information.",
  "guide.review-insights.title": "Review Insights",
  "guide.review-insights.prompt": "Analyze customer reviews for [product/listing] in [target market] using [review source or exported review data]. Identify recurring complaints, unmet needs, purchase drivers, language patterns, and product or messaging opportunities. Quantify themes where possible and distinguish evidence from assumptions. If context is missing, ask an open follow-up question about useful reference information.",
  "guide.ugc-brief.title": "UGC Brief",
  "guide.ugc-brief.prompt": "Create a UGC video brief for [product] on [platform] in [target market], aimed at [target audience] and supporting [campaign goal] within [constraints]. Include key messages, filming guidelines, required shots, deliverables, and success criteria. If context is missing, ask an open follow-up question about useful campaign information.",
  "guide.video-scripts.title": "Video Scripts",
  "guide.video-scripts.prompt": "Write 10 short-form video scripts for [product] on [platform], aimed at [target audience] and reflecting [offer] and [tone]. Give each a strong hook, relatable scenario, product demonstration, proof point, and call to action, with enough creative variety for testing. If context is missing, ask an open follow-up question about useful creative information.",
  "guide.recreate-viral-ads.title": "Recreate Viral Ads",
  "guide.recreate-viral-ads.prompt": "Recreate this video using the selected clone mode and references.",
  "guide.search-terms.title": "Search Terms",
  "guide.search-terms.prompt": "Analyze [uploaded search term report] from [platform] for [date range], using [attribution settings] and [target metrics]. Identify high-performing queries, wasted ad spend, negative-keyword opportunities, and bid or budget actions. Separate data-backed findings from assumptions. If context is missing, ask an open follow-up question about useful report information.",
  "guide.roas-analysis.title": "ROAS Analysis",
  "guide.roas-analysis.prompt": "[Drop or upload your Ads report in CSV or XLSX format]\n\nAnalyze performance on [platform] for [date range] against [target ROAS/CPA], considering [attribution window] and [product margin]. Evaluate campaign, ad group or ad set, and ad-level spend, revenue, ROAS, CPA, CTR, CPC, and conversion rate; identify budget, audience, bidding, creative, and landing-page issues; and prioritize what to pause, scale, or test next. Distinguish data-backed findings from assumptions. If context is missing, ask an open follow-up question about useful report information.",
  "guide.unavailable": "The editor is not ready. Please retry shortly.",
  "guide.retry": "Retry",

  // Popular starters
  "guide.popular.title": "Popular Ways to Get Started",
  "guide.popular.marketing-insight.title": "Marketing Insight",
  "guide.popular.url-to-video.title": "URL to Video",
  "guide.popular.recreate-viral-ads.title": "Recreate Viral Ads",
  "guide.popular.bulk-create-ads.title": "Bulk Create Ads",
  "guide.popular.placeholder-notice": "This feature is coming soon!",

  // Marketing insight modal
  "guide.insight.modal.title": "Marketing Insight",
  "guide.insight.modal.subtitle": "Choose what you want to explore and add enough context for the agent to turn it into a focused marketing task.",
  "guide.insight.suggested": "Suggested for you",
  "guide.insight.explore.title": "What would you like to explore?",
  "guide.insight.start-btn": "Start insight →",
  "guide.insight.copied": "Copied to clipboard",
  "guide.insight.applied": "Draft applied to conversation input",

  "guide.insight.tiktok-creators.title": "TikTok Creator & Influencer Research",
  "guide.insight.ads-roas.title": "Ads ROAS Analysis",
  "guide.insight.amazon-a-plus.title": "Amazon A+ Content Brief",
  "guide.insight.amazon-search-terms.title": "Amazon Search Term Report Analysis",
  "guide.insight.category-market.title": "Category Market Analysis",
  "guide.insight.title-optimization.title": "Product Listing Title Optimization",
}
