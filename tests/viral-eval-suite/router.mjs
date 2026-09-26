/**
 * 场景分类与收敛路由器 (Categorical Router)
 * 解决「通用性 vs 控制泛化」矛盾：将任意产品自动收敛至 4 大专精爆款范式
 */

export const ROUTE_DEFINITIONS = {
  pain_contrast: {
    id: 'pain_contrast',
    name: '生活痛点反差流 (Pain & Contrast)',
    targetIndustries: ['DTC电商', '个护家电', '家居日用', '快消美妆'],
    narrativeArchetype: '极端生活翻车瞬间 ➔ 痛点升级 ➔ 戏剧性解题 ➔ 爽感对比',
    toneStyle: '真实生活自然光、高饱和、手机抓拍质感、局部微距特写',
    i2vStyle: '手持轻微呼吸感机位，动作由慌乱剧烈转为优雅松弛',
  },
  dark_tech_efficiency: {
    id: 'dark_tech_efficiency',
    name: '极简深色科技流 (Dark Tech & Efficiency)',
    targetIndustries: ['SaaS工具', 'AI生产力', '开发者软件', '出海B2B'],
    narrativeArchetype: '传统低效荒谬对比 ➔ 一键自动化奇迹 ➔ 终极成效数据展示',
    toneStyle: '深色高对比度、冷色调、极简界面微动、现代高级科技感',
    i2vStyle: '平滑推轨变焦运镜 (Slow Push-in)，手指飞速操作或光影流动，静默压迫感转为释怀',
  },
  hardcore_stress_test: {
    id: 'hardcore_stress_test',
    name: '硬核暴力实测流 (Hardcore Stress Test)',
    targetIndustries: ['3C数码', '耐用硬件', '户外配件', '工业消费品'],
    narrativeArchetype: '挑衅怀疑开局 ➔ 暴力破坏极限实测 ➔ 完好无损震撼揭晓',
    toneStyle: '工业冷光、高速摄影慢动作 (Slow-Mo)、金属飞溅反光、微距受力瞬间',
    i2vStyle: '高速摄影慢动作 60fps 质感，重击瞬间镜头微震，随后平稳慢推特写',
  },
  curiosity_behind_scenes: {
    id: 'curiosity_behind_scenes',
    name: '猎奇内幕揭秘流 (Curiosity & Behind-Scenes)',
    targetIndustries: ['虚拟课程', '商业咨询', '知识IP', '高客单服务'],
    narrativeArchetype: '行业不能说的秘密 ➔ 认知颠覆 ➔ 核心底层逻辑解构',
    toneStyle: '电影级侧逆光、暗调、主观窥探视角、神秘感与权威感交织',
    i2vStyle: '固定机位或缓慢侧滑运镜，人物冷峻神态，道具/文件翻动特写',
  },
};

/**
 * 智能路由判定：根据输入的产品属性与诉求，匹配最佳场景范式
 */
export function routeProductToArchetype(productProfile) {
  const { industry, keywords = [] } = productProfile;
  const kwStr = (keywords.join(' ') + ' ' + (industry || '')).toLowerCase();

  if (kwStr.includes('saas') || kwStr.includes('ai') || kwStr.includes('软件') || kwStr.includes('代码') || kwStr.includes('pdf')) {
    return ROUTE_DEFINITIONS.dark_tech_efficiency;
  }
  if (kwStr.includes('3c') || kwStr.includes('数码') || kwStr.includes('硬件') || kwStr.includes('防摔') || kwStr.includes('户外')) {
    return ROUTE_DEFINITIONS.hardcore_stress_test;
  }
  if (kwStr.includes('课程') || kwStr.includes('咨询') || kwStr.includes('ip') || kwStr.includes('秘密') || kwStr.includes('搞钱')) {
    return ROUTE_DEFINITIONS.curiosity_behind_scenes;
  }
  // 默认兜底为痛点反差流 (适用最广泛的实体消费与电商)
  return ROUTE_DEFINITIONS.pain_contrast;
}
