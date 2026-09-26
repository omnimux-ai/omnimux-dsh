/**
 * 多模态短视频生成器 (Multi-Modal Script & Prompt Generator)
 * 产出三件套：
 * 1. 5~30秒结构化分镜脚本 (含时间码、视觉描述、口播台词、音效建议)
 * 2. 9:16 关键帧 T2I 生图 Prompt (首帧与核心画面外观)
 * 3. 严格遵循 I2V 契约的生视频动作运镜 Prompt (纯肢体/表情表演，无张嘴对白，防崩坏)
 */

export function generateFullVideoSpec(product, recombinedResult) {
  const { assembledDna, chosenAngle, routeId } = recombinedResult;
  const { hook, delivery, cta } = assembledDna;

  // 1. 组装分镜脚本 (Storyboard Shots)
  const shots = [
    {
      shotId: 1,
      timeRange: '00:00 - 00:03 (0-3s)',
      duration: '3s',
      phase: '黄金Hook破冰',
      visual: `${hook.visualCue}，聚焦于【${chosenAngle}】日常切身经历的痛点场景：${product.corePain}。`,
      dialogue: hook.template
        .replace('[原始低效/错误做法]', product.traditionalFlaw || '传统繁琐手工做法')
        .replace('[最严重后果]', product.severeConsequence || '白白浪费每天2小时')
        .replace('[产品品类]', product.name)
        .replace('[核心痛苦体验]', product.corePain)
        .replace('[产品]', product.name)
        .replace('[极端严苛环境]', '高压测试环境')
        .replace('[盲区]', product.traditionalFlaw || '陈旧工作流'),
      cameraMovement: '快速推镜 (Fast Push-in) 至面部/手部微距特写，手持微颤增强真实感',
      actorEmotion: '焦虑、烦躁或强烈震惊情绪，眼神直视焦点',
      sfx: '低频心跳音效或尖锐刹车音效，瞬间抓耳',
    },
    {
      shotId: 2,
      timeRange: '00:03 - 00:08 (3-8s)',
      duration: '5s',
      phase: '痛点升级与冲突',
      visual: `痛点具象化展示：桌面混乱散落或软件报错弹窗红光，【${chosenAngle}】陷入无法解脱的死循环。`,
      dialogue: `“90%的人试过各种方法，但结果依然是重复折腾、效率归零…”`,
      cameraMovement: '侧面固定机位中景，光影轻微闪烁压迫感',
      actorEmotion: '深深叹气，无奈揉眉心，紧绷压迫氛围',
      sfx: '机械时钟急促倒计时嘀嗒声',
    },
    {
      shotId: 3,
      timeRange: '00:08 - 00:20 (8-20s)',
      duration: '12s',
      phase: '产品降临与破局证明',
      visual: `${delivery.steps[0]}。随后镜头切至【${product.name}】，${delivery.steps[1]}。真实展现核心卖点：${product.coreBenefit}。`,
      dialogue: `“直到换了这个解法——单指轻点，全部流程瞬间全自动闭环，原本2小时的事情现在只要3秒！”`,
      cameraMovement: '平滑滑轨横移 (Smooth Pan) 配合慢动作微距 (Slow-Mo)，高光扫过产品流线',
      actorEmotion: '眉眼舒展，眼神发亮，充满释怀与惊喜的松弛感',
      sfx: '轻柔科技清脆触发音，配合上扬轻快旋律',
    },
    {
      shotId: 4,
      timeRange: '00:20 - 00:28 (20-28s)',
      duration: '8s',
      phase: '行动诱饵与转化CTA',
      visual: `人物端起产出物/展示最终完美效果，镜头切至手机界面，清晰引导评论区互动。`,
      dialogue: `“${cta.cue}。”`,
      cameraMovement: '微仰角半身中景缓缓定格，背景景深虚化',
      actorEmotion: '笃定自信微笑，友好示意手势',
      sfx: '清脆双击叮咚声，短促提示音',
    },
  ];

  // 2. T2I 关键帧生图 Prompt (9:16 竖屏摄影级参考图)
  const t2iPrompt = [
    `vertical 9:16 mobile aspect ratio shot, hyper-realistic candid documentary photography`,
    `A cinematic close-up of a modern adult ${chosenAngle} in authentic daily environment`,
    `natural atmospheric lighting, volumetric soft shadow, visible authentic texture`,
    `focal element: ${product.name}, clean minimalist industrial product aesthetics`,
    `shot on 35mm lens, f/1.8 shallow depth of field, subtle motion blur, crisp foreground focus`,
    `8k resolution, raw color grading, zero 3D-render plastic feel, anti-stock-photo authentic mood`,
  ].join(', ');

  // 3. I2V 图生视频机器指令 (严格遵守无对白口播、纯微动作因果契约)
  const i2vPrompt = [
    `[I2V Directing Contract - Silent Performance Only]`,
    `Action & Pacing: Subject starts with a subtle tense posture, shoulders tight. Within first 1.5s, subject's right hand smoothly reaches forward to interact with the device/interface on desk.`,
    `Camera Movement: Camera begins at medium close-up, gently pushes in 15% closer over 4 seconds, maintaining gentle organic handheld micro-breathing motion.`,
    `Micro-expression: Eyebrows relax from a slight frown into a subtle knowing smirk; lips stay closed naturally (NO talking, NO mouth opening, NO voiceover lip movement).`,
    `Lighting & Ambience: Soft warm edge light caressing the product surface as action finishes; background remains in soft natural bokeh.`,
    `Output duration: 4.0s loopable cut, 60fps cinematic fluidity.`,
  ].join('\n');

  return {
    productId: product.id,
    productName: product.name,
    targetAudience: chosenAngle,
    routeApplied: routeId,
    totalDuration: '28s',
    storyboard: shots,
    keyframeT2IPrompt: t2iPrompt,
    i2vMotionPrompt: i2vPrompt,
  };
}
