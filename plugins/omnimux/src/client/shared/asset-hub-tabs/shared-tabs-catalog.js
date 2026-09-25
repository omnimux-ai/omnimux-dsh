/**
 * Shared Asset Hub Tabs & Categories Catalog.
 * 共享素材工作台与新会话 Tab 栏及分类元数据（单一事实源）。
 * 严格遵循 specs/asset-hub-shared-tabs.spec.md 与 design.md 规范。
 * 首项严格固定为「全部」，绝不扩写为「全部资产」「全部灵感」等叠词。
 */

/**
 * 六大主库一级 Tab 规范配置（顺序严禁改动）
 */
export const SHARED_PRIMARY_TABS = Object.freeze([
  { id: 'featured', nameZh: '精选', nameEn: 'Featured', iconName: 'book-open' },
  { id: 'assets', nameZh: '资产库', nameEn: 'Assets', iconName: 'folder' },
  { id: 'inspiration', nameZh: '灵感库', nameEn: 'Inspiration', iconName: 'lightbulb' },
  { id: 'products', nameZh: '商品库', nameEn: 'Products', iconName: 'shopping-bag' },
  { id: 'trending', nameZh: '爆款趋势', nameEn: 'Trending', iconName: 'trending-up' },
  { id: 'skills', nameZh: 'Skills', nameEn: 'Skills', iconName: 'zap' },
])

/**
 * 六大主库二级细分分类白名单字典（严格对齐 Spec 5.2 节）
 * 首项 100% 严格固定为 { id: 'all', nameZh: '全部', nameEn: 'All' }
 */
export const SHARED_SUB_CATEGORIES = Object.freeze({
  featured: Object.freeze([
    { id: 'all', nameZh: '全部', nameEn: 'All' },
    { id: 'hook-intro', nameZh: '黄金开场', nameEn: 'Hook & Intro' },
    { id: 'ugc-review', nameZh: '真实种草', nameEn: 'UGC & Review' },
    { id: 'cinematic-vfx', nameZh: '视效大片', nameEn: 'Cinematic VFX' },
    { id: 'fashion-try-on', nameZh: '模特试穿', nameEn: 'Fashion Try-On' },
    { id: 'industry-packs', nameZh: '行业精选', nameEn: 'Industry Packs' },
    { id: 'durability-test', nameZh: '硬核评测', nameEn: 'Durability Test' },
    { id: 'apps-software', nameZh: '软件应用', nameEn: 'Apps & Software' },
  ]),
  assets: Object.freeze([
    { id: 'all', nameZh: '全部', nameEn: 'All' },
    { id: 'local-upload', nameZh: '本地上传', nameEn: 'Local Uploads' },
    { id: 'ai-generated', nameZh: '生成资产', nameEn: 'AI Generated' },
    { id: 'digital-human', nameZh: '数字人', nameEn: 'Digital Humans' },
    { id: 'product-images', nameZh: '商品图', nameEn: 'Product Images' },
    { id: 'character', nameZh: '角色 IP', nameEn: 'Characters' },
  ]),
  inspiration: Object.freeze([
    { id: 'all', nameZh: '全部', nameEn: 'All' },
    { id: 'viral-videos', nameZh: '爆款视频', nameEn: 'Viral Videos' },
    { id: 'storyboards', nameZh: '分镜脚本', nameEn: 'Storyboards' },
    { id: 'creative-prompts', nameZh: '创意提示词', nameEn: 'Creative Prompts' },
    { id: 'visual-styles', nameZh: '视觉风格', nameEn: 'Visual Styles' },
  ]),
  products: Object.freeze([
    { id: 'all', nameZh: '全部', nameEn: 'All' },
    { id: 'appliances', nameZh: '生活家电', nameEn: 'Appliances' },
    { id: 'digital-audio', nameZh: '数码影音', nameEn: 'Digital & Audio' },
    { id: 'beauty-care', nameZh: '美妆护肤', nameEn: 'Beauty & Care' },
    { id: 'fashion-apparel', nameZh: '服饰箱包', nameEn: 'Fashion & Bags' },
    { id: 'food-beverage', nameZh: '食品饮料', nameEn: 'Food & Beverage' },
  ]),
  trending: Object.freeze([
    { id: 'all', nameZh: '全部', nameEn: 'All' },
    { id: 'beauty-personal', nameZh: '美妆个护', nameEn: 'Beauty' },
    { id: 'beauty_skincare', nameZh: '美妆个护', nameEn: 'Beauty' },
    { id: 'fashion-style', nameZh: '服饰时尚', nameEn: 'Fashion' },
    { id: 'tech-electronics', nameZh: '数码家电', nameEn: 'Tech & Digital' },
    { id: 'food-drinks', nameZh: '美食饮品', nameEn: 'Food & Drinks' },
    { id: 'fitness-sports', nameZh: '运动健身', nameEn: 'Fitness & Sports' },
    { id: 'home-lifestyle', nameZh: '居家生活', nameEn: 'Home & Living' },
    { id: 'pet-lifestyle', nameZh: '萌宠生活', nameEn: 'Pets' },
  ]),
  skills: Object.freeze([
    { id: 'all', nameZh: '全部', nameEn: 'All' },
    { id: 'ugc-testimonial', nameZh: 'UGC 种草', nameEn: 'UGC' },
    { id: 'video-ads', nameZh: '视频广告', nameEn: 'Video Ads' },
    { id: 'product-showcase', nameZh: '产品展示', nameEn: 'Showcase' },
    { id: 'storytelling', nameZh: '故事分镜', nameEn: 'Storytelling' },
    { id: 'voice-audio', nameZh: '配音与音频', nameEn: 'Voice & Audio' },
    { id: 'image-static', nameZh: '静态图像', nameEn: 'Images' },
  ]),
})

