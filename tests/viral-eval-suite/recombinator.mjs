/**
 * 爆款基因交叉重组引擎 (Viral Recombination Engine)
 * 拒绝固定模板：将短视频拆分为 4 类原子积木，动态排列组合并注入增量变量
 */

// 1. Hook 原子基因库 (前 3 秒注意力钩子)
export const HOOK_PRIMITIVES = [
  {
    id: 'pain_explosion',
    type: '痛点暴击',
    template: '如果你还在[原始低效/错误做法]，赶紧停下！你不仅在浪费钱，还在[最严重后果]！',
    visualCue: '特写崩溃瞬间或翻车事故特写，快速切入情绪特写',
  },
  {
    id: 'counter_intuitive',
    type: '反常识颠覆',
    template: '千万别买[产品品类]！除非你已经无法忍受[核心痛苦体验]…',
    visualCue: '镜头猛烈推近，主体手势做出强烈制止动作，随后画面一转',
  },
  {
    id: 'visual_spectacle',
    type: '极端冲突实测',
    template: '把[产品]扔进[极端严苛环境]，会发生什么？我们实测给你看！',
    visualCue: '破坏性工具或极限测试瞬间特写，极高视觉张力',
  },
  {
    id: 'insider_secrets',
    type: '行业偷窥内幕',
    template: '硅谷/大厂从不公开的内幕：90% 的人都在为[盲区]交智商税…',
    visualCue: '暗调主观窥视视角，手指快速敲击或翻阅绝密文件',
  },
];

// 2. 价值论证骨架基因库 (8-22秒核心段)
export const DELIVERY_PRIMITIVES = [
  {
    id: 'extreme_comparison',
    type: '前后暴击对比 (Before vs After)',
    steps: [
      '镜头左侧/前半段：展示传统繁琐耗时操作（满屏混乱、人物抓狂、秒表疯狂跳动）',
      '镜头右侧/后半段：展示使用该产品的一键极简流（优雅单指轻触、3秒瞬间搞定、人物松弛微笑）',
    ],
  },
  {
    id: 'hardcore_stress_proof',
    type: '暴力实证挑战 (Destruction Proof)',
    steps: [
      '特写镜头：高压碾压/冷冻/划伤极限受力测试过程（60fps 慢动作细节）',
      '微距反打：拿出产品擦拭灰尘，表面完好无损、功能正常运转，震撼反差',
    ],
  },
  {
    id: 'micro_three_steps',
    type: '保姆级极简三步法 (3-Step Simplicity)',
    steps: [
      '第一拍 (3s)：放入/导入原料或文件',
      '第二拍 (5s)：按下核心按钮，特写科技指示灯/光影运转流光',
      '第三拍 (4s)：完美产出呈现，微距展现细节质感',
    ],
  },
];

// 3. 行动转化 CTA 基因库 (最后 3-5 秒)
export const CTA_PRIMITIVES = [
  {
    id: 'binary_debate',
    type: '二元站队争议',
    cue: '你站传统做法还是站这个解法？评论区告诉我',
  },
  {
    id: 'secret_code_lead',
    type: '暗号索取福利',
    cue: '评论区扣“体验”，领取限时内部免费试用名额',
  },
  {
    id: 'urgent_bio_link',
    type: '主页限时直达',
    cue: '首批仅限前 100 名，点击左下角小黄车或个人主页直达',
  },
];

/**
 * 交叉重组执行器：将不同原子积木动态重组，并注入产品与受众变量
 */
export function recombineViralDna(productProfile, route, variationIndex = 0) {
  // 按照变体序号与受众扰动，选定不同的积木组合
  const hook = HOOK_PRIMITIVES[variationIndex % HOOK_PRIMITIVES.length];
  const delivery = DELIVERY_PRIMITIVES[variationIndex % DELIVERY_PRIMITIVES.length];
  const cta = CTA_PRIMITIVES[variationIndex % CTA_PRIMITIVES.length];

  // 增量变量：受众微切口 (不同变体针对不同细分受众)
  const audienceAngles = productProfile.audienceAngles || [
    '高压通勤白领',
    '追求极简效率的技术极客',
    '经常熬夜加班的自由职业者',
  ];
  const chosenAngle = audienceAngles[variationIndex % audienceAngles.length];

  return {
    variationIndex,
    chosenAngle,
    routeId: route.id,
    routeName: route.name,
    assembledDna: {
      hook,
      delivery,
      cta,
    },
  };
}
