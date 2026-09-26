/**
 * 以内容创意为中枢的社媒爆款生成与动态技能决策引擎 (Creative-Centric Engine)
 * 核心职责：
 * 1. 管理三大数据底座：创意模板 (结构/钩子/风格)、成熟 Skill (规范/上下文)、灵感库 (验证框架)
 * 2. 创意组合与多维评分矩阵 (目标契合/前3秒吸睛/产品因果/执行难度)
 * 3. 负向排重与正交发散算法 (实现同一单品输出 100+ 绝不雷同的爆款)
 * 4. 基于成熟 Skill 规范的参考素材动态裁决器 (拒绝死板硬套，智能裁决单图/首尾帧/视频参考/纯文本)
 */

import fs from 'fs';
import path from 'path';

// ==========================================
// 数据底座一：流行创意模板库 (Creative Templates)
// ==========================================
export const CREATIVE_TEMPLATES = [
  {
    id: 'tpl_pain_rescue',
    name: '极速痛点抢救与尴尬反转',
    structure: '0-3s 极具共鸣的灾难/尴尬现场 -> 3-8s 意外拿出小巧解药极速化解 -> 8-13s 蜕变从容并给出极具诱惑的购买理由',
    hookArchetypes: [
      { id: 'hk_embarrass_crisis', type: '社交尴尬预警', template: '如果你经常在 {scene} 遇到 {pain}，求你千万别再带整瓶了！' },
      { id: 'hk_loss_aversion', type: '负向损失厌恶', template: '上次眼睁睁看着一瓶上千块的 {fragile_item} 碎在地上，我直接心疼到失眠...' },
    ],
    visualStyles: ['生活手持纪实感 (POV Handheld)', '情绪共鸣冷暖对比调'],
    bestFitGoals: ['direct_conversion', 'problem_solving'],
  },
  {
    id: 'tpl_extreme_durability',
    name: '硬核暴力破坏与极端耐用实测',
    structure: '0-3s 挑衅式视觉破坏动作 (如踩踏/高空跌落) -> 3-8s 毫发无损特写解构与密封测试 -> 8-13s 暴力推荐与性价比绝杀',
    hookArchetypes: [
      { id: 'hk_visual_shock', type: '破坏性动作冲击', template: '从三米高扔下来、用力狂踩，真的不会漏一滴吗？' },
      { id: 'hk_doubt_challenge', type: '逆向质疑打脸', template: '9块9包邮的金属喷雾瓶，到底是不是智商税？今天当场拆给你看！' },
    ],
    visualStyles: ['工业粗粝感 (Industrial Raw)', '高帧率慢动作冲击 (High-speed Macro)'],
    bestFitGoals: ['direct_conversion', 'viral_virality'],
  },
  {
    id: 'tpl_sensory_asmr',
    name: '沉浸式解压 ASMR 与极简美学',
    structure: '0-3s 极近距离清脆金属碰撞/按压音 -> 3-8s 液体快速充装与微雾喷涌的治愈画面 -> 8-13s 质感收纳与静谧高级感收尾',
    hookArchetypes: [
      { id: 'hk_pure_sensory', type: '纯感官强刺激', template: '戴上耳机，听听这个世界上最治愈的喷雾声音...' },
      { id: 'hk_aesthetic_minimal', type: '极简视觉强迫症', template: '把 100ml 庞然大物浓缩进 5ml 的极致秩序感。' },
    ],
    visualStyles: ['极简无印风 (Clean Minimalist)', '微距高光光影质感 (Studio Macro Lighting)'],
    bestFitGoals: ['brand_seeding', 'aesthetic_lifestyle'],
  },
  {
    id: 'tpl_gift_anti_trap',
    name: '直男送礼反差与闺蜜避坑探秘',
    structure: '0-3s 送礼被吐槽的啼笑皆非瞬间 -> 3-8s 聪明女孩教你小预算送出大牌高奢感 -> 8-13s 满分情绪价值与限时抄底福利',
    hookArchetypes: [
      { id: 'hk_relationship_contrast', type: '亲密关系反差', template: '男生千万别再送整瓶香水了！她不喜欢味道你俩都尴尬！' },
      { id: 'hk_smart_hack', type: '聪明省钱秘籍', template: '不到一杯奶茶钱，让她每天换一种大牌香气，还能随身带！' },
    ],
    visualStyles: ['明快生活剧场感 (Bright Lifestyle Comedy)', '轻喜剧抓拍风'],
    bestFitGoals: ['gift_season', 'direct_conversion'],
  },
];

