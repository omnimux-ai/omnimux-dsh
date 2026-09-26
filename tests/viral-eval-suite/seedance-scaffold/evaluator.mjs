/**
 * Seedance 2.5 提示词契约自动化评估器
 */

export function evaluateSeedanceSpec(pipelineResult) {
  const { seedanceVideoPrompt, firstFrameT2IPrompt } = pipelineResult;
  const issues = [];
  let score = 100;

  // 1. 检验首帧绑定
  if (!seedanceVideoPrompt.includes('@图片1 作为首帧')) {
    score -= 30;
    issues.push('[契约红线] 缺失 "@图片1 作为首帧" 核心锁定声明');
  }

  // 2. 检验分时段节拍
  if (!seedanceVideoPrompt.includes('0–3秒') || !seedanceVideoPrompt.includes('3–8秒')) {
    score -= 25;
    issues.push('[时序缺陷] 缺失标准的 0-3秒、3-8秒 分时段控制');
  }

  // 3. 检验标准运镜
  const cameraWords = ['推镜头', '拉镜头', '横摇', '环绕', '平移', '特写', '微距'];
  const hasCamera = cameraWords.some(w => seedanceVideoPrompt.includes(w));
  if (!hasCamera) {
    score -= 20;
    issues.push('[运镜缺陷] 提示词中未检测到标准运镜词汇');
  }

  // 4. 检验口型安全 (禁止张嘴说话)
  if (/(?<!禁止|不得|严禁)(?:张嘴说话|对镜头说话|念台词|口播对白)/i.test(seedanceVideoPrompt)) {
    score -= 40;
    issues.push('[I2V崩坏红线] 检测到要求角色张嘴说话指令，违反 Seedance 2.5 静默氛围契约');
  }

  // 5. 检验首帧 T2I 提示词完整性
  if (!firstFrameT2IPrompt.includes('9:16') || !firstFrameT2IPrompt.includes('35mm')) {
    score -= 15;
    issues.push('[首帧生图缺陷] T2I 提示词未显式声明 9:16 画幅或专业摄影参数');
  }

  return {
    score: Math.max(score, 0),
    isPassed: score >= 85,
    issues: issues.length > 0 ? issues : ['Seedance 2.5 官方契约 100% 完美对齐'],
  };
}
