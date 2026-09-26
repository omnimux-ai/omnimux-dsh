/**
 * 单品持续爆款突变与负向排重演进引擎 (Anti-Repetition Mutation Engine)
 * 解决“同一产品持续输出几十上百种不同视频”的核心算法
 */

import fs from 'fs';

// 1. UGC 真实角色池 (50+ 细分人设库)
export const PERSONA_POOL = [
  { id: 'flight_attendant', name: '频繁跨国出行的国际空姐', painFocus: '安检随身行李严查液体超标，机舱干燥需随时快速补香' },
  { id: 'straight_guy_gift', name: '情人节挑选礼物怕踩雷的直男', painFocus: '大牌香水整瓶太贵怕女友不喜欢味道，分装小样礼盒性价比极高' },
  { id: 'college_dating', name: '晚自习后临时有重要约会的大学生', painFocus: '图书馆吃完火锅/外卖满身油烟味，需要三秒隐形急救去味' },
  { id: 'gym_fitness_bro', name: '暴汗后需要清新去味的健身达人', painFocus: '运动包被笨重大瓶挤爆，需要耐摔抗压的防爆迷你喷雾' },
  { id: 'luxury_minimalist', name: '追求极简 EDC (Everyday Carry) 的都市极客', painFocus: '厌恶臃肿杂物，只带手机钥匙与一支口红大小的金属小管' },
];

// 2. 云端跨界叙事范式池 (Cloud Archetype Pool)
export const CREATIVE_ARCHETYPES = [
  {
    id: 'airport_security_challenge',
    title: '机场安检硬核过机挑衅流',
    hookAngle: '带大瓶香水被海关当场扔垃圾桶？掏出这个直接丝滑过机！',
    scene: '国际机场安检通道与免税店登机口',
    style: '手持微晃纪实感，节奏明快紧凑',
  },
  {
    id: 'asmr_sensory_unboxing',
    title: '极度舒适沉浸式 ASMR 底部充装流',
    hookAngle: '没有任何多余对白，纯靠金属碰撞与高压云雾的颅内高潮！',
    scene: '深色胡桃木桌面与微距高光工作室',
    style: '极近景微距慢动作，静音沉浸，高质感声效',
  },
  {
    id: 'straight_guy_testing',
    title: '直男暴力破坏极限实测流',
    hookAngle: '从三米高楼扔下、用力狂踩，真的滴水不漏吗？',
    scene: '粗砺水泥地面与户外极限环境',
    style: '高速摄影 60fps 慢动作，工业冷光撞击特写',
  },
];

/**
 * 负向排重与突变决策器 (Negative History Masking)
 */
export function selectNextMutation(productHistory, options = {}) {
  const { targetPlatform = 'tiktok', marketingGoal = 'direct_conversion' } = options;
  const history = productHistory.history_records || [];

  const usedPersonas = new Set(history.map(h => h.persona));
  const usedHooks = new Set(history.map(h => h.hook_topic));

  // 1. 排重过滤：挑选从未在历史中出现过的新角色
  const availablePersonas = PERSONA_POOL.filter(p => !usedPersonas.has(p.name));
  const chosenPersona = availablePersonas.length > 0 ? availablePersonas[0] : PERSONA_POOL[history.length % PERSONA_POOL.length];

  // 2. 排重过滤：挑选从未在历史中出现过的新叙事模型
  const availableArchetypes = CREATIVE_ARCHETYPES.filter(a => !usedHooks.has(a.hookAngle));
  const chosenArchetype = availableArchetypes.length > 0 ? availableArchetypes[0] : CREATIVE_ARCHETYPES[history.length % CREATIVE_ARCHETYPES.length];

  return {
    generationSeq: history.length + 1,
    targetPlatform,
    marketingGoal,
    chosenPersona,
    chosenArchetype,
    exclusionList: {
      excludedPersonas: Array.from(usedPersonas),
      excludedHooks: Array.from(usedHooks),
    },
  };
}
