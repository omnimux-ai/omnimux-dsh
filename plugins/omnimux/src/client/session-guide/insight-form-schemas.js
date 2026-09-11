/**
 * 营销洞察 6 大场景结构化表单配置与 Prompt 编译器
 */

export const INSIGHT_SCHEMAS = {
  'tiktok-creators': {
    id: 'tiktok-creators',
    titleZh: 'TikTok 创作者与网红研究',
    titleEn: 'TikTok Creator & Influencer Research',
    descZh: '挖掘并筛选高契合度、高商业转化潜力的海外 TikTok 创作者',
    descEn: 'Find and evaluate high-affinity TikTok creators for collaboration',
    fields: [
      {
        key: 'product',
        labelZh: '产品或品牌名称',
        labelEn: 'Product or Brand Name',
        placeholderZh: '例如：智能降噪夜跑耳机、美妆修护精华油、智能宠物喂食器...',
        placeholderEn: 'e.g. Wireless Noise-Canceling Earbuds, Vitamin C Serum...',
        required: true,
        type: 'text',
      },
      {
        key: 'market',
        labelZh: '目标销售市场 / 国家',
        labelEn: 'Target Market / Region',
        placeholderZh: '例如：美国 (US)、英国、东南亚 (印尼/泰国)、日本...',
        placeholderEn: 'e.g. United States, UK, Southeast Asia, Japan...',
        required: true,
        type: 'text',
      },
      {
        key: 'creatorTier',
        labelZh: '期望达人量级与垂类风格',
        labelEn: 'Creator Tiers & Niche',
        placeholderZh: '例如：万粉腰部博主、3C数码开箱测评、户外运动健身达人...',
        placeholderEn: 'e.g. Micro-influencers (10k-50k), Tech reviewers, Fitness creators...',
        required: false,
        type: 'text',
      },
      {
        key: 'focusNotes',
        labelZh: '重点考察维度或补充诉求',
        labelEn: 'Key Evaluation Focus / Notes',
        placeholderZh: '例如：重点考察真实互动率与受众购买力，剔除刷量假粉，关注带货转化意向...',
        placeholderEn: 'e.g. High engagement rate, audience demographics, authentic comments...',
        required: false,
        type: 'textarea',
        rows: 3,
      },
    ],
    compile: (values, lang = 'zh') => {
      const product = values.product?.trim() || (lang === 'zh' ? '目标产品' : 'the product/brand')
      const market = values.market?.trim() || (lang === 'zh' ? '目标市场' : 'the target market')
      const creatorTier = values.creatorTier?.trim()
      const focusNotes = values.focusNotes?.trim()

      if (lang === 'en') {
        return `Find and shortlist candidate TikTok creators for [${product}] in [${market}].\n` +
          (creatorTier ? `Desired Creator Tiers & Style: ${creatorTier}\n` : '') +
          (focusNotes ? `Key Evaluation Focus: ${focusNotes}\n` : '') +
          `Please evaluate candidates across these dimensions:\n` +
          `1. Audience demographics and brand affinity\n` +
          `2. Content style, visual aesthetics, and storytelling tone\n` +
          `3. Engagement quality, completion rate, and authentic follower sentiment (weed out bots/fake engagement)\n` +
          `4. Brand safety, compliance, and controversy history\n` +
          `5. Commercial conversion potential and collaboration feasibility\n` +
          `Provide concrete recommendations on creator collaboration roles (seed/conversion/brand ambassador) and high-impact outreach angles.`
      }

      return `请为【${market}】市场中的【${product}】寻找并深度筛选候选 TikTok 创作者。\n` +
        (creatorTier ? `期望达人量级与垂类：${creatorTier}\n` : '') +
        (focusNotes ? `重点考察维度：${focusNotes}\n` : '') +
        `请从以下维度进行专业评估与筛选建议：\n` +
        `1. 受众画像契合度与粉丝购买力\n` +
        `2. 内容风格、视觉调性与脚本创作能力\n` +
        `3. 真实互动质量与完播表现（剔除虚假数据与水军）\n` +
        `4. 品牌安全性与舆情合规\n` +
        `5. 商业带货潜力与合作意向\n` +
        `最后给出具体的合作营销角色建议（种草/转化/品牌背书）与高转化建联触达切入点。如果缺少关键背景信息，请向我追问。`
    },
  },

  'ads-roas': {
    id: 'ads-roas',
    titleZh: '广告 ROAS 分析',
    titleEn: 'Ad ROAS & Performance Analysis',
    descZh: '结合成本与利润率诊断投放数据，定位浪费与扩量机会',
    descEn: 'Diagnose campaign metrics, identify ad waste and scaling opportunities',
    fields: [
      {
        key: 'platform',
        labelZh: '广告投放渠道 / 平台',
        labelEn: 'Advertising Platform',
        placeholderZh: '例如：Meta (Facebook & Instagram)、TikTok Ads、Google Ads、Amazon PPC...',
        placeholderEn: 'e.g. Meta Ads, TikTok Ads, Google Search & Shopping...',
        required: true,
        type: 'text',
      },
      {
        key: 'dateRange',
        labelZh: '分析周期 / 日期范围',
        labelEn: 'Date Range / Period',
        placeholderZh: '例如：最近 30 天、本季度、大促活动期间 (Black Friday)...',
        placeholderEn: 'e.g. Last 30 days, Q3 to date, Black Friday week...',
        required: true,
        type: 'text',
      },
      {
        key: 'targetMetrics',
        labelZh: '考核目标 (目标 ROAS 或 CPA)',
        labelEn: 'Target ROAS or CPA',
        placeholderZh: '例如：目标 ROAS ≥ 2.8，目标 CPA ≤ $18',
        placeholderEn: 'e.g. Target ROAS >= 2.5, Target CPA <= $20',
        required: false,
        type: 'text',
      },
      {
        key: 'margin',
        labelZh: '产品毛利率 / 盈亏平衡点',
        labelEn: 'Gross Margin / Break-even ROAS',
        placeholderZh: '例如：产品毛利率 65%，保本 ROAS 1.54',
        placeholderEn: 'e.g. Gross margin 60%, Break-even ROAS 1.67',
        required: false,
        type: 'text',
      },
      {
        key: 'adData',
        labelZh: '核心投放数据摘要或现状困境',
        labelEn: 'Ad Spend & Performance Summary',
        placeholderZh: '可直接粘贴广告系列花费、收入、CTR、CPC、转化数，或描述当前主要痛点...',
        placeholderEn: 'Paste spend, revenue, CTR, CPC, conversion data, or key issues...',
        required: false,
        type: 'textarea',
        rows: 3,
      },
    ],
    compile: (values, lang = 'zh') => {
      const platform = values.platform?.trim() || (lang === 'zh' ? '投放平台' : 'the advertising platform')
      const dateRange = values.dateRange?.trim() || (lang === 'zh' ? '最近周期' : 'the date range')
      const targetMetrics = values.targetMetrics?.trim()
      const margin = values.margin?.trim()
      const adData = values.adData?.trim()

      if (lang === 'en') {
        return `Analyze advertising performance on [${platform}] for [${dateRange}].\n` +
          (targetMetrics ? `Target KPI: ${targetMetrics}\n` : '') +
          (margin ? `Margin Structure: ${margin}\n` : '') +
          (adData ? `Current Performance Data / Observations:\n${adData}\n` : '') +
          `Please provide a comprehensive diagnostic report:\n` +
          `1. Evaluate spend, revenue, ROAS, CPA, CTR, CPC, and conversion rate at campaign, ad set, and creative levels\n` +
          `2. Pinpoint bottlenecks across budget allocation, audience saturation, bidding strategy, and landing page friction\n` +
          `3. Deliver actionable prioritization: which campaigns to pause immediately, which winners to scale, and new creative angles to test\n` +
          `Distinguish data-backed findings from assumptions. If crucial context is missing, ask follow-up questions.`
      }

      return `请结合成本与目标，对【${platform}】在【${dateRange}】内的广告投放表现进行深度多维度诊断与优化分析：\n` +
        (targetMetrics ? `考核目标：${targetMetrics}\n` : '') +
        (margin ? `利润结构：${margin}\n` : '') +
        (adData ? `核心投放数据 / 现状：\n${adData}\n` : '') +
        `诊断维度包含：\n` +
        `1. 分层评估广告系列、广告组与单条素材层级的消耗、收入、ROAS、CPA、CTR、CPC 与转化率表现；\n` +
        `2. 深入定位预算分配、受众圈选、出价策略、素材创意疲劳度及落地页转化瓶颈；\n` +
        `3. 给出清晰的操盘优先级策略：哪些计划应立即止损关闭、哪些计划可加大预算扩量、哪些受众或创意角度需要新建测试组；\n` +
        `请明确区分有数据支撑的客观事实与假设推断。若信息不全，请向我追问。`
    },
  },

  'amazon-a-plus': {
    id: 'amazon-a-plus',
    titleZh: '亚马逊 A+ 内容简介',
    titleEn: 'Amazon A+ Content Brief',
    descZh: '打造高转化图文版块，提炼差异化卖点与视觉模块排布',
    descEn: 'Structure compelling Amazon EBC / A+ content modules and key messages',
    fields: [
      {
        key: 'product',
        labelZh: '产品名称与核心品类',
        labelEn: 'Product Name & Category',
        placeholderZh: '例如：人体工学网布办公椅、户外便携露营帐篷...',
        placeholderEn: 'e.g. Ergonomic Mesh Office Chair, Ultralight Camping Tent...',
        required: true,
        type: 'text',
      },
      {
        key: 'features',
        labelZh: '核心卖点与差异化优势',
        labelEn: 'Key Selling Points & Differentiators',
        placeholderZh: '例如：双向自适应仿生腰托、透气高弹网布、4D无级扶手、135°大仰角...',
        placeholderEn: 'e.g. Adaptive lumbar support, 4D armrests, heavy-duty SGS gas lift...',
        required: true,
        type: 'textarea',
        rows: 2,
      },
      {
        key: 'audience',
        labelZh: '目标客群与典型使用场景',
        labelEn: 'Target Audience & Use Cases',
        placeholderZh: '例如：长时间居家办公白领、程序员、电竞游戏玩家、久坐腰背酸痛人群...',
        placeholderEn: 'e.g. Remote workers, programmers, gamers, people with lower back pain...',
        required: false,
        type: 'text',
      },
      {
        key: 'visualTone',
        labelZh: '视觉设计偏好与品牌调性',
        labelEn: 'Visual Style & Brand Aesthetics',
        placeholderZh: '例如：现代科技极简风、深空灰与商务深蓝配色、突出机械结构拆解与材质细节...',
        placeholderEn: 'e.g. Clean modern minimalism, technical blueprint style, premium matte dark...',
        required: false,
        type: 'text',
      },
    ],
    compile: (values, lang = 'zh') => {
      const product = values.product?.trim() || (lang === 'zh' ? '该产品' : 'the product')
      const features = values.features?.trim() || (lang === 'zh' ? '核心产品卖点' : 'key features')
      const audience = values.audience?.trim()
      const visualTone = values.visualTone?.trim()

      if (lang === 'en') {
        return `Create a high-converting Amazon A+ Content (EBC) brief for [${product}].\n` +
          `Key Selling Points:\n${features}\n` +
          (audience ? `Target Audience & Use Cases: ${audience}\n` : '') +
          (visualTone ? `Visual Aesthetics & Tone: ${visualTone}\n` : '') +
          `Please provide a complete content blueprint:\n` +
          `1. Overall storytelling narrative and module sequence logic\n` +
          `2. Compelling feature copywriting and customer benefit statements\n` +
          `3. Recommended Amazon A+ module layout (Header, Comparison Chart, Multi-Image Specs, etc.)\n` +
          `4. Art direction for product photography, 3D renders, and lighting setup.`
      }

      return `请为【${product}】设计一份专业且高转化率的亚马逊 A+ 页面（EBC）内容创作简报。\n` +
        `核心差异化卖点：\n${features}\n` +
        (audience ? `目标客群与场景：${audience}\n` : '') +
        (visualTone ? `视觉与调性偏好：${visualTone}\n` : '') +
        `方案请包含以下关键结构：\n` +
        `1. 整体叙事结构与版块编排逻辑（场景痛点代入 → 技术拆解背书 → 规格对比转化）；\n` +
        `2. 核心卖点文案与差异化价值提炼（Key Messages）；\n` +
        `3. 推荐使用的亚马逊官方 A+ 模块搭配组合（如大Banner、多图规格说明、竞品参数对照表）；\n` +
        `4. 视觉拍摄指导、渲染布光建议与配色规范。如果缺少关键参数，请向我追问。`
    },
  },

  'amazon-search-terms': {
    id: 'amazon-search-terms',
    titleZh: '亚马逊搜索词报告分析',
    titleEn: 'Amazon Search Term Report Analysis',
    descZh: '提炼高转化黄金词，定位浪费大词并生成否定词清单',
    descEn: 'Extract golden keywords, negative out wasteful spend, and optimize bids',
    fields: [
      {
        key: 'campaign',
        labelZh: '广告活动 / 站点与品类',
        labelEn: 'Campaign / Marketplace & ASIN',
        placeholderZh: '例如：亚马逊美国站 (US) SP 商品推广广告活动、无线耳机品类...',
        placeholderEn: 'e.g. Amazon US SP Campaigns, Wireless Audio category...',
        required: true,
        type: 'text',
      },
      {
        key: 'dateRange',
        labelZh: '报表分析时间跨度',
        labelEn: 'Report Date Range',
        placeholderZh: '例如：过去 60 天搜索词报告、大促前后 30 天...',
        placeholderEn: 'e.g. Last 60 days search term report, Prime Day period...',
        required: true,
        type: 'text',
      },
      {
        key: 'targetGoal',
        labelZh: '核心优化目标与当前痛点',
        labelEn: 'Target Goal & Main Friction',
        placeholderZh: '例如：将 ACoS 降低至 20% 以下，剔除大词虚高消耗，拓展长尾精准词...',
        placeholderEn: 'e.g. Lower ACoS below 20%, eliminate high-spend non-converting terms...',
        required: false,
        type: 'text',
      },
      {
        key: 'dataNotes',
        labelZh: '重点关注的搜索词或报表数据片段',
        labelEn: 'Sample Search Terms or Data Notes',
        placeholderZh: '可粘贴报表中消耗最高、转化最高或存疑的搜索词清单与表现数据...',
        placeholderEn: 'Paste key search terms, top spenders, or suspicious queries...',
        required: false,
        type: 'textarea',
        rows: 3,
      },
    ],
    compile: (values, lang = 'zh') => {
      const campaign = values.campaign?.trim() || (lang === 'zh' ? '当前广告活动' : 'the campaign')
      const dateRange = values.dateRange?.trim() || (lang === 'zh' ? '分析周期' : 'the date range')
      const targetGoal = values.targetGoal?.trim()
      const dataNotes = values.dataNotes?.trim()

      if (lang === 'en') {
        return `Analyze the Amazon Search Term Report for [${campaign}] during [${dateRange}].\n` +
          (targetGoal ? `Target Goal: ${targetGoal}\n` : '') +
          (dataNotes ? `Data Sample / Notes:\n${dataNotes}\n` : '') +
          `Please conduct a structured optimization analysis:\n` +
          `1. Golden Keyword Identification: pinpoint high-CTR, high-conversion search terms to graduate into dedicated exact-match campaigns\n` +
          `2. Budget Waste Mitigation: identify non-converting, low-relevance terms and formulate negative keyword (Negative Exact / Phrase) lists\n` +
          `3. Search Query Mining: discover long-tail shopper search patterns and emerging customer phrasing\n` +
          `4. Bid & budget allocation recommendations based on performance tiers.`
      }

      return `根据【${campaign}】在【${dateRange}】内的亚马逊搜索词报告数据，进行深度广告搜索词优化分析：\n` +
        (targetGoal ? `优化目标：${targetGoal}\n` : '') +
        (dataNotes ? `核心数据样本 / 关注词：\n${dataNotes}\n` : '') +
        `请执行以下优化动作：\n` +
        `1. 黄金关键词发掘：筛选出高点击、高转化、低 ACoS 的优质搜索词，给出将其单独提拔为精准匹配广告组的出价建议；\n` +
        `2. 浪费型搜索词诊断与否定策略：精准定位高点击无转化或转化成本超标的无效词，输出精准否定（Negative Exact）与词组否定（Negative Phrase）清单；\n` +
        `3. 关键词拓展与买家搜索意图挖掘：提取真实买家的搜索习惯与衍生痛点词；\n` +
        `4. 竞价结构调整与广告活动预算再分配建议。`
    },
  },

  'category-market': {
    id: 'category-market',
    titleZh: '品类市场分析',
    titleEn: 'Category & Market Opportunity Scan',
    descZh: '全面评估品类需求体量、竞争格局、定价区间与进入壁垒',
    descEn: 'Evaluate market demand, competition intensity, price tiers, and entry barriers',
    fields: [
      {
        key: 'category',
        labelZh: '拟分析或拟进入的产品品类',
        labelEn: 'Product Category',
        placeholderZh: '例如：便携式户外露营储能电源、智能宠物烘干箱、护眼人体工学台灯...',
        placeholderEn: 'e.g. Portable Camping Power Station, Smart Pet Grooming Dryer...',
        required: true,
        type: 'text',
      },
      {
        key: 'market',
        labelZh: '目标国家或销售区域',
        labelEn: 'Target Market / Region',
        placeholderZh: '例如：北美 (美国/加拿大)、欧洲主要国家 (德/英/法)、东南亚...',
        placeholderEn: 'e.g. North America (US/CA), Western Europe, Southeast Asia...',
        required: true,
        type: 'text',
      },
      {
        key: 'channels',
        labelZh: '主要销售渠道与平台',
        labelEn: 'Key Sales Channels',
        placeholderZh: '例如：Amazon + 独立站 (Shopify) + TikTok Shop...',
        placeholderEn: 'e.g. Amazon, Shopify DTC, TikTok Shop, Retail...',
        required: true,
        type: 'text',
      },
      {
        key: 'priceRange',
        labelZh: '预估产品定价带或对标竞品',
        labelEn: 'Target Price Range / Benchmarks',
        placeholderZh: '例如：$199 - $399 中高端定位，对标 Anker、EcoFlow...',
        placeholderEn: 'e.g. $150 - $300 mid-to-high tier, benchmark against Anker...',
        required: false,
        type: 'text',
      },
      {
        key: 'advantages',
        labelZh: '自身优势、技术储备或补充背景',
        labelEn: 'Core Competencies & Background',
        placeholderZh: '例如：拥有自研快充专利、供应链成本低 15%、有海外仓现货储备...',
        placeholderEn: 'e.g. Proprietary cooling tech, supply chain cost advantage of 15%...',
        required: false,
        type: 'textarea',
        rows: 2,
      },
    ],
    compile: (values, lang = 'zh') => {
      const category = values.category?.trim() || (lang === 'zh' ? '该产品品类' : 'the category')
      const market = values.market?.trim() || (lang === 'zh' ? '目标市场' : 'the target market')
      const channels = values.channels?.trim() || (lang === 'zh' ? '主要渠道' : 'main channels')
      const priceRange = values.priceRange?.trim()
      const advantages = values.advantages?.trim()

      if (lang === 'en') {
        return `Analyze the market potential and competitive landscape for [${category}] in [${market}] across [${channels}].\n` +
          (priceRange ? `Target Price Range: ${priceRange}\n` : '') +
          (advantages ? `Key Competencies / Resources: ${advantages}\n` : '') +
          `Please provide a comprehensive market scan:\n` +
          `1. Market demand size, search trends, and seasonality signals\n` +
          `2. Competitive intensity, top brand market share, and whitespace opportunities across pricing tiers\n` +
          `3. Customer persona, core pain points, unmet needs, and recurring product review complaints\n` +
          `4. Barriers to entry (certifications, patents, logistics) and operational risks\n` +
          `5. Strategic recommendation: Go/No-go verdict and recommended differentiation entry strategy.`
      }

      return `请全面深度分析【${category}】品类在【${market}】通过【${channels}】销售的商业机会与增长潜力：\n` +
        (priceRange ? `预估定价与对标：${priceRange}\n` : '') +
        (advantages ? `自身核心优势：${advantages}\n` : '') +
        `请输出结构化品类调研报告，涵盖以下关键维度：\n` +
        `1. 市场需求规模、搜索热度趋势与季节性波动信号；\n` +
        `2. 竞争对手格局分析（头部品牌垄断度、腰部生存空间与各定价带分布）；\n` +
        `3. 核心受众画像、未被满足的消费痛点与高频差评点（产品改进突破口）；\n` +
        `4. 进入壁垒（认证合规、专利限制、物流仓储门槛）与潜在商业风险；\n` +
        `5. 最终给出入场策略建议（是否建议进入、切入定位与首发破局打法）。`
    },
  },

  'title-optimization': {
    id: 'title-optimization',
    titleZh: '产品列表标题优化',
    titleEn: 'Listing Title SEO & Conversion Optimization',
    descZh: '结合平台算法与关键词搜索权重，重构高点击、高排名的商品标题',
    descEn: 'Optimize listing title for algorithm ranking, keyword relevance, and CTR',
    fields: [
      {
        key: 'currentTitle',
        labelZh: '当前商品标题 (或初步产品描述)',
        labelEn: 'Current Title or Product Draft',
        placeholderZh: '粘贴现有 Listing 标题，或输入初步拟定的产品名称与草稿...',
        placeholderEn: 'Paste current listing title or rough product draft...',
        required: true,
        type: 'textarea',
        rows: 2,
      },
      {
        key: 'platform',
        labelZh: '目标电商或社媒平台',
        labelEn: 'Target Ecommerce Platform',
        placeholderZh: '例如：Amazon (US)、TikTok Shop、Shopee、Walmart、eBay...',
        placeholderEn: 'e.g. Amazon US, TikTok Shop, Shopee, Walmart...',
        required: true,
        type: 'text',
      },
      {
        key: 'keywords',
        labelZh: '必须覆盖的核心大词与搜索词',
        labelEn: 'Target Core Keywords',
        placeholderZh: '例如：Bone Conduction Headphones, Open Ear Earbuds, Bluetooth 5.3...',
        placeholderEn: 'e.g. Bone Conduction Headphones, Open Ear, Wireless Bluetooth 5.3...',
        required: true,
        type: 'text',
      },
      {
        key: 'specs',
        labelZh: '关键差异化参数与核心卖点',
        labelEn: 'Key Specs & Unique Selling Points',
        placeholderZh: '例如：IPX8 深度防水、32GB 本地内存、28g 超轻机身、10 小时续航...',
        placeholderEn: 'e.g. IPX8 Waterproof, 32GB MP3 Mode, 28g Lightweight, 10H Battery...',
        required: false,
        type: 'text',
      },
    ],
    compile: (values, lang = 'zh') => {
      const currentTitle = values.currentTitle?.trim() || (lang === 'zh' ? '现有标题' : 'current title')
      const platform = values.platform?.trim() || (lang === 'zh' ? '电商平台' : 'the ecommerce platform')
      const keywords = values.keywords?.trim() || (lang === 'zh' ? '核心关键词' : 'key search terms')
      const specs = values.specs?.trim()

      if (lang === 'en') {
        return `Optimize the product listing title for [${platform}] based on platform search algorithm standards.\n` +
          `Current Title/Draft:\n${currentTitle}\n` +
          `Must-Have Core Keywords:\n${keywords}\n` +
          (specs ? `Key Specs & Highlights: ${specs}\n` : '') +
          `Please provide 3 distinct optimized title variations strictly within platform character limits:\n` +
          `1. [Algorithm SEO Priority]: Maximizing search indexing and front-loading high-volume keyword roots\n` +
          `2. [Click-Through & Benefit Priority]: High readability, highlighting consumer hooks and differentiators\n` +
          `3. [Balanced Brand Tone]: Clean professional phrasing balancing brand authority and search weight\n` +
          `Include keyword density rationale and character counts for each variation.`
      }

      return `请根据【${platform}】平台规范与算法特征，为以下产品深度重构并优化高权重商品标题：\n` +
        `当前标题/产品草稿：\n${currentTitle}\n` +
        `必须覆盖的核心关键词：\n${keywords}\n` +
        (specs ? `关键规格与卖点：${specs}\n` : '') +
        `请严格遵循 ${platform} 平台的字符限制与合规要求（避免违规堆砌与主观夸大），输出 3 个不同侧重点的优化标题：\n` +
        `1. 【搜索权重优先型标题】（侧重搜索算法权重，核心流量大词科学前置）；\n` +
        `2. 【卖点转化型标题】（侧重高可读性与痛点解决，最大化点击率 CTR）；\n` +
        `3. 【品牌调性平衡型标题】（兼顾品牌调性、型号规格与算法权重）；\n` +
        `并对每个标题附带字符数统计与核心埋词逻辑解析。`
    },
  },
}
