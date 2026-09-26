/**
 * Seedance 2.5 官方多模态视频提示词契约与编译器
 * 基于字节跳动即梦 Seedance 2.0/2.5 规范及 OmniMux 资产库规范
 */

export const SEEDANCE_CONFIG = {
  modelId: 'seedance-2.5',
  supportedRatios: ['9:16', '16:9', '1:1', '4:3', '3:4'],
  defaultRatio: '9:16',
  durationRange: { min: 4, max: 15, default: 10 },
  maxImages: 9,
  maxVideos: 3,
  maxAudios: 3,
};

// 官方标准运镜术语白名单
export const CAMERA_MOVEMENTS = [
  '慢推镜头 (Slow Push-in)',
  '平滑拉远 (Slow Pull-out)',
  '水平横摇 (Pan Left/Right)',
  '环绕镜头 (Orbit/Arc)',
  '特写下移 (Tilt Down)',
  '微距平移 (Macro Slide)',
  '手持微颤 (Subtle Handheld Breathing)',
];

/**
 * 编译 Seedance 2.5 官方规范 Prompt
 * 遵循「@ 引用语法」+「分时段动作因果」+「静默表演无张嘴崩坏」
 */
export function compileSeedance25Prompt(params) {
  const {
    firstFrameRef = '@图片1',
    productRef = '@图片2',
    subjectDescription,
    timeSegments = [], // [{ range: '0-3秒', action: '', camera: '' }]
    ambientStyle,
    sfxSuggestion,
  } = params;

  const lines = [];

  // 1. 核心引用与前置锁定
  lines.push(`【素材绑定】`);
  lines.push(`${firstFrameRef} 作为首帧，锁定人物与核心场景外观外观真源；`);
  if (productRef) {
    lines.push(`产品外观细节严格参考 ${productRef}。`);
  }
  lines.push(``);

  // 2. 主体与场景基调
  lines.push(`【主体与场景】`);
  lines.push(`${subjectDescription}。`);
  lines.push(`氛围：${ambientStyle}，画质真实自然，反过度锐化与3D塑料感。`);
  lines.push(``);

  // 3. 分时段动作与运镜指令 (核心表演流水线)
  lines.push(`【分时段节拍与运镜】`);
  timeSegments.forEach((seg, idx) => {
    lines.push(`${seg.range}：`);
    lines.push(`  • 表演动作：${seg.action}`);
    lines.push(`  • 镜头运镜：${seg.camera}`);
    if (seg.microExpression) {
      lines.push(`  • 微表情：${seg.microExpression}`);
    }
  });
  lines.push(``);

  // 4. 硬约束守卫 (静默表演原则)
  lines.push(`【硬性守卫】`);
  lines.push(`• 人物始终禁止张嘴说话、禁止口播对白（嘴唇自然轻闭或微抿，纯眼神与动作情绪演进）；`);
  lines.push(`• 动作过渡平滑因果明确，避免突变与肢体畸变；`);
  if (sfxSuggestion) {
    lines.push(`• 音效参考：${sfxSuggestion}。`);
  }

  return lines.join('\n');
}
