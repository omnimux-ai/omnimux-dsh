/**
 * 客观自动化评估执行器 (Automated Evaluation Engine)
 * 依据 standards.mjs 中的量表，对生成的短视频交付物进行综合评分
 */

import { GROUND_TRUTH_RUBRIC } from './standards.mjs';

export function evaluateVideoSpec(videoSpec, productProfile) {
  const scores = {};
  const feedback = [];

  // 1. 评估 Hook 留存力 (0-3s)
  const firstShot = videoSpec.storyboard[0];
  let hookScore = 100;
  if (!firstShot || firstShot.duration !== '3s') {
    hookScore -= 20;
    feedback.push('[Hook缺陷] 首分镜时长偏离黄金 3 秒基准');
  }
  const badIntroWords = ['大家好', '欢迎收看', '今天我们来看', 'hello'];
  if (badIntroWords.some(w => firstShot.dialogue.includes(w))) {
    hookScore = 20;
    feedback.push('[Hook红线] 开篇出现寒暄打招呼废话');
  }
  scores.hookRetention = Math.max(hookScore, 0);

  // 2. 评估视听分镜节奏 (Pacing)
  let pacingScore = 100;
  if (videoSpec.storyboard.length < 3 || videoSpec.storyboard.length > 6) {
    pacingScore -= 30;
    feedback.push('[节奏缺陷] 分镜数量不符合 15-30 秒短视频标准 3-6 拍结构');
  }
  scores.pacingDensity = Math.max(pacingScore, 0);

  // 3. 评估 I2V 指令可演度 (I2V Executability)
  let i2vScore = 100;
  const i2vText = videoSpec.i2vMotionPrompt;
  // 仅在正向要求说话、对白、口播时拦截，允许声明 "NO talking", "NO voiceover"
  if (/(?:must speak|talking lines|voiceover lines|对镜头说话|张嘴念台词)/i.test(i2vText)) {
    i2vScore -= 50;
    feedback.push('[I2V严重缺陷] 画面角色包含张嘴说话指令，存在严重口型崩坏风险');
  }
  if (!i2vText.toLowerCase().includes('camera movement') || !i2vText.toLowerCase().includes('action')) {
    i2vScore -= 30;
    feedback.push('[I2V缺陷] 缺失明确运镜或动作因果指令');
  }
  scores.i2vExecutability = Math.max(i2vScore, 0);

  // 4. 评估商业事实与单一 CTA 安全性
  let factScore = 100;
  const lastShot = videoSpec.storyboard[videoSpec.storyboard.length - 1];
  if (!lastShot.dialogue || lastShot.dialogue.length < 5) {
    factScore -= 25;
    feedback.push('[转化缺陷] 结尾缺少明确行动号召 CTA');
  }
  scores.factSafety = Math.max(factScore, 0);

  // 加权综合总分
  const totalScore = Math.round(
    scores.hookRetention * GROUND_TRUTH_RUBRIC.hookRetention.weight +
    scores.pacingDensity * GROUND_TRUTH_RUBRIC.pacingDensity.weight +
    scores.i2vExecutability * GROUND_TRUTH_RUBRIC.i2vExecutability.weight +
    scores.factSafety * GROUND_TRUTH_RUBRIC.factSafety.weight
  );

  return {
    productId: productProfile.id,
    productName: productProfile.name,
    targetAudience: videoSpec.targetAudience,
    subScores: scores,
    totalScore,
    isPassed: totalScore >= 85,
    feedback: feedback.length > 0 ? feedback : ['各项指标均完美命中爆款标准'],
  };
}