// ==========================================
// 数据底座二：灵感库真实验证框架 (Inspiration Pool)
// ==========================================
export const INSPIRATION_FRAMEWORKS = [
  {
    id: 'insp_tiktok_viral_edc',
    platform: 'tiktok',
    category: 'EDC / Travel Hacks',
    provenMetrics: { avgWatchRatio: 0.68, shareRate: 0.082, conversionRate: 0.038 },
    keyInsight: '通过极速动作对比（大瓶笨重 vs 小瓶轻巧）创造前 3 秒不可逆的视觉落差。',
  },
  {
    id: 'insp_xiaohongshu_commute',
    platform: 'xiaohongshu',
    category: '职场通勤精致感',
    provenMetrics: { avgWatchRatio: 0.61, collectRate: 0.124, conversionRate: 0.025 },
    keyInsight: '强调“随时补香不尴尬”的情绪价值，弱化买卖感，强化职场自律形象。',
  },
  {
    id: 'insp_reels_luxury_macro',
    platform: 'instagram_reels',
    category: 'High-end Beauty Aesthetics',
    provenMetrics: { avgWatchRatio: 0.72, shareRate: 0.095, conversionRate: 0.019 },
    keyInsight: '电影级逆光微雾粒子与金属哑光质感，激发高级审美与自发分享欲。',
  },
];

// ==========================================
// 数据底座三：成熟 Skill 上下文规范 (Skill Context)
// ==========================================
export const SKILL_CONTEXT = {
  name: 'viral-video-replication',
  methodology: {
    brief: '定位用户商业目标、受众心理痛点与不可抗拒价值',
    treatment: '以导演与制片人心法，规划情绪波形、视听节奏与因果动作链',
    script: '字词级精确分镜、视觉动作与独立解耦台词轨',
    materialDirection: '根据画面动作复杂度与形态转换需求，动态裁决素材参考范式',
  },
};

// 角色画像池 (UGC Personas 丰富扩容池，支撑单品持续衍生数十上百种爆款)
export const PERSONA_POOL = [
  { id: 'flight_attendant', name: '频繁跨国出行的国际空姐', tag: '安检合规/机舱极度干燥/随身免税补香' },
  { id: 'metro_commuter', name: '早晚高峰挤地铁的外企通勤白领', tag: '包内杂乱/大瓶易碎/午休约会急救' },
  { id: 'straight_guy_gift', name: '情人节挑选礼物怕踩雷的直男', tag: '大牌整瓶太贵/怕对方不喜欢/小样组合高性价比' },
  { id: 'gym_fitness_bro', name: '每天泡健身房的硬核运动达人', tag: '暴汗后体味/运动包易被压爆/耐摔防漏需求' },
  { id: 'college_student', name: '预算有限爱探索的大学女生', tag: '买不起几十瓶大牌/合伙分装/每天换香水' },
  { id: 'minimalist_geek', name: '追求极致轻量化 EDC 的科技极客', tag: '厌恶笨重冗余/精密机械密封控/极简主义' },
  { id: 'night_club_girl', name: '周末酒吧夜店社交的年轻女孩', tag: '昏暗灯光/包包极小/洗手间快速补香社交' },
  { id: 'bride_to_be', name: '筹备浪漫婚礼的备婚准新娘', tag: '伴手礼定制/仪式前快速补香/不弄脏婚纱' },
  { id: 'outdoor_camper', name: '周末户外露营徒步的背包客', tag: '极轻负重/驱蚊液香水混装/耐摔防磕碰' },
  { id: 'perfume_collector', name: '拥有上百瓶高定香水的资深香评人', tag: '大牌原瓶舍不得带/随身盲测/多香叠喷' },
  { id: 'rideshare_driver', name: '全职网约车司机与差评恐惧者', tag: '车内异味/乘客敏感/一喷极速净化' },
  { id: 'high_school_teacher', name: '讲台站立一整天的年轻高中老师', tag: '粉笔灰与汗水/下课3秒清新/学生不反感' },
];

