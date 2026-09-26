/**
 * Seedance 2.5 细分赛道最小路径端到端验证执行器
 */

import { SAMPLE_BEAUTY_DEVICE, buildSeedancePipeline } from './pipeline.mjs';
import { evaluateSeedanceSpec } from './evaluator.mjs';

console.log('================================================================');
console.log('🎬 Seedance 2.5 爆款短视频脚手架 · 最小路径验证 (Minimal Path)');
console.log('================================================================\n');

console.log(`📌 聚焦细分场景: [美妆护肤/个护小家电 DTC 爆款]`);
console.log(`📦 测试产品: ${SAMPLE_BEAUTY_DEVICE.name} (${SAMPLE_BEAUTY_DEVICE.category})`);
console.log(`🎯 目标受众: ${SAMPLE_BEAUTY_DEVICE.targetAudience}\n`);

// 执行流水线
const pipelineResult = buildSeedancePipeline(SAMPLE_BEAUTY_DEVICE);
const evalResult = evaluateSeedanceSpec(pipelineResult);

console.log('----------------------------------------------------------------');
console.log('1️⃣ 产出物 A: 9:16 关键帧首图 T2I 生图 Prompt (用作 @图片1)');
console.log('----------------------------------------------------------------');
console.log(pipelineResult.firstFrameT2IPrompt + '\n');

console.log('----------------------------------------------------------------');
console.log('2️⃣ 产出物 B: 产品工业细节 T2I 生图 Prompt (用作 @图片2)');
console.log('----------------------------------------------------------------');
console.log(pipelineResult.productT2IPrompt + '\n');

console.log('----------------------------------------------------------------');
console.log('3️⃣ 产出物 C: Seedance 2.5 官方多模态视频直投 Prompt (<<<PROMPT>>>)');
console.log('----------------------------------------------------------------');
console.log(pipelineResult.seedanceVideoPrompt + '\n');

console.log('----------------------------------------------------------------');
console.log('4️⃣ 产出物 D: 独立音频解说口播轨 (TTS/配音专用，与画面解耦)');
console.log('----------------------------------------------------------------');
pipelineResult.audioVoiceover.forEach(vo => {
  console.log(`  • [${vo.time}] ${vo.line}`);
});
console.log('');

console.log('================================================================');
console.log('📊 契约自动化质量评估报告 (Seedance 2.5 Contract Verification)');
console.log('================================================================');
console.log(`• 契约符合度评分: ${evalResult.score} / 100 [${evalResult.isPassed ? '✅ 达标放行' : '❌ 未达标'}]`);
console.log(`• 规则审查反馈: ${evalResult.issues.join('; ')}`);
console.log('================================================================\n');
