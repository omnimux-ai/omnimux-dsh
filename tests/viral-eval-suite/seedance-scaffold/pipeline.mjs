/**
 * Seedance 2.5 多模态视频生成流水线 (Pipeline)
 * 专注细分领域：美妆护肤与个护小家电 (Beauty & Personal Care)
 */

import { compileSeedance25Prompt } from './contract.mjs';

/**
 * 细分产品定义样本：智能冰感微电流面部射频仪
 */
export const SAMPLE_BEAUTY_DEVICE = {
  id: 'beauty_rf_device_001',
  name: 'AuraGlow 智能冰感微电流射频仪',
  category: 'beauty_skincare', // 资产库 18 大行业之一
  targetAudience: '早起面部水肿松弛的熬夜职场女性',
  corePain: '早晨起床脸垮水肿、法令纹加深、普通涂抹护肤品吸收慢见效差',
  coreBenefit: '3秒急冻冰感瞬间消肿，搭配微电流深层提拉紧致下颌线',
  traditionalFlaw: '用冰块敷脸冻伤皮肤或费劲徒手按摩半小时毫无起色',
  pricePoint: '$129 / 限时首发',
};

/**
 * 构建针对 Seedance 2.5 的完整分镜与 Prompt
 */
export function buildSeedancePipeline(product) {
  // 1. 首帧 T2I 生图 Prompt (作为 @图片1，锁定人物与浴室晨间真实光影)
  const firstFrameT2IPrompt = [
    `vertical 9:16 mobile aspect ratio, candid documentary portrait`,
    `A tired 28-year-old Asian businesswoman looking at the bathroom mirror in soft morning daylight`,
    `visible morning facial puffiness around jawline and under-eyes, authentic raw skin texture with natural pores`,
    `wearing minimalist silk loungewear, hair gently clipped back, clean modern minimalist bathroom interior`,
    `subtle reflections on mirror surface, natural volumetric morning light pouring from window`,
    `shot on 35mm cinema lens, f/2.0 shallow depth of field, 8k resolution, authentic cinematography, zero artificial plastic airbrush`,
  ].join(', ');

  // 2. 产品参考图 T2I Prompt (作为 @图片2，锁定产品工业美学)
  const productT2IPrompt = [
    `vertical 9:16 macro product photography`,
    `A sleek ergonomic facial RF beauty device called "${product.name}" resting on dry marble stone`,
    `frosted metallic rose gold finish, titanium alloy massage head with subtle icy LED indicator`,
    `macro water mist beads condensing on cooling surface, clean studio lighting, pristine luxury cosmetics aesthetic`,
  ].join(', ');

  // 3. 编译 Seedance 2.5 官方多模态提示词
  const seedanceVideoPrompt = compileSeedance25Prompt({
    firstFrameRef: '@图片1',
    productRef: '@图片2',
    subjectDescription: `一位熬夜早起的都市女性在晨光浴室中，从困倦水肿状态逐步使用 ${product.name} 完成面部提拉`,
    ambientStyle: `晨间自然冷白光转为温暖柔光，高级简约生活美学`,
    timeSegments: [
      {
        range: '0–3秒 (黄金Hook)',
        action: '人物身体微靠洗手台，抬手用食指背轻轻触碰右脸颊轻微水肿处，手持镜头微颤慢速推近',
        camera: '慢推镜头 (Slow Push-in)，从半身平视缓慢推进至面部 3/4 侧脸特写',
        microExpression: '眉头微微紧蹙，眼神中透露出早晨赶时间但面部状态不佳的烦躁与无助，嘴唇自然闭合',
      },
      {
        range: '3–8秒 (产品介入与动作因果)',
        action: '右手拿起 @图片2 美容仪，冰蓝指示灯亮起，仪器冷导头顺着下颌线由下至上平稳滑动提拉两遍',
        camera: '极近景微距平移 (Macro Slide)，镜头紧密跟随仪器金属头在紧致肌肤上的滑移动作',
        microExpression: '感受到冰感接触时睫毛轻颤，随后眉头瞬间舒展，眼神流露出被瞬间唤醒的惊喜与释怀',
      },
      {
        range: '8–13秒 (高光见证与定格)',
        action: '放下仪器，双手轻抚下颌线两侧做对比，侧颜下颌线轮廓分明上扬，面部水肿明显消退，整个人状态清爽饱满',
        camera: '平滑横移环绕半周 (Orbit 45°)，随后微退定格在自信侧颜，窗外阳光正好洒在透亮发光的肌肤上',
        microExpression: '嘴角浮现从容自信的微笑，笃定点头',
      },
    ],
    sfxSuggestion: '晨间环境轻微水滴声 ➔ 仪器开机清脆滴鸣 ➔ 轻柔低频微电流震颤蜂鸣 ➔ 清脆叮咚提示音',
  });

  // 4. 音频口播文案轨 (与画面完全解耦，交给 TTS 或人声旁白)
  const audioVoiceover = [
    { time: '00:00 - 00:03', line: '“早起脸又垮又肿？千万别再拿冰块瞎折腾冻伤屏障了！”' },
    { time: '00:03 - 00:08', line: '“用这个3秒极冻微电流，顺着下颌线一推，像有一双隐形的手把肉提上去！”' },
    { time: '00:08 - 00:13', line: '“3分钟彻底消肿去疲态，熬大夜也能拥有紧致小V脸。左下角自留同款。”' },
  ];

  return {
    productName: product.name,
    category: product.category,
    firstFrameT2IPrompt,
    productT2IPrompt,
    seedanceVideoPrompt,
    audioVoiceover,
  };
}