// ==========================================
// 核心逻辑 1：创意组合生成器 (Creative Synthesizer)
// ==========================================
export function synthesizeCreativeOptions(product, userIntent, historyStore = { history_records: [] }) {
  const { platform = 'tiktok', marketingGoal = 'direct_conversion', stylePreference } = userIntent;
  const usedFingerprints = new Set(
    (historyStore.history_records || []).map(r => `${r.template_id || ''}::${r.persona || ''}`)
  );

  const candidates = [];

  for (const tpl of CREATIVE_TEMPLATES) {
    for (const persona of PERSONA_POOL) {
      const fingerprint = `${tpl.id}::${persona.name}`;
      const isUsed = usedFingerprints.has(fingerprint);

      // 提取最佳匹配的灵感框架
      const matchedInsp = INSPIRATION_FRAMEWORKS.find(i => i.platform === platform) || INSPIRATION_FRAMEWORKS[0];
      const hookObj = tpl.hookArchetypes[0];

      // 生成定制 Hook
      const generatedHook = hookObj.template
        .replace('{scene}', persona.tag.split('/')[0])
        .replace('{pain}', persona.tag.split('/')[1] || '香水碎掉')
        .replace('{fragile_item}', '玻璃香水瓶');

      candidates.push({
        templateId: tpl.id,
        templateName: tpl.name,
        persona: persona.name,
        personaTag: persona.tag,
        structure: tpl.structure,
        generatedHook,
        hookType: hookObj.type,
        visualStyle: tpl.visualStyles[0],
        matchedInspiration: matchedInsp.id,
        isUsedInHistory: isUsed,
      });
    }
  }

  return candidates;
}

// ==========================================
// 核心逻辑 2：创意多维评分矩阵 (Creative Scoring Matrix)
// ==========================================
export function scoreCreativeCandidate(candidate, product, userIntent) {
  const { marketingGoal = 'direct_conversion', platform = 'tiktok' } = userIntent;
  let goalFit = 80;
  let hookStrength = 85;
  let productLinkage = 90;
  let feasibility = 85;

  // 1. 目标契合度评分
  const tpl = CREATIVE_TEMPLATES.find(t => t.id === candidate.templateId);
  if (tpl && tpl.bestFitGoals.includes(marketingGoal)) {
    goalFit += 15;
  }

  // 2. 前 3 秒吸睛度评估 (针对不同平台)
  if (platform === 'tiktok' && candidate.templateId === 'tpl_extreme_durability') {
    hookStrength += 12; // 破坏性动作在 TikTok 完播率极高
  } else if (platform === 'xiaohongshu' && candidate.templateId === 'tpl_sensory_asmr') {
    hookStrength += 10; // ASMR 与极简视觉在小红书互动率极高
  } else if (candidate.templateId === 'tpl_pain_rescue') {
    hookStrength += 8; // 经典痛点反转普适性强
  }

  // 3. 产品因果深度
  if (candidate.persona.includes('直男') && candidate.templateId === 'tpl_gift_anti_trap') {
    productLinkage += 8;
  } else if (candidate.persona.includes('空姐') || candidate.persona.includes('白领')) {
    productLinkage += 7;
  }

  // 4. 执行可行度
  if (candidate.templateId === 'tpl_extreme_durability') {
    feasibility -= 5; // 破坏实测对物理碰撞动作有一定要求
  }

  const totalScore = Math.round(
    goalFit * 0.3 + hookStrength * 0.3 + productLinkage * 0.25 + feasibility * 0.15
  );

  return {
    ...candidate,
    scores: {
      totalScore,
      goalFit,
      hookStrength,
      productLinkage,
      feasibility,
    },
  };
}