/**
 * 共享文案与操作提示字典（严格字面值锁定，零自由发挥）
 */
export const SHARED_I18N_SPEC = Object.freeze({
  primaryTabs: {
    featured: '精选',
    assets: '资产库',
    inspiration: '灵感库',
    products: '商品库',
    trending: '爆款趋势',
    skills: 'Skills',
  },
  primaryTabsEn: {
    featured: 'Featured',
    assets: 'Assets',
    inspiration: 'Inspiration',
    products: 'Products',
    trending: 'Trending',
    skills: 'Skills',
  },
  actions: {
    fullscreen: '全屏',
    exitFullscreen: '退出全屏',
    collapse: '收起',
    upload: '上传',
    addProduct: '添加商品',
    clearSearch: '清除搜索',
    retry: '重试',
  },
  actionsEn: {
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit Fullscreen',
    collapse: 'Collapse',
    upload: 'Upload',
    addProduct: 'Add Product',
    clearSearch: 'Clear Search',
    retry: 'Retry',
  },
  searchPlaceholder: '搜索素材',
  searchPlaceholderEn: 'Search assets',
  empty: {
    featured: '暂无精选',
    assets: '暂无资产',
    inspiration: '暂无灵感',
    products: '暂无商品',
    trending: '暂无爆款',
    skills: '暂无技能',
    search: '无匹配结果',
    error: '加载失败',
  },
  emptyEn: {
    featured: 'No featured items',
    assets: 'No assets',
    inspiration: 'No inspiration',
    products: 'No products',
    trending: 'No trending items',
    skills: 'No skills',
    search: 'No matches found',
    error: 'Failed to load',
  },
})

/**
 * 校验主库 Tab 是否在白名单中
 * @param {string} tabId
 * @returns {boolean}
 */
export function isValidPrimaryTab(tabId) {
  return SHARED_PRIMARY_TABS.some((tab) => tab.id === tabId)
}

/**
 * 获取主库 Tab 的本地化名称
 * @param {string} tabId
 * @param {boolean} [isEn=false]
 * @returns {string}
 */
export function getPrimaryTabTitle(tabId, isEn = false) {
  const dict = isEn ? SHARED_I18N_SPEC.primaryTabsEn : SHARED_I18N_SPEC.primaryTabs
  return dict[tabId] || tabId
}

/**
 * 获取指定主库 Tab 对应的二级分类列表
 * @param {string} tabId
 * @returns {readonly { id: string, nameZh: string, nameEn: string }[]}
 */
export function getSubCategoriesForTab(tabId) {
  return SHARED_SUB_CATEGORIES[tabId] || Object.freeze([])
}