// ==========================================
// 核心逻辑 3：防重与负向空间排重器 (Anti-Repetition Arbitrator)
// ==========================================
export function filterAndRankCreatives(candidates, historyStore = { history_records: [] }, limit = 10) {
  const usedPersonas = new Set((historyStore.history_records || []).map(r => r.persona));
  const usedTemplates = new Set((historyStore.history_records || []).map(r => r.template_id));
  const usedHooks = new Set((historyStore.history_records || []).map(r => r.hook_topic));

  // 计算与历史的“创意距离 (Creative Distance)”：
  // 严格硬性降权：已用人设扣 100 分（硬拦截），已用模板扣 25 分
  const evaluated = candidates.map(c => {
    let penalty = 0;
    const notes = [];
    if (usedPersonas.has(c.persona)) {
      penalty += 100;
      notes.push(`人设 [${c.persona}] 已在历史中产生过(硬排除)`);
    }
    if (usedHooks.has(c.generatedHook)) {
      penalty += 100;
      notes.push(`Hook [${c.generatedHook}] 历史完全重合(硬排除)`);
    }
    if (usedTemplates.has(c.templateId)) {
      penalty += 25;
      notes.push(`模板结构 [${c.templateName}] 历史已有相似款`);
    }

    const adjustedScore = Math.max(0, c.scores.totalScore - penalty);
    return {
      ...c,
      adjustedScore,
      antiRepetitionStatus: penalty === 0 ? '全新正交创新' : (penalty < 100 ? '模板复用但人设全新' : '严重重合拒绝'),
      divergenceNotes: notes.length > 0 ? notes.join('; ') : '与历史记录完全异构',
    };
  });

  // 按调整后的得分从高到低排序，优先保证新颖度与契合度兼备
  evaluated.sort((a, b) => b.adjustedScore - a.adjustedScore);

  return evaluated.slice(0, limit);
}

// ==========================================
// 核心逻辑 4：基于成熟 Skill 规范的参考素材动态裁决器 (Skill Material Arbitrator)
// 拒绝硬编码！由 Skill 针对具体脚本分镜动态判断：到底用单首帧、首尾双帧、视频参考还是纯文本！
// ==========================================
export function arbitrateMaterialRequirements(scriptStoryboard, skillContext = SKILL_CONTEXT) {
  /**
   * 遵循 viral-video-replication 的 Material Direction 准则：
   * 1. 镜头仅包含环境建立、人物神态、静态展示 -> [单图首帧] (Image-to-Video)，保持高保真人脸与光影；
   * 2. 镜头包含强烈的状态蜕变/因果变化 (如：从空到满、从破烂到修复、前后对比) -> [首尾双帧插值] (Start & End Frame)；
   * 3. 镜头包含复杂连续非标动作 (如特技、暴力破坏、特定手势舞蹈) -> [参考视频] (Video Motion Reference)；
   * 4. 镜头纯由宏观光影、流体、烟雾、特效主导，无特定人物固定物 -> [纯文本分镜参数] (Text Prompt with Camera)。
   */

  const segments = scriptStoryboard.segments || [];
  const referenceDecisions = [];
  const requiredAssets = [];

  let needsFirstFrame = false;
  let needsEndFrame = false;
  let needsVideoRef = false;
  let needsProductDetail = false;
  let needsAudioRef = false;

  for (const seg of segments) {
    const actionText = `${seg.action} ${seg.camera || ''}`.toLowerCase();

    // 状态蜕变判定
    const isStateTransformation =
      actionText.includes('注满') ||
      actionText.includes('变色') ||
      actionText.includes('定格至') ||
      actionText.includes('从') && actionText.includes('到');

    // 复杂动作与运镜判定
    const isComplexMotion =
      actionText.includes('高空扔下') ||
      actionText.includes('剧烈') ||
      actionText.includes('暴力') ||
      actionText.includes('穿梭');

    if (isStateTransformation) {
      needsFirstFrame = true;
      needsEndFrame = true;
      referenceDecisions.push({
        timeRange: seg.range,
        decision: '首尾双帧插值 (Start & End Frames)',
        reason: '画面存在明显的物理状态或因果蜕变，双帧锚定能防止扩散模型中间形态崩坏。',
      });
    } else if (isComplexMotion) {
      needsVideoRef = true;
      referenceDecisions.push({
        timeRange: seg.range,
        decision: '动态参考视频 (Video Motion Reference)',
        reason: '动作剧烈或运镜轨迹复杂，单纯靠文字描述无法精确约束运动幅度，需借用运镜骨架切片。',
      });
    } else {
      needsFirstFrame = true;
      referenceDecisions.push({
        timeRange: seg.range,
        decision: '单图首帧驱动 (Single Image-to-Video)',
        reason: '主体为环境建立与细腻神态表现，单首帧给予模型充分微动态空间，避免过多约束僵硬。',
      });
    }

    if (actionText.includes('瓶') || actionText.includes('产品') || actionText.includes('外壳')) {
      needsProductDetail = true;
    }
    if (seg.audioCue || actionText.includes('卡点') || actionText.includes('节奏')) {
      needsAudioRef = true;
    }
  }

  // 汇总最小必要素材集（按需选用，绝非千篇一律）
  if (needsFirstFrame) requiredAssets.push({ slot: '@图片1', kind: 'image_first_frame', desc: '开场环境与角色状态首帧' });
  if (needsProductDetail) requiredAssets.push({ slot: '@图片2', kind: 'image_product_spec', desc: '产品精密结构与外观细节' });
  if (needsEndFrame) requiredAssets.push({ slot: '@图片3', kind: 'image_end_frame', desc: '蜕变结果或终局定格尾帧' });
  if (needsVideoRef) requiredAssets.push({ slot: '@视频1', kind: 'video_motion_ref', desc: '运动轨迹或运镜幅度参考切片' });
  if (needsAudioRef) requiredAssets.push({ slot: '@音频1', kind: 'audio_rhythm_ref', desc: '节拍卡点与转折背景音轨' });

  return {
    arbitratorSkill: skillContext.name,
    referenceDecisions,
    recommendedAssetSlots: requiredAssets,
    summary: `基于 ${skillContext.name} 导演裁决：本创意${needsVideoRef ? '包含高难度动作，需引入【视频参考】' : '动作自然平稳，免除视频参考'}；${needsEndFrame ? '存在状态蜕变，启用【首尾双帧锁定】' : '纯首帧驱动即可'}。`,
  };
}

// ==========================================
// 核心逻辑 5：动态 Prompt 组装器 (Skill-Driven Prompt Assembler)
// 依据裁决结果，组装出轻重得当、不冗余的 Prompt
// ==========================================
export function assembleDynamicPrompt(creative, storyboard, materialPlan) {
  const lines = [];

  // 1. 动态素材绑定 (按需写入，零硬编码)
  lines.push(`【动态多模态参考方案 (由 ${materialPlan.arbitratorSkill} 智能裁决)】`);
  if (materialPlan.recommendedAssetSlots.length === 0) {
    lines.push(`• 纯文字与镜头参数驱动 (无需外部垫片，释放模型原生最高画质)`);
  } else {
    for (const asset of materialPlan.recommendedAssetSlots) {
      lines.push(`• ${asset.slot}：${asset.desc}`);
    }
  }
  lines.push(``);

  // 2. 创意内核与基调
  lines.push(`【创意内核与叙事】`);
  lines.push(`人设与场景：${creative.persona} ｜ 场景定位：${creative.personaTag}`);
  lines.push(`叙事结构：${creative.templateName}（${creative.structure}）`);
  lines.push(`黄金钩子 (0-3s)：${creative.generatedHook}`);
  lines.push(`视觉质感：${creative.visualStyle}`);
  lines.push(``);

  // 3. 动态分时段节拍
  lines.push(`【分镜时段编排】`);
  for (const seg of storyboard.segments) {
    lines.push(`${seg.range}：`);
    lines.push(`  • 画面动作：${seg.action}`);
    lines.push(`  • 运镜机位：${seg.camera}`);
    if (seg.microExpression) {
      lines.push(`  • 神态微表情：${seg.microExpression}`);
    }
  }
  lines.push(``);

  // 4. 行业通用安全守卫
  lines.push(`【视听表现守卫】`);
  lines.push(`• 全程人物禁止口播对白/禁止张嘴说话（情绪与冲突由肢体动作与眼神驱动）；`);
  lines.push(`• 遵循上述素材裁决边界，禁止模型产生不合逻辑的肢体畸变或形态跳跃。`);

  return lines.join('\n');
}
